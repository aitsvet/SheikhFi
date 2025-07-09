const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [owner, bob, charlie] = await ethers.getSigners();
  const ownerNickname = "Ali";
  const bobNickname = "Bob";
  const charlieNickname = "Charlie";
  const SheikhFi = await ethers.getContractFactory("SheikhFi");
  const contract = await SheikhFi.deploy(ownerNickname, 60);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  await contract.connect(owner).addInvestor(bob.address, bobNickname, 95);
  await contract.connect(owner).addManager(charlie.address, charlieNickname, 20);
  console.log("SheikhFi deployed to:", contractAddress);
  console.log("Owner:", owner.address, "Nickname:", ownerNickname);
  console.log("Bob (Investor):", bob.address, "Nickname:", bobNickname);
  console.log("Charlie (Manager):", charlie.address, "Nickname:", charlieNickname);

  const artifactPath = path.join(__dirname, 'artifacts/contracts/SheikhFi.sol/SheikhFi.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath));
  const abi = artifact.abi;
  const frontendConfig = {
    contractAddress,
    abi,
    owner: owner.address,
    ownerNickname,
    manager: charlie.address,
    bob: bob.address,
    bobNickname,
    charlieNickname,
  };
  const configPath = path.join(__dirname, 'webapp/src/abi/deployment.json');
  fs.writeFileSync(configPath, JSON.stringify(frontendConfig, null, 2));
  console.log("Deployment info (with ABI) written to webapp/src/abi/deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 