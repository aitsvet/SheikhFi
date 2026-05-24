// Usage:
//   node scripts/faucet.mjs                  # funds DEPLOYER_ADDRESS from .env
//   node scripts/faucet.mjs 0xAddr [0xAddr…] # funds the given addresses
//
// Coinbase CDP base-sepolia ETH drip is ~0.0001 ETH per request, 1/24h/address.

import 'dotenv/config';
import { CdpClient } from '@coinbase/cdp-sdk';
import { ethers } from 'ethers';

const targets = process.argv.slice(2).filter(Boolean);
if (targets.length === 0) {
  if (!process.env.DEPLOYER_ADDRESS) throw new Error('DEPLOYER_ADDRESS missing in .env');
  targets.push(process.env.DEPLOYER_ADDRESS);
}
for (const a of targets) {
  if (!ethers.isAddress(a)) throw new Error(`Not a valid address: ${a}`);
}

const cdp = new CdpClient();
const provider = new ethers.JsonRpcProvider(
  process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
);

for (const address of targets) {
  const before = await provider.getBalance(address);
  console.log(`\n${address}`);
  console.log(`  before:   ${ethers.formatEther(before)} ETH`);
  try {
    const { transactionHash } = await cdp.evm.requestFaucet({
      address,
      network: 'base-sepolia',
      token:   'eth',
    });
    console.log(`  faucet tx: ${transactionHash}`);
    console.log(`  explorer:  https://sepolia.basescan.org/tx/${transactionHash}`);
    await provider.waitForTransaction(transactionHash, 1, 120_000);
    const after = await provider.getBalance(address);
    console.log(`  after:    ${ethers.formatEther(after)} ETH`);
  } catch (e) {
    console.log(`  ERROR:    ${e.shortMessage || e.message || e}`);
  }
}
