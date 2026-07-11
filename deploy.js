const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  const ownerNickname = "Ali";

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Network: ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${owner.address}`);
  const balance = await ethers.provider.getBalance(owner.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  const SheikhFi = await ethers.getContractFactory("SheikhFi");
  // native-ETH denomination; pass a token address here for a stablecoin pool
  const contract = await SheikhFi.deploy(ownerNickname, 60, ethers.ZeroAddress);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const deployBlock = deployTx ? (await deployTx.wait()).blockNumber : null;
  console.log(`SheikhFi deployed to: ${contractAddress} (block ${deployBlock})`);

  const frontendConfig = {
    contractAddress,
    abi: JSON.parse(fs.readFileSync(
      path.join(__dirname, 'artifacts/contracts/SheikhFi.sol/SheikhFi.json'),
    )).abi,
    owner: owner.address,
    ownerNickname,
    network: network.name,
    chainId,
    deployBlock,
  };

  // Local hardhat: seed Bob (investor) + Charlie (manager) using the
  // built-in second/third signers so the demo flow is ready out of the box.
  if (signers.length >= 3) {
    const [, bob, charlie] = signers;
    const bobNickname     = "Bob";
    const charlieNickname = "Charlie";
    await (await contract.connect(owner).addInvestor(bob.address, bobNickname, 95)).wait();
    await (await contract.connect(owner).addManager(charlie.address, charlieNickname, 20)).wait();
    console.log(`Bob (Investor):     ${bob.address}`);
    console.log(`Charlie (Manager):  ${charlie.address}`);
    Object.assign(frontendConfig, {
      manager: charlie.address,
      bob: bob.address,
      bobNickname,
      charlieNickname,
    });
  } else {
    console.log('Single-signer network — skipping addInvestor/addManager.');
    console.log('Use the Council desk in the webapp to onboard partners and operators.');
  }

  // Per-chain snapshot survives deploys to other networks; deployment.json
  // is the active copy the webapp imports. Switch with scripts/use-deployment.mjs.
  const json = JSON.stringify(frontendConfig, null, 2);
  const chainPath = path.join(__dirname, `webapp/src/abi/deployments/${chainId}.json`);
  fs.mkdirSync(path.dirname(chainPath), { recursive: true });
  fs.writeFileSync(chainPath, json);
  const configPath = path.join(__dirname, 'webapp/src/abi/deployment.json');
  fs.writeFileSync(configPath, json);
  console.log(`Wrote ${chainPath} and ${configPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
