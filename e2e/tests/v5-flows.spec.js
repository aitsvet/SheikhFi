// v5-flows walk: drives the Shari'ah-audit mechanics end-to-end against the
// containerised hardhat chain with an injected-provider shim (the cryptosarf
// console.spec pattern, simplified: hardhat node auto-unlocks its accounts,
// so eth_sendTransaction routes straight to the node — no keys in the spec).
//
//   scaffold (direct RPC):  setBoard(#9) · deposits · submit (charlie)
//                           · certify (board) · vote (bob) · partial return
//                           · revenue on hand
//   UI as bob (partner):    notice exit → 48h warp → exit (v5 §2)
//   UI as ali (owner):      Treasury net-loss preview → write-off (v5 §1)
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeFunctionData, parseEther } from 'viem';

const RPC = process.env.CHAIN_RPC_URL ?? 'http://chain:8545';
const CONTRACT = JSON.parse(
  readFileSync('/app/webapp/src/abi/deployment.json', 'utf8'),
).contractAddress;

const ABI = [
  { type: 'function', name: 'setBoard', inputs: [{ type: 'address' }], outputs: [] },
  { type: 'function', name: 'submitProposal', inputs: [{ type: 'string' }, { type: 'uint256' }, { type: 'string' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'certifyProposal', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'approveProposal', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'depositFunds', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'returnPrincipal', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'receiveRevenue', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
];

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

async function sendAs(from, fn, args, valueWei = 0n) {
  const hash = await rpc('eth_sendTransaction', [{
    from, to: CONTRACT,
    data: encodeFunctionData({ abi: ABI, functionName: fn, args }),
    value: '0x' + valueWei.toString(16),
  }]);
  for (let i = 0; i < 50; i++) {
    const r = await rpc('eth_getTransactionReceipt', [hash]);
    if (r) {
      if (r.status !== '0x1') throw new Error(`${fn} reverted`);
      return hash;
    }
    await new Promise((s) => setTimeout(s, 200));
  }
  throw new Error(`${fn}: no receipt`);
}

async function shimPage(context, address) {
  const page = await context.newPage();
  await page.addInitScript(({ address, rpcUrl }) => {
    // Wall-clock shim: the Desk's notice countdown compares Date.now with the
    // chain timestamp; after evm_increaseTime the spec bumps this offset
    // (localStorage survives the reload).
    const _now = Date.now.bind(Date);
    Date.now = () => _now() + Number(localStorage.getItem('e2e:timeOffset') || 0);
    let id = 1;
    const call = async (method, params) => {
      const res = await fetch(rpcUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params: params ?? [] }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    };
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method, params }) => {
        switch (method) {
          case 'eth_accounts':
          case 'eth_requestAccounts': return [address];
          case 'eth_chainId': return '0x7a69'; // 31337
          case 'wallet_switchEthereumChain':
          case 'wallet_addEthereumChain': return null;
          case 'eth_sendTransaction':
            return call('eth_sendTransaction', [{ ...params[0], from: address }]);
          default: return call(method, params);
        }
      },
      on: () => {}, removeListener: () => {},
    };
  }, { address, rpcUrl: RPC });
  return page;
}


/// The shim exposes eth_accounts immediately, so the webapp may auto-connect
/// and never render a Connect button — click it only if it exists.
async function connectAs(page, roleLabel) {
  const idCard = page.locator('.identity-card');
  const btn = page.getByRole('button', { name: /Connect/i }).first();
  try { await btn.waitFor({ state: 'visible', timeout: 5_000 }); await btn.click(); }
  catch { /* auto-connected */ }
  await expect(idCard).toContainText(roleLabel, { timeout: 30_000 });
}

test('v5 flows: notice exit + netting write-off through the UI', async ({ browser }) => {
  test.setTimeout(300_000);
  const accounts = await rpc('eth_accounts');
  const [ali, bob, charlie] = accounts;
  const board = accounts[9];

  // ---------------- scaffold: board separation + a fundable project
  await sendAs(ali, 'setBoard', [board]);
  await sendAs(ali, 'depositFunds', [parseEther('10')], parseEther('10'));
  await sendAs(bob, 'depositFunds', [parseEther('20')], parseEther('20'));
  await sendAs(charlie, 'submitProposal', ['V5 walk project', parseEther('10'), 'docs', 1n]);
  await sendAs(board, 'certifyProposal', [0n]);
  await sendAs(bob, 'approveProposal', [0n]); // 20/30 ≈ 66.7% ≥ 60% → funded
  // partial recovery + revenue on hand → the write-off will NET it (v5 §1)
  await sendAs(charlie, 'returnPrincipal', [0n, parseEther('4')], parseEther('4'));
  await sendAs(charlie, 'receiveRevenue', [0n, parseEther('3')], parseEther('3'));

  const context = await browser.newContext();

  // ---------------- UI as bob (partner): notice → warp → exit
  const pageBob = await shimPage(context, bob);
  await pageBob.goto('/');
  await connectAs(pageBob, 'Bob');

  await pageBob.getByRole('button', { name: /desk/i }).first().click();
  await pageBob.getByRole('button', { name: /Give exit notice/ }).click();
  await expect(pageBob.getByRole('button', { name: /Notice armed/ })).toBeVisible({ timeout: 30_000 });

  await rpc('evm_increaseTime', [48 * 3600 + 60]);
  await rpc('evm_mine', []);
  await pageBob.evaluate(() => localStorage.setItem('e2e:timeOffset', String((48 * 3600 + 60) * 1000)));
  await pageBob.reload();
  await pageBob.getByRole('button', { name: /desk/i }).first().click();
  await pageBob.locator('input[type="number"]').nth(1).fill('1');
  await pageBob.getByRole('button', { name: /^Exit stake$/ }).click();
  await expect(pageBob.getByText(/Exit — done/)).toBeVisible({ timeout: 30_000 });
  await pageBob.close();

  // ---------------- UI as ali (owner): net-loss preview + write-off
  const pageAli = await shimPage(context, ali);
  await pageAli.goto('/');
  await connectAs(pageAli, 'Ali');

  await pageAli.getByRole('button', { name: /Treasury/ }).click();
  const option = pageAli.locator('select option', { hasText: 'V5 walk project' });
  // gross gap is 6 ETH, but 3 ETH of undistributed revenue nets first (v5 §1)
  await expect(option).toContainText('3 ETH net loss', { timeout: 30_000 });
  await expect(option).toContainText('revenue nets first');
  const sel = pageAli.locator('select')
    .filter({ has: pageAli.locator('option', { hasText: 'V5 walk project' }) });
  await sel.selectOption({ index: 1 }); // index 0 is the disabled placeholder
  await pageAli.getByRole('button', { name: /^Write off$/ }).click();
  await expect(pageAli.getByText(/Write off — done/)).toBeVisible({ timeout: 30_000 });
});
