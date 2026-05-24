import 'dotenv/config';
import { CdpClient } from '@coinbase/cdp-sdk';
import { ethers } from 'ethers';

const address = process.env.DEPLOYER_ADDRESS;
const rpcUrl  = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

if (!address) throw new Error('DEPLOYER_ADDRESS missing in .env');

const cdp = new CdpClient();
const provider = new ethers.JsonRpcProvider(rpcUrl);

const before = await provider.getBalance(address);
console.log(`Address:     ${address}`);
console.log(`Balance:     ${ethers.formatEther(before)} ETH (before)`);

console.log(`Requesting ETH from CDP faucet on base-sepolia…`);
const { transactionHash } = await cdp.evm.requestFaucet({
  address,
  network: 'base-sepolia',
  token:   'eth',
});
console.log(`Faucet tx:   ${transactionHash}`);
console.log(`Explorer:    https://sepolia.basescan.org/tx/${transactionHash}`);

console.log(`Waiting for confirmation…`);
await provider.waitForTransaction(transactionHash, 1, 120_000);
const after = await provider.getBalance(address);
console.log(`Balance:     ${ethers.formatEther(after)} ETH (after)`);
