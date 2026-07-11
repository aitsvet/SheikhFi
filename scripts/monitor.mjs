// Live tail of the SheikhFi contract on Base Sepolia.
// Polls every 5s and prints any state change vs the previous snapshot.

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'node:fs';

const dep = JSON.parse(fs.readFileSync('webapp/src/abi/deployment.json'));
const rpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const provider = new ethers.JsonRpcProvider(rpc);
const c = new ethers.Contract(dep.contractAddress, dep.abi, provider);

// Tracked addresses come from the contract itself + any extra addresses
// passed on the CLI (`node scripts/monitor.mjs 0xA 0xB`). Owner is always
// included. Investors and managers are read live so the monitor stays
// useful as the membership grows.
async function initTracked() {
  const out = { owner: dep.owner };
  for (const a of process.argv.slice(2)) out[a.toLowerCase().slice(0, 8)] = a;
  try {
    const ic = Number(await c.getInvestorCount());
    for (let i = 0; i < ic; i++) {
      const a = await c.investorAddresses(i);
      if (a.toLowerCase() !== dep.owner.toLowerCase()) out['inv-' + a.slice(2, 6)] = a;
    }
    const mc = Number(await c.getManagerCount());
    for (let i = 0; i < mc; i++) {
      const a = await c.managerAddresses(i);
      out['mgr-' + a.slice(2, 6)] = a;
    }
  } catch (e) { console.log('warn: could not enumerate members:', e.shortMessage || e.message); }
  return out;
}
const tracked = await initTracked();

const fmt = (wei) => ethers.formatEther(wei);
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);

let prev = null;

async function snapshot() {
  const [count, totalFunds, freeFunds] = await Promise.all([
    c.getProposalCount(),
    c.totalFunds(),
    c.freeFunds(),
  ]);
  const proposals = [];
  for (let i = 0; i < Number(count); i++) {
    const p = await c.proposals(i);
    let appr = [];
    try { appr = await c.getApprovers(i); } catch { /* empty */ }
    proposals.push({
      i,
      manager: p[0],
      desc: p[1],
      req: p[2],
      secured: p[3],
      rcv: p[4],
      pay: p[5],
      approvers: appr,
    });
  }
  const balances = {};
  for (const [k, a] of Object.entries(tracked)) {
    balances[k] = await provider.getBalance(a);
  }
  const withdrawable = {};
  for (const [k, a] of Object.entries(tracked)) {
    withdrawable[k] = await c.withdrawable(a);
  }
  return { totalFunds, freeFunds, proposals, balances, withdrawable };
}

function diff(a, b) {
  const lines = [];
  if (a.totalFunds !== b.totalFunds) lines.push(`totalFunds: ${fmt(a.totalFunds)} → ${fmt(b.totalFunds)} ETH`);
  if (a.freeFunds  !== b.freeFunds)  lines.push(`freeFunds:  ${fmt(a.freeFunds)} → ${fmt(b.freeFunds)} ETH`);

  if (a.proposals.length !== b.proposals.length) {
    for (let i = a.proposals.length; i < b.proposals.length; i++) {
      const p = b.proposals[i];
      lines.push(`+proposal #${i} by ${short(p.manager)}  "${p.desc}"  req=${fmt(p.req)} ETH`);
    }
  }
  for (let i = 0; i < Math.min(a.proposals.length, b.proposals.length); i++) {
    const pa = a.proposals[i], pb = b.proposals[i];
    if (pa.secured !== pb.secured && pb.secured) lines.push(`*proposal #${i} SECURED`);
    if (pa.approvers.length !== pb.approvers.length) {
      const added = pb.approvers.slice(pa.approvers.length);
      lines.push(`*proposal #${i} approver +${added.map(short).join(', ')} (${pb.approvers.length} total)`);
    }
    if (pa.rcv !== pb.rcv) lines.push(`*proposal #${i} revenueReceived ${fmt(pa.rcv)} → ${fmt(pb.rcv)} ETH`);
    if (pa.pay !== pb.pay) lines.push(`*proposal #${i} revenuePayed    ${fmt(pa.pay)} → ${fmt(pb.pay)} ETH`);
  }
  for (const k of Object.keys(b.balances)) {
    if (a.balances[k] !== b.balances[k]) lines.push(`balance(${k}): ${fmt(a.balances[k])} → ${fmt(b.balances[k])} ETH`);
  }
  for (const k of Object.keys(b.withdrawable)) {
    if (a.withdrawable[k] !== b.withdrawable[k]) lines.push(`withdrawable(${k}): ${fmt(a.withdrawable[k])} → ${fmt(b.withdrawable[k])} ETH`);
  }
  return lines;
}

console.log(`Contract: ${dep.contractAddress}  via ${rpc}`);
console.log(`Tracked: ${Object.entries(tracked).map(([k, a]) => `${k}=${short(a)}`).join(' ')}`);
console.log(`Polling every 5s. Ctrl+C to stop.\n`);

while (true) {
  try {
    const now = await snapshot();
    if (!prev) {
      console.log(`[${new Date().toISOString().slice(11,19)}] init: ${now.proposals.length} proposal(s), totalFunds=${fmt(now.totalFunds)}, freeFunds=${fmt(now.freeFunds)}`);
      for (const p of now.proposals) {
        console.log(`  #${p.i} by ${short(p.manager)} "${p.desc}" req=${fmt(p.req)} secured=${p.secured} approvers=${p.approvers.length} rcv=${fmt(p.rcv)} paid=${fmt(p.pay)}`);
      }
    } else {
      const d = diff(prev, now);
      if (d.length) {
        const ts = new Date().toISOString().slice(11,19);
        for (const l of d) console.log(`[${ts}] ${l}`);
      }
    }
    prev = now;
  } catch (e) {
    console.log(`[err] ${e.shortMessage || e.message || e}`);
  }
  await new Promise(r => setTimeout(r, 5_000));
}
