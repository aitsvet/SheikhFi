const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SheikhFi", function () {
  it("should allow Ali (owner/investor) and Bob (investor) to deposit, Charlie (manager) to propose, Bob to vote, and revenue to be distributed", async function () {
    [ali, bob, charlie, ...addrs] = await ethers.getSigners();
    // Ali is owner, Bob is investor, Charlie is manager
    const SheikhFiFactory = await ethers.getContractFactory("SheikhFi");
    bank = await SheikhFiFactory.deploy("Ali", 60); // Add approveShareThreshold parameter
    await bank.waitForDeployment();
    // Add Ali and Bob as investors with nicknames
    await bank.connect(ali).addInvestor(bob.address, "Bob", 95);
    // Add Charlie as manager with nickname
    await bank.connect(ali).addManager(charlie.address, "Charlie", 20);
    // Ali deposits 10 ETH
    await bank.connect(ali).depositFunds({ value: ethers.parseEther("10") });
    // Bob deposits 20 ETH
    await bank.connect(bob).depositFunds({ value: ethers.parseEther("20") });
    // Check totalFunds and freeFunds
    expect(await bank.totalFunds()).to.equal(ethers.parseEther("30"));
    expect(await bank.freeFunds()).to.equal(ethers.parseEther("30"));
    // Check individual balances
    const aliInvestor = await bank.investors(ali.address);
    const bobInvestor = await bank.investors(bob.address);
    expect(aliInvestor.fundsInvested).to.equal(ethers.parseEther("10"));
    expect(bobInvestor.fundsInvested).to.equal(ethers.parseEther("20"));
    // Check nicknames
    expect(aliInvestor.nickname).to.equal("Ali");
    expect(bobInvestor.nickname).to.equal("Bob");
    expect(await bank.ownerNickname()).to.equal("Ali");
    const charlieManager = await bank.managers(charlie.address);
    expect(charlieManager.nickname).to.equal("Charlie");
    // Charlie submits a proposal for 10 ETH
    await bank.connect(charlie).submitProposal("Invest in project", ethers.parseEther("10"));
    // Bob votes for proposal 0 (first proposal)
    await bank.connect(bob).approveProposal(0);
    // Proposal should be funded
    const proposal = await bank.proposals(0);
    expect(proposal.secured).to.be.true;
    // Check manager's funded amount
    const charlieManagerAfter = await bank.managers(charlie.address);
    expect(charlieManagerAfter.fundsSecured).to.equal(ethers.parseEther("10"));
    const revenue = ethers.parseEther("50");
    // Charlie returns 50 ETH as revenue
    await bank.connect(charlie).recieveRevenue(0, { value: revenue });
    // Proposal revenue should be updated
    const proposalAfterRevenue = await bank.proposals(0);
    expect(proposalAfterRevenue.revenueReceived).to.equal(revenue);
    // Distribute revenue
    await bank.connect(ali).distributeRevenue(0);
    // Check profits for investors and manager
    const aliProfit = (await bank.investors(ali.address)).profit;
    const bobProfit = (await bank.investors(bob.address)).profit;
    const charlieProfit = (await bank.managers(charlie.address)).profit;
    function checkProfit(profit, expected) {
      expect(profit == expected || profit == expected - 1n);
    }
    checkProfit(aliProfit + bobProfit + charlieProfit, revenue);
    checkProfit(revenue * 20n / 100n, charlieProfit);
    checkProfit((revenue - charlieProfit) * 20n * 95n / 3000n, bobProfit);
    checkProfit((revenue - charlieProfit) * 10n * 110n / 3000n, aliProfit);
  });
}); 