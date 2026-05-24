// Usage:
//   node scripts/onboard.mjs investor 0xYourAddr "Nickname" 50
//   node scripts/onboard.mjs manager  0xYourAddr "Nickname" 20
//
// `profitRate` is a percent (0-100): for an investor it is the share of
// gross profit they keep before the owner takes the rest; for a manager
// it is the share of project revenue they keep before investors are paid.

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'node:fs';

const [, , kindRaw, addr, nickname, rateRaw] = process.argv;
const kind = (kindRaw || '').toLowerCase();
const rate = Number(rateRaw);

if (!['investor', 'manager'].includes(kind) || !ethers.isAddress(addr || '')
    || !nickname || !Number.isFinite(rate) || rate < 0 || rate > 100) {
  console.error('Usage: node scripts/onboard.mjs <investor|manager> <0xAddress> <nickname> <profitRate 0-100>');
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync('webapp/src/abi/deployment.json'));
const rpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

const provider = new ethers.JsonRpcProvider(rpc);
const wallet   = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(deployment.contractAddress, deployment.abi, wallet);

console.log(`Network:       ${deployment.network} (chainId ${deployment.chainId})`);
console.log(`Contract:      ${deployment.contractAddress}`);
console.log(`Council (you): ${wallet.address}`);
console.log(`${kind === 'investor' ? 'Partner' : 'Operator'}:       ${addr}  "${nickname}"  ${rate}%`);

const method = kind === 'investor' ? 'addInvestor' : 'addManager';
const tx = await contract[method](addr, nickname, rate);
console.log(`Tx sent:       ${tx.hash}`);
console.log(`Explorer:      https://sepolia.basescan.org/tx/${tx.hash}`);
const rcpt = await tx.wait();
console.log(`Confirmed in block ${rcpt.blockNumber} (gas ${rcpt.gasUsed.toString()}).`);
