// One-shot listing of a deployment's members and balances.
// Usage:
//   node scripts/members.mjs                # active deployment (webapp/src/abi/deployment.json)
//   node scripts/members.mjs 0xContract...  # any deployment at that address (same-shape ABI)
//
// Prints owner/board/asset, then every investor (nickname, rate, invested,
// profit, withdrawable, ETH balance) and manager (nickname, rate, secured,
// profit, collateral, withdrawable, ETH balance). Used when migrating
// participants onto a fresh deployment and for quick ops checks.

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'node:fs';

const dep = JSON.parse(fs.readFileSync('webapp/src/abi/deployment.json'));
const address = process.argv[2] || dep.contractAddress;
const rpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const provider = new ethers.JsonRpcProvider(rpc);
const c = new ethers.Contract(address, dep.abi, provider);

const fmt = (wei) => ethers.formatEther(wei);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// public RPCs rate-limit bursts of eth_call — pace the calls and retry with
// backoff; ethers buries the actual reason in e.info.error
const isRateLimit = (e) =>
  /rate limit|-32016/i.test(`${e?.message} ${e?.info?.error?.message} ${e?.info?.error?.code}`);
const call = async (fn) => {
  await sleep(120);
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt >= 4 || !isRateLimit(e)) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
};
const opt = async (fn) => { try { return await call(fn); } catch { return null; } };

console.log(`Contract: ${address}  via ${rpc}`);
console.log(`Owner:    ${await call(() => c.owner())}  ("${await call(() => c.ownerNickname())}")`);
const board = await opt(() => c.board());
if (board !== null) console.log(`Board:    ${board}`);
const asset = await opt(() => c.asset());
if (asset !== null) console.log(`Asset:    ${asset === ethers.ZeroAddress ? 'native ETH' : asset}`);
console.log(`Funds:    total ${fmt(await call(() => c.totalFunds()))} / free ${fmt(await call(() => c.freeFunds()))} · threshold ${await call(() => c.approveShareThreshold())}%\n`);

const ic = Number(await call(() => c.getInvestorCount()));
console.log(`Investors (${ic}):`);
for (let i = 0; i < ic; i++) {
  const a = await call(() => c.investorAddresses(i));
  const inv = await call(() => c.investors(a));
  const w = await call(() => c.withdrawable(a));
  const bal = await call(() => provider.getBalance(a));
  console.log(`  ${a}  "${inv.nickname}"  rate=${inv.profitRate}%  invested=${fmt(inv.fundsInvested)}  profit=${fmt(inv.profit)}  withdrawable=${fmt(w)}  balance=${fmt(bal)}`);
}

const mc = Number(await call(() => c.getManagerCount()));
console.log(`Managers (${mc}):`);
for (let i = 0; i < mc; i++) {
  const a = await call(() => c.managerAddresses(i));
  const m = await call(() => c.managers(a));
  const w = await call(() => c.withdrawable(a));
  const bal = await call(() => provider.getBalance(a));
  const coll = m.collateral !== undefined ? `  collateral=${fmt(m.collateral)}` : '';
  console.log(`  ${a}  "${m.nickname}"  rate=${m.profitRate}%  secured=${fmt(m.fundsSecured)}  profit=${fmt(m.profit)}${coll}  withdrawable=${fmt(w)}  balance=${fmt(bal)}`);
}
