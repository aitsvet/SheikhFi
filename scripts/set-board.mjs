// Usage:
//   node scripts/set-board.mjs 0xBoardAddr [gasEth]
//
// Points the active deployment's sharia board at a separate address (v5 §5:
// certification reverts "Board is owner" until this is done) and optionally
// tops the board wallet up with gas for certify/releaseTranche/slash calls.
// Owner-signed (DEPLOYER_PRIVATE_KEY).

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'node:fs';

const [, , addr, gasEth] = process.argv;
if (!ethers.isAddress(addr || '')) {
  console.error('Usage: node scripts/set-board.mjs <0xBoardAddress> [gasEth]');
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync('webapp/src/abi/deployment.json'));
const rpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(deployment.contractAddress, deployment.abi, wallet);

console.log(`Contract: ${deployment.contractAddress} (${deployment.network})`);
console.log(`Board  →  ${addr}`);
const tx = await contract.setBoard(addr);
await tx.wait();
console.log(`setBoard: ${tx.hash}`);

if (gasEth) {
  const t2 = await wallet.sendTransaction({ to: addr, value: ethers.parseEther(gasEth) });
  await t2.wait();
  console.log(`gas top-up ${gasEth} ETH: ${t2.hash}`);
}
console.log(`board now: ${await contract.board()}`);
