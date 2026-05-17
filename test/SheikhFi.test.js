const { expect } = require("chai");
const { ethers } = require("hardhat");

// ---------- fixtures ----------

async function deployFixture() {
  const [ali, bob, charlie, dave] = await ethers.getSigners();
  const SheikhFi = await ethers.getContractFactory("SheikhFi");
  const bank = await SheikhFi.deploy("Ali", 60);
  await bank.waitForDeployment();
  return { bank, ali, bob, charlie, dave };
}

async function deployWithParticipants() {
  const f = await deployFixture();
  await f.bank.connect(f.ali).addInvestor(f.bob.address, "Bob", 95);
  await f.bank.connect(f.ali).addManager(f.charlie.address, "Charlie", 20);
  return f;
}

async function deployWithDeposits() {
  const f = await deployWithParticipants();
  await f.bank.connect(f.ali).depositFunds({ value: ethers.parseEther("10") });
  await f.bank.connect(f.bob).depositFunds({ value: ethers.parseEther("20") });
  return f;
}

async function deployWithProposal() {
  const f = await deployWithDeposits();
  await f.bank.connect(f.charlie).submitProposal("Invest in project", ethers.parseEther("10"));
  return f;
}

async function deployWithFundedProposal() {
  const f = await deployWithProposal();
  // Bob has 20/30 = 66.7% > 60% threshold → funds the proposal
  await f.bank.connect(f.bob).approveProposal(0);
  return f;
}

async function deployWithRevenue() {
  const f = await deployWithFundedProposal();
  const revenue = ethers.parseEther("50");
  await f.bank.connect(f.charlie).receiveRevenue(0, { value: revenue });
  return { ...f, revenue };
}

async function deployWithDistribution() {
  const f = await deployWithRevenue();
  await f.bank.connect(f.ali).distributeRevenue(0);
  return f;
}

// ---------- tests ----------

describe("SheikhFi", function () {

  describe("Happy path (full lifecycle)", function () {
    it("deployment sets owner and initialises owner as investor", async function () {
      const { bank, ali } = await deployFixture();
      expect(await bank.owner()).to.equal(ali.address);
      expect(await bank.ownerNickname()).to.equal("Ali");
      expect(await bank.isInvestor(ali.address)).to.be.true;
    });

    it("withdrawable balances credited after distribution", async function () {
      const { bank, ali, bob, charlie, revenue } = await deployWithDistribution();
      const charlieW = await bank.withdrawable(charlie.address);
      const aliW     = await bank.withdrawable(ali.address);
      const bobW     = await bank.withdrawable(bob.address);
      expect(charlieW).to.be.gt(0n);
      expect(aliW).to.be.gt(0n);
      expect(bobW).to.be.gt(0n);
      // Charlie's withdrawable = proposal funding (10 ETH via approveProposal)
      //                        + manager fee    (10 ETH via distributeRevenue)
      // Ali + Bob together hold the investor revenue (40 ETH)
      // Grand total = 60 ETH = revenue (50) + proposal funding (10)
      const proposalFunding = ethers.parseEther("10");
      expect(charlieW + aliW + bobW).to.equal(revenue + proposalFunding);
    });

    it("withdraw transfers correct ETH to each participant", async function () {
      const { bank, ali, bob, charlie } = await deployWithDistribution();
      const charlieW = await bank.withdrawable(charlie.address);
      const aliW     = await bank.withdrawable(ali.address);
      const bobW     = await bank.withdrawable(bob.address);
      await expect(bank.connect(charlie).withdraw()).to.changeEtherBalance(charlie, charlieW);
      await expect(bank.connect(ali).withdraw()).to.changeEtherBalance(ali, aliW);
      await expect(bank.connect(bob).withdraw()).to.changeEtherBalance(bob, bobW);
    });

    it("withdrawable is zeroed after withdrawal", async function () {
      const { bank, ali, bob, charlie } = await deployWithDistribution();
      await bank.connect(charlie).withdraw();
      await bank.connect(ali).withdraw();
      await bank.connect(bob).withdraw();
      expect(await bank.withdrawable(charlie.address)).to.equal(0n);
      expect(await bank.withdrawable(ali.address)).to.equal(0n);
      expect(await bank.withdrawable(bob.address)).to.equal(0n);
    });

    it("profit accounting fields match withdrawable amounts", async function () {
      const { bank, ali, bob, charlie, revenue } = await deployWithDistribution();
      const aliProfit     = (await bank.investors(ali.address)).profit;
      const bobProfit     = (await bank.investors(bob.address)).profit;
      const charlieProfit = (await bank.managers(charlie.address)).profit;
      expect(charlieProfit).to.equal(revenue * 20n / 100n);
      expect(aliProfit + bobProfit + charlieProfit).to.equal(revenue);
    });
  });

  describe("Access control", function () {
    it("addInvestor reverts for non-owner", async function () {
      const { bank, bob, charlie } = await deployFixture();
      await expect(bank.connect(bob).addInvestor(charlie.address, "Charlie", 50))
        .to.be.revertedWith("Not owner");
    });

    it("addManager reverts for non-owner", async function () {
      const { bank, bob, charlie } = await deployFixture();
      await expect(bank.connect(bob).addManager(charlie.address, "Charlie", 20))
        .to.be.revertedWith("Not owner");
    });

    it("depositFunds reverts for non-investor", async function () {
      const { bank, dave } = await deployFixture();
      await expect(bank.connect(dave).depositFunds({ value: ethers.parseEther("1") }))
        .to.be.revertedWith("Not investor");
    });

    it("submitProposal reverts for non-manager", async function () {
      const { bank, bob } = await deployWithDeposits();
      await expect(bank.connect(bob).submitProposal("Bad", ethers.parseEther("1")))
        .to.be.revertedWith("Not manager");
    });

    it("approveProposal reverts for non-investor", async function () {
      const { bank, dave } = await deployWithProposal();
      await expect(bank.connect(dave).approveProposal(0))
        .to.be.revertedWith("Not investor");
    });

    it("distributeRevenue reverts for non-owner", async function () {
      const { bank, bob } = await deployWithRevenue();
      await expect(bank.connect(bob).distributeRevenue(0))
        .to.be.revertedWith("Not owner");
    });
  });

  describe("approveProposal", function () {
    it("does not fund below threshold", async function () {
      const { bank, ali } = await deployWithProposal();
      // Ali has 10/30 = 33% < 60% threshold
      await bank.connect(ali).approveProposal(0);
      expect((await bank.proposals(0)).secured).to.be.false;
    });

    it("funds when threshold is reached", async function () {
      const { bank, bob } = await deployWithProposal();
      // Bob has 20/30 = 66.7% > 60%
      await bank.connect(bob).approveProposal(0);
      expect((await bank.proposals(0)).secured).to.be.true;
    });

    it("rejects double-vote", async function () {
      const { bank, ali } = await deployWithProposal();
      await bank.connect(ali).approveProposal(0);
      await expect(bank.connect(ali).approveProposal(0))
        .to.be.revertedWith("Already voted");
    });

    it("rejects vote on already-funded proposal", async function () {
      const { bank, ali, bob } = await deployWithProposal();
      await bank.connect(bob).approveProposal(0);
      await expect(bank.connect(ali).approveProposal(0))
        .to.be.revertedWith("Already funded");
    });

    it("emits ProposalFunded with correct args when funded", async function () {
      const { bank, bob, charlie } = await deployWithProposal();
      await expect(bank.connect(bob).approveProposal(0))
        .to.emit(bank, "ProposalFunded")
        .withArgs(0, charlie.address, ethers.parseEther("10"));
    });

    it("credits manager withdrawable on funding", async function () {
      const { bank, bob, charlie } = await deployWithProposal();
      await bank.connect(bob).approveProposal(0);
      expect(await bank.withdrawable(charlie.address)).to.equal(ethers.parseEther("10"));
    });

    it("decrements freeFunds on funding", async function () {
      const { bank, bob } = await deployWithProposal();
      const freeBefore = await bank.freeFunds();
      await bank.connect(bob).approveProposal(0);
      expect(await bank.freeFunds()).to.equal(freeBefore - ethers.parseEther("10"));
    });
  });

  describe("distributeRevenue — pull payments & dust sweep", function () {
    it("BadReceiver investor does not block distribution", async function () {
      const { bank, ali, bob, charlie, dave } = await deployWithDeposits();

      const BadReceiver = await ethers.getContractFactory("BadReceiver");
      const bad = await BadReceiver.deploy();
      const badAddr = await bad.getAddress();

      await bank.connect(ali).addInvestor(badAddr, "BadActor", 90);
      await bad.deposit(await bank.getAddress(), { value: ethers.parseEther("5") });

      await bank.connect(charlie).submitProposal("Test", ethers.parseEther("5"));
      await bank.connect(bob).approveProposal(0);
      await bank.connect(charlie).receiveRevenue(0, { value: ethers.parseEther("15") });

      // Must not revert even though BadReceiver would revert on ETH push
      await expect(bank.connect(ali).distributeRevenue(0)).to.not.be.reverted;

      // BadReceiver's share was credited, not lost
      expect(await bank.withdrawable(badAddr)).to.be.gt(0n);

      // Other investors can still withdraw
      await expect(bank.connect(bob).withdraw()).to.not.be.reverted;
      await expect(bank.connect(ali).withdraw()).to.not.be.reverted;
    });

    it("dust from integer division goes entirely to owner", async function () {
      // 3 equal-share investors, 0% manager fee → any rounding lands with owner
      const { bank, ali, bob, charlie, dave } = await deployFixture();
      await bank.connect(ali).addInvestor(bob.address, "Bob", 90);
      await bank.connect(ali).addInvestor(dave.address, "Dave", 90);
      await bank.connect(ali).addManager(charlie.address, "Charlie", 0);

      await bank.connect(ali).depositFunds({ value: ethers.parseEther("1") });
      await bank.connect(bob).depositFunds({ value: ethers.parseEther("1") });
      await bank.connect(dave).depositFunds({ value: ethers.parseEther("1") });

      await bank.connect(charlie).submitProposal("Test", ethers.parseEther("1"));
      // ali + bob together = 66.7% > 60%, fund the proposal
      await bank.connect(ali).approveProposal(0);
      await bank.connect(bob).approveProposal(0);
      await bank.connect(charlie).receiveRevenue(0, { value: ethers.parseEther("1") });
      await bank.connect(ali).distributeRevenue(0);

      const aliW  = await bank.withdrawable(ali.address);
      const bobW  = await bank.withdrawable(bob.address);
      const daveW = await bank.withdrawable(dave.address);
      // No wei leaked — total must equal exactly 1 ETH
      expect(aliW + bobW + daveW).to.equal(ethers.parseEther("1"));
    });

    it("second distribute on same proposal reverts (CEI guard)", async function () {
      const { bank, ali } = await deployWithRevenue();
      await bank.connect(ali).distributeRevenue(0);
      await expect(bank.connect(ali).distributeRevenue(0))
        .to.be.revertedWith("No revenue");
    });

    it("reverts with No revenue when nothing new to distribute", async function () {
      const { bank, ali } = await deployWithFundedProposal();
      await expect(bank.connect(ali).distributeRevenue(0))
        .to.be.revertedWith("No revenue");
    });
  });

  describe("withdraw", function () {
    it("reverts when balance is zero", async function () {
      const { bank, dave } = await deployFixture();
      await expect(bank.connect(dave).withdraw())
        .to.be.revertedWith("Nothing to withdraw");
    });

    it("emits Withdrawn event with correct args", async function () {
      const { bank, charlie } = await deployWithFundedProposal();
      const amount = await bank.withdrawable(charlie.address);
      await expect(bank.connect(charlie).withdraw())
        .to.emit(bank, "Withdrawn")
        .withArgs(charlie.address, amount);
    });

    it("zeroes the balance before transferring (re-entry guard)", async function () {
      const { bank, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).withdraw();
      expect(await bank.withdrawable(charlie.address)).to.equal(0n);
    });

    it("second withdraw reverts immediately after first", async function () {
      const { bank, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).withdraw();
      await expect(bank.connect(charlie).withdraw())
        .to.be.revertedWith("Nothing to withdraw");
    });
  });

});
