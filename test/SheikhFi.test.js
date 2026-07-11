const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// ---------- fixtures ----------

async function deployFixture() {
  const [ali, bob, charlie, dave] = await ethers.getSigners();
  const SheikhFi = await ethers.getContractFactory("SheikhFi");
  const bank = await SheikhFi.deploy("Ali", 60, ethers.ZeroAddress);
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
  await f.bank.connect(f.ali).depositFunds(ethers.parseEther("10"), { value: ethers.parseEther("10") });
  await f.bank.connect(f.bob).depositFunds(ethers.parseEther("20"), { value: ethers.parseEther("20") });
  return f;
}

async function deployWithProposal() {
  const f = await deployWithDeposits();
  await f.bank.connect(f.charlie).submitProposal("Invest in project", ethers.parseEther("10"), "", 1);
  await f.bank.connect(f.ali).certifyProposal(0);
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
  await f.bank.connect(f.charlie).receiveRevenue(0, revenue, { value: revenue });
  // v2: profit can only be distributed once the capital is home
  await f.bank.connect(f.charlie).returnPrincipal(0, ethers.parseEther("10"), { value: ethers.parseEther("10") });
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
      // investor revenue is lazily accrued — must settle before reading withdrawable
      await bank.settle(ali.address);
      await bank.settle(bob.address);
      const charlieW = await bank.withdrawable(charlie.address);
      const aliW     = await bank.withdrawable(ali.address);
      const bobW     = await bank.withdrawable(bob.address);
      expect(charlieW).to.be.gt(0n);
      expect(aliW).to.be.gt(0n);
      expect(bobW).to.be.gt(0n);
      // Charlie: proposal funding (10 ETH) + manager fee (10 ETH)
      // Ali + Bob: investor revenue (40 ETH), split by share and rate
      // Grand total ≈ 60 ETH (≤ a few wei may stay unclaimable from accumulator truncation)
      const proposalFunding = ethers.parseEther("10");
      const total = charlieW + aliW + bobW;
      expect(total).to.be.lte(revenue + proposalFunding);
      expect(total).to.be.gte(revenue + proposalFunding - 20n);
    });

    it("withdraw transfers correct ETH to each participant", async function () {
      const { bank, ali, bob, charlie } = await deployWithDistribution();
      await bank.settle(ali.address);
      await bank.settle(bob.address);
      const charlieW = await bank.withdrawable(charlie.address);
      const aliW     = await bank.withdrawable(ali.address);
      const bobW     = await bank.withdrawable(bob.address);
      await expect(bank.connect(charlie).withdraw()).to.changeEtherBalance(charlie, charlieW);
      await expect(bank.connect(ali).withdraw()).to.changeEtherBalance(ali, aliW);
      await expect(bank.connect(bob).withdraw()).to.changeEtherBalance(bob, bobW);
    });

    it("withdrawable is zeroed after withdrawal", async function () {
      const { bank, ali, bob, charlie } = await deployWithDistribution();
      // settle first so withdraw() _accrue is a no-op and causes no late credits
      await bank.settle(ali.address);
      await bank.settle(bob.address);
      await bank.connect(charlie).withdraw();
      await bank.connect(ali).withdraw();
      await bank.connect(bob).withdraw();
      expect(await bank.withdrawable(charlie.address)).to.equal(0n);
      expect(await bank.withdrawable(ali.address)).to.equal(0n);
      expect(await bank.withdrawable(bob.address)).to.equal(0n);
    });

    it("profit accounting fields match withdrawable amounts", async function () {
      const { bank, ali, bob, charlie, revenue } = await deployWithDistribution();
      await bank.settle(ali.address);
      await bank.settle(bob.address);
      const aliProfit     = (await bank.investors(ali.address)).profit;
      const bobProfit     = (await bank.investors(bob.address)).profit;
      const charlieProfit = (await bank.managers(charlie.address)).profit;
      expect(charlieProfit).to.equal(revenue * 20n / 100n);
      const investorSum = aliProfit + bobProfit + charlieProfit;
      expect(investorSum).to.be.lte(revenue);
      expect(investorSum).to.be.gte(revenue - 20n);
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
      await expect(bank.connect(dave).depositFunds(ethers.parseEther("1"), { value: ethers.parseEther("1") }))
        .to.be.revertedWith("Not investor");
    });

    it("submitProposal reverts for non-manager", async function () {
      const { bank, bob } = await deployWithDeposits();
      await expect(bank.connect(bob).submitProposal("Bad", ethers.parseEther("1"), "", 1))
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

    it("receiveRevenue reverts for non-manager", async function () {
      const { bank, ali } = await deployWithFundedProposal();
      await expect(bank.connect(ali).receiveRevenue(0, ethers.parseEther("1"), { value: ethers.parseEther("1") }))
        .to.be.revertedWith("Not proposal manager");
    });
  });

  describe("Input validation", function () {
    it("addInvestor: reverts for zero address", async function () {
      const { bank, ali } = await deployFixture();
      await expect(bank.connect(ali).addInvestor(ethers.ZeroAddress, "Zero", 50))
        .to.be.revertedWith("Zero address");
    });

    it("addInvestor: reverts when profitRate exceeds 100", async function () {
      const { bank, ali, dave } = await deployFixture();
      await expect(bank.connect(ali).addInvestor(dave.address, "Dave", 101))
        .to.be.revertedWith("Profit rate > 100");
    });

    it("addInvestor: reverts for empty nickname", async function () {
      const { bank, ali, dave } = await deployFixture();
      await expect(bank.connect(ali).addInvestor(dave.address, "", 50))
        .to.be.revertedWith("Empty nickname");
    });

    it("addInvestor: reverts when already investor", async function () {
      const { bank, ali, bob } = await deployWithParticipants();
      await expect(bank.connect(ali).addInvestor(bob.address, "Bob2", 50))
        .to.be.revertedWith("Already investor");
    });

    it("addManager: reverts for zero address", async function () {
      const { bank, ali } = await deployFixture();
      await expect(bank.connect(ali).addManager(ethers.ZeroAddress, "Zero", 10))
        .to.be.revertedWith("Zero address");
    });

    it("addManager: reverts when profitRate exceeds 100", async function () {
      const { bank, ali, dave } = await deployFixture();
      await expect(bank.connect(ali).addManager(dave.address, "Dave", 101))
        .to.be.revertedWith("Profit rate > 100");
    });

    it("addManager: reverts for empty nickname", async function () {
      const { bank, ali, dave } = await deployFixture();
      await expect(bank.connect(ali).addManager(dave.address, "", 10))
        .to.be.revertedWith("Empty nickname");
    });

    it("addManager: reverts when already manager", async function () {
      const { bank, ali, charlie } = await deployWithParticipants();
      await expect(bank.connect(ali).addManager(charlie.address, "Charlie2", 10))
        .to.be.revertedWith("Already manager");
    });

    it("depositFunds: reverts when msg.value is 0", async function () {
      const { bank, ali } = await deployFixture();
      await expect(bank.connect(ali).depositFunds(0, { value: 0 }))
        .to.be.revertedWith("No value");
    });

    it("submitProposal: reverts for empty description", async function () {
      const { bank, charlie } = await deployWithDeposits();
      await expect(bank.connect(charlie).submitProposal("", ethers.parseEther("1"), "", 1))
        .to.be.revertedWith("Empty description");
    });

    it("submitProposal: reverts when requiredFunds exceeds freeFunds", async function () {
      const { bank, charlie } = await deployWithDeposits();
      await expect(bank.connect(charlie).submitProposal("Too big", ethers.parseEther("31"), "", 1))
        .to.be.revertedWith("Insufficient funds");
    });

    it("receiveRevenue: reverts when msg.value is 0", async function () {
      const { bank, charlie } = await deployWithFundedProposal();
      await expect(bank.connect(charlie).receiveRevenue(0, 0, { value: 0 }))
        .to.be.revertedWith("No value");
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

    it("reverts with No investors when the pool is empty (no division by zero)", async function () {
      // Zero-fund proposal on an empty pool: the vote must revert cleanly,
      // not panic on approveShare * 100 / totalFunds.
      const { bank, ali, charlie } = await deployFixture();
      await bank.connect(ali).addManager(charlie.address, "Charlie", 0);
      await bank.connect(charlie).submitProposal("Zero-fund test", 0, "", 1);
      await bank.connect(ali).certifyProposal(0);
      await expect(bank.connect(ali).approveProposal(0))
        .to.be.revertedWith("No investors");
    });

    it("emits ProposalApproved with the running approve share", async function () {
      const { bank, ali } = await deployWithProposal();
      // Ali has 10 ETH of 30 total
      await expect(bank.connect(ali).approveProposal(0))
        .to.emit(bank, "ProposalApproved")
        .withArgs(0, ali.address, ethers.parseEther("10"));
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
      const { bank, ali, bob, charlie } = await deployWithDeposits();

      const BadReceiver = await ethers.getContractFactory("BadReceiver");
      const bad = await BadReceiver.deploy();
      const badAddr = await bad.getAddress();

      await bank.connect(ali).addInvestor(badAddr, "BadActor", 90);
      await bad.deposit(await bank.getAddress(), { value: ethers.parseEther("5") });

      await bank.connect(charlie).submitProposal("Test", ethers.parseEther("5"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      // bob 20 + ali 10 of 35 total = 85.7% ≥ 60% threshold
      await bank.connect(bob).approveProposal(0);
      await bank.connect(ali).approveProposal(0);
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("15"), { value: ethers.parseEther("15") });
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("5"), { value: ethers.parseEther("5") });

      // Must not revert even though BadReceiver would revert on ETH push
      await expect(bank.connect(ali).distributeRevenue(0)).to.not.be.reverted;

      // Settle BadReceiver's lazy accrual — callable by anyone
      await bank.settle(badAddr);

      // BadReceiver's share was credited
      expect(await bank.withdrawable(badAddr)).to.be.gt(0n);

      // Other investors can still withdraw (withdraw() auto-accrues)
      await expect(bank.connect(bob).withdraw()).to.not.be.reverted;
      await expect(bank.connect(ali).withdraw()).to.not.be.reverted;
    });

    it("accumulator leaves at most a few wei unclaimable (no rounding to owner)", async function () {
      // 3 equal-share investors — any per-share truncation stays in contract, not credited to owner
      const { bank, ali, bob, charlie, dave } = await deployFixture();
      await bank.connect(ali).addInvestor(bob.address, "Bob", 90);
      await bank.connect(ali).addInvestor(dave.address, "Dave", 90);
      await bank.connect(ali).addManager(charlie.address, "Charlie", 0);

      await bank.connect(ali).depositFunds(ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await bank.connect(bob).depositFunds(ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await bank.connect(dave).depositFunds(ethers.parseEther("1"), { value: ethers.parseEther("1") });

      await bank.connect(charlie).submitProposal("Test", ethers.parseEther("1"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      await bank.connect(ali).approveProposal(0);
      await bank.connect(bob).approveProposal(0);
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await bank.connect(ali).distributeRevenue(0);

      // Settle all investors
      await bank.settle(ali.address);
      await bank.settle(bob.address);
      await bank.settle(dave.address);

      const aliW  = await bank.withdrawable(ali.address);
      const bobW  = await bank.withdrawable(bob.address);
      const daveW = await bank.withdrawable(dave.address);
      // Total claimable ≈ 1 ETH; at most a few wei stay unclaimable due to truncation
      const total = aliW + bobW + daveW;
      expect(total).to.be.lte(ethers.parseEther("1"));
      expect(total).to.be.gte(ethers.parseEther("1") - 10n);
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

    it("receiveRevenue reverts on a proposal that is not secured", async function () {
      const { bank, charlie } = await deployWithProposal();
      await expect(bank.connect(charlie).receiveRevenue(0, ethers.parseEther("1"), { value: ethers.parseEther("1") }))
        .to.be.revertedWith("Not secured");
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

  describe("Events", function () {
    it("addInvestor emits InvestorAdded", async function () {
      const { bank, ali, dave } = await deployFixture();
      await expect(bank.connect(ali).addInvestor(dave.address, "Dave", 75))
        .to.emit(bank, "InvestorAdded")
        .withArgs(dave.address, "Dave", 75);
    });

    it("addManager emits ManagerAdded", async function () {
      const { bank, ali, dave } = await deployFixture();
      await expect(bank.connect(ali).addManager(dave.address, "Dave", 15))
        .to.emit(bank, "ManagerAdded")
        .withArgs(dave.address, "Dave", 15);
    });

    it("depositFunds emits FundsDeposited", async function () {
      const { bank, ali } = await deployFixture();
      const amount = ethers.parseEther("5");
      await expect(bank.connect(ali).depositFunds(amount, { value: amount }))
        .to.emit(bank, "FundsDeposited")
        .withArgs(ali.address, amount);
    });

    it("submitProposal emits ProposalSubmitted", async function () {
      const { bank, charlie } = await deployWithDeposits();
      const req = ethers.parseEther("5");
      await expect(bank.connect(charlie).submitProposal("TestProp", req, "", 1))
        .to.emit(bank, "ProposalSubmitted")
        .withArgs(0, charlie.address, "TestProp", req);
    });

    it("receiveRevenue emits RevenueReceived", async function () {
      const { bank, charlie } = await deployWithFundedProposal();
      const amount = ethers.parseEther("10");
      await expect(bank.connect(charlie).receiveRevenue(0, amount, { value: amount }))
        .to.emit(bank, "RevenueReceived")
        .withArgs(0, charlie.address, amount);
    });

    it("distributeRevenue emits RevenueDistributed", async function () {
      const { bank, ali, revenue } = await deployWithRevenue();
      await expect(bank.connect(ali).distributeRevenue(0))
        .to.emit(bank, "RevenueDistributed")
        .withArgs(0, revenue);
    });
  });

  describe("Accumulator (PR 3)", function () {
    it("distributeRevenue gas does not grow with investor count", async function () {
      const signers = await ethers.getSigners();
      const SheikhFi = await ethers.getContractFactory("SheikhFi");
      const bank = await SheikhFi.deploy("Ali", 5, ethers.ZeroAddress);
      await bank.waitForDeployment();
      const ali = signers[0];
      const charlie = signers[1];

      await bank.connect(ali).addManager(charlie.address, "Charlie", 0);
      await bank.connect(ali).depositFunds(ethers.parseEther("10"), { value: ethers.parseEther("10") });

      // Warmup: initialize cumulativePerShare so both measurements start from nonzero state
      await bank.connect(charlie).submitProposal("Warmup", ethers.parseEther("1"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      await bank.connect(ali).approveProposal(0);
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("2"), { value: ethers.parseEther("2") });
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await bank.connect(ali).distributeRevenue(0);

      // Measure gas with 1 investor
      await bank.connect(charlie).submitProposal("A", ethers.parseEther("1"), "", 1);
      await bank.connect(ali).certifyProposal(1);
      await bank.connect(ali).approveProposal(1);
      await bank.connect(charlie).receiveRevenue(1, ethers.parseEther("5"), { value: ethers.parseEther("5") });
      await bank.connect(charlie).returnPrincipal(1, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      const r1 = await (await bank.connect(ali).distributeRevenue(1)).wait();
      const gas1 = r1.gasUsed;

      // Add 17 more investors (total 18; stays within 20 signer limit)
      for (let i = 2; i < 19; i++) {
        await bank.connect(ali).addInvestor(signers[i].address, `Inv${i}`, 90);
        await bank.connect(signers[i]).depositFunds(ethers.parseEther("1"), { value: ethers.parseEther("1") });
      }

      // Measure gas with 18 investors
      await bank.connect(charlie).submitProposal("B", ethers.parseEther("1"), "", 1);
      await bank.connect(ali).certifyProposal(2);
      await bank.connect(ali).approveProposal(2);
      await bank.connect(charlie).receiveRevenue(2, ethers.parseEther("5"), { value: ethers.parseEther("5") });
      await bank.connect(charlie).returnPrincipal(2, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      const r2 = await (await bank.connect(ali).distributeRevenue(2)).wait();
      const gas2 = r2.gasUsed;

      // gas difference < 10% of gas1 — accumulator is O(1)
      const diff = gas2 > gas1 ? gas2 - gas1 : gas1 - gas2;
      expect(diff).to.be.lt(gas1 / 10n);
    });

    it("late-joining investor does NOT claim past revenue", async function () {
      const { bank, ali, charlie, dave } = await deployWithDistribution();
      // Add Dave after the distribution has already happened
      await bank.connect(ali).addInvestor(dave.address, "Dave", 90);
      await bank.connect(dave).depositFunds(ethers.parseEther("5"), { value: ethers.parseEther("5") });
      await bank.settle(dave.address);
      expect((await bank.investors(dave.address)).profit).to.equal(0n);
      expect(await bank.withdrawable(dave.address)).to.equal(0n);
    });

    it("withdraw triggers accrue automatically", async function () {
      const { bank, ali } = await deployWithDistribution();
      // Ali has never called settle — withdraw() should auto-accrue
      await expect(bank.connect(ali).withdraw()).to.not.be.reverted;
      expect((await bank.investors(ali.address)).profit).to.be.gt(0n);
      expect(await bank.withdrawable(ali.address)).to.equal(0n);
    });

    it("multiple distributions accumulate correctly", async function () {
      const { bank, ali, bob, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("10"), { value: ethers.parseEther("10") });

      const rev1 = ethers.parseEther("20");
      await bank.connect(charlie).receiveRevenue(0, rev1, { value: rev1 });
      await bank.connect(ali).distributeRevenue(0);

      const rev2 = ethers.parseEther("30");
      await bank.connect(charlie).receiveRevenue(0, rev2, { value: rev2 });
      await bank.connect(ali).distributeRevenue(0);

      await bank.settle(bob.address);
      const bobProfit = (await bank.investors(bob.address)).profit;

      // Bob has 20/30 share, 95% rate, across total investor revenue = (20+30)*80% = 40 ETH
      const totalInvestorRev = (rev1 + rev2) * 80n / 100n;
      const expectedBob = totalInvestorRev * 20n * 95n / (30n * 100n);
      expect(bobProfit).to.be.gte(expectedBob - 100n);
      expect(bobProfit).to.be.lte(expectedBob);
    });

    it("personalized profit rates respected", async function () {
      const [ali, bob, charlie] = await ethers.getSigners();
      const SheikhFi = await ethers.getContractFactory("SheikhFi");
      const bank = await SheikhFi.deploy("Ali", 60, ethers.ZeroAddress);
      await bank.waitForDeployment();

      // Two investors with equal shares but different rates
      await bank.connect(ali).addInvestor(bob.address, "Bob", 80);
      await bank.connect(ali).addManager(charlie.address, "Charlie", 0);

      await bank.connect(ali).depositFunds(ethers.parseEther("10"), { value: ethers.parseEther("10") });
      await bank.connect(bob).depositFunds(ethers.parseEther("10"), { value: ethers.parseEther("10") });

      await bank.connect(charlie).submitProposal("Test", ethers.parseEther("1"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      // bob 10 + ali 10 of 20 total = 100% ≥ 60% threshold
      await bank.connect(bob).approveProposal(0);
      await bank.connect(ali).approveProposal(0);

      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("20"), { value: ethers.parseEther("20") });
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await bank.connect(ali).distributeRevenue(0);

      await bank.settle(ali.address);
      await bank.settle(bob.address);

      const aliProfit = (await bank.investors(ali.address)).profit;
      const bobProfit = (await bank.investors(bob.address)).profit;

      // Ali: rate=100, share=10/20; Bob: rate=80, share=10/20; total investor rev = 20 ETH
      // ali gross = 10 ETH → ali keeps 10 ETH + 2 ETH owner cut from Bob = 12 ETH
      // bob gross = 10 ETH → bob keeps 8 ETH
      expect(aliProfit).to.be.gte(ethers.parseEther("12") - 10n);
      expect(bobProfit).to.be.gte(ethers.parseEther("8") - 10n);
      expect(bobProfit).to.be.lt(ethers.parseEther("10"));
      expect(aliProfit).to.be.gt(bobProfit);
    });

    it("settle is idempotent", async function () {
      const { bank, bob } = await deployWithDistribution();
      await bank.settle(bob.address);
      const w1 = await bank.withdrawable(bob.address);
      const p1 = (await bank.investors(bob.address)).profit;
      // second settle should not change anything
      await bank.settle(bob.address);
      expect(await bank.withdrawable(bob.address)).to.equal(w1);
      expect((await bank.investors(bob.address)).profit).to.equal(p1);
    });

    it("checkpoint is set at addInvestor time (zero-share investor accrues nothing)", async function () {
      const { bank, ali, charlie, dave } = await deployWithDistribution();
      // Add Dave after distribution — checkpoint set to current cumulativePerShare
      await bank.connect(ali).addInvestor(dave.address, "Dave", 90);
      // Settle without depositing — zero fundsInvested, should have zero accrual
      await bank.settle(dave.address);
      expect((await bank.investors(dave.address)).profit).to.equal(0n);
      expect(await bank.withdrawable(dave.address)).to.equal(0n);
    });

    it("settle reverts for non-investor", async function () {
      const { bank, dave } = await deployWithDistribution();
      await expect(bank.settle(dave.address))
        .to.be.revertedWith("Not investor");
    });

    it("pendingAccrual reports uncrystallised share before settle", async function () {
      const { bank, bob } = await deployWithDistribution();
      const [myPending, ownerPending] = await bank.pendingAccrual(bob.address);
      // Bob has 20/30 share, 95% rate — both values should be non-zero
      expect(myPending).to.be.gt(0n);
      expect(ownerPending).to.be.gt(0n);
      // After settle, withdrawable matches what pendingAccrual reported
      await bank.settle(bob.address);
      expect(await bank.withdrawable(bob.address)).to.equal(myPending);
      // pendingAccrual is now zero
      const [afterPending] = await bank.pendingAccrual(bob.address);
      expect(afterPending).to.equal(0n);
    });

    it("pendingAccrual returns zero for address with no invested funds", async function () {
      const { bank, dave } = await deployWithDistribution();
      const [myPending, ownerPending] = await bank.pendingAccrual(dave.address);
      expect(myPending).to.equal(0n);
      expect(ownerPending).to.equal(0n);
    });

    it("second deposit accrues investor at pre-deposit share", async function () {
      const { bank, ali, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("10"), { value: ethers.parseEther("10") });

      // First distribution: ali has 10 ETH, bob has 20 ETH (total 30)
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("30"), { value: ethers.parseEther("30") });
      await bank.connect(ali).distributeRevenue(0);

      // Ali deposits 10 more ETH — _accrue fires at old 10 ETH share
      await bank.connect(ali).depositFunds(ethers.parseEther("10"), { value: ethers.parseEther("10") });

      // profit is crystallised at old share (10/30 of investor revenue)
      // investorRevenue = 30 * 80% = 24 ETH; ali gross = 24 * 10/30 = 8 ETH
      const aliProfitMid = (await bank.investors(ali.address)).profit;
      expect(aliProfitMid).to.be.gte(ethers.parseEther("8") - 10n);
      expect(aliProfitMid).to.be.lte(ethers.parseEther("8"));
      expect((await bank.investors(ali.address)).fundsInvested).to.equal(ethers.parseEther("20"));

      // Second distribution: ali now has 20 ETH out of 40 total (bob still 20)
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("30"), { value: ethers.parseEther("30") });
      await bank.connect(ali).distributeRevenue(0);

      await bank.settle(ali.address);
      const aliProfitFinal = (await bank.investors(ali.address)).profit;

      // Second distribution: ali gross = 24 * 20/40 = 12 ETH; total = 8 + 12 = 20 ETH
      expect(aliProfitFinal).to.be.gte(ethers.parseEther("20") - 20n);
      expect(aliProfitFinal).to.be.lte(ethers.parseEther("20"));
    });

    it("settleBatch settles multiple investors in one call", async function () {
      const { bank, ali, bob } = await deployWithDistribution();
      await bank.settleBatch([ali.address, bob.address]);
      expect(await bank.withdrawable(ali.address)).to.be.gt(0n);
      expect(await bank.withdrawable(bob.address)).to.be.gt(0n);
      // second call is a no-op
      const aliW = await bank.withdrawable(ali.address);
      const bobW = await bank.withdrawable(bob.address);
      await bank.settleBatch([ali.address, bob.address]);
      expect(await bank.withdrawable(ali.address)).to.equal(aliW);
      expect(await bank.withdrawable(bob.address)).to.equal(bobW);
    });

    it("settleBatch silently skips non-investor addresses", async function () {
      const { bank, ali, bob, dave } = await deployWithDistribution();
      // dave is not an investor — batch should not revert
      await expect(bank.settleBatch([ali.address, dave.address, bob.address]))
        .to.not.be.reverted;
      expect(await bank.withdrawable(ali.address)).to.be.gt(0n);
      expect(await bank.withdrawable(bob.address)).to.be.gt(0n);
    });
  });

  describe("Economy v2 (PLAN §4)", function () {
    it("returnPrincipal restores freeFunds fee-free", async function () {
      const { bank, charlie } = await deployWithFundedProposal();
      const freeBefore = await bank.freeFunds();          // 20 ETH
      const charlieW   = await bank.withdrawable(charlie.address); // 10 ETH funding
      await expect(bank.connect(charlie).returnPrincipal(0, ethers.parseEther("4"), { value: ethers.parseEther("4") }))
        .to.emit(bank, "PrincipalReturned")
        .withArgs(0, charlie.address, ethers.parseEther("4"));
      expect(await bank.freeFunds()).to.equal(freeBefore + ethers.parseEther("4"));
      // no fee, no accrual — only the free pool grows
      expect(await bank.withdrawable(charlie.address)).to.equal(charlieW);
      expect((await bank.proposals(0)).principalReturned).to.equal(ethers.parseEther("4"));
    });

    it("returnPrincipal validations", async function () {
      const funded = await deployWithFundedProposal();
      await expect(funded.bank.connect(funded.bob).returnPrincipal(0, 1n, { value: 1n }))
        .to.be.revertedWith("Not proposal manager");
      await expect(funded.bank.connect(funded.charlie).returnPrincipal(0, 0, { value: 0 }))
        .to.be.revertedWith("No value");
      await expect(funded.bank.connect(funded.charlie)
        .returnPrincipal(0, ethers.parseEther("11"), { value: ethers.parseEther("11") }))
        .to.be.revertedWith("Exceeds principal");
      const pending = await deployWithProposal();
      await expect(pending.bank.connect(pending.charlie).returnPrincipal(0, 1n, { value: 1n }))
        .to.be.revertedWith("Not secured");
    });

    it("profit is not recognised until the capital is home (SS 13 8/7)", async function () {
      const { bank, ali, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("50"), { value: ethers.parseEther("50") });
      await expect(bank.connect(ali).distributeRevenue(0))
        .to.be.revertedWith("Principal outstanding");
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("6"), { value: ethers.parseEther("6") });
      await expect(bank.connect(ali).distributeRevenue(0))
        .to.be.revertedWith("Principal outstanding");
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("4"), { value: ethers.parseEther("4") });
      await expect(bank.connect(ali).distributeRevenue(0)).to.not.be.reverted;
    });

    it("write-off reduces stakes pro-rata and keeps totalFunds == Σ stakes (SS 12 3/1/5/4)", async function () {
      const { bank, ali, bob, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("4"), { value: ethers.parseEther("4") });
      const freeBefore = await bank.freeFunds(); // 24 ETH of realised cash
      await expect(bank.connect(ali).writeOffProposal(0))
        .to.emit(bank, "ProposalWrittenOff")
        .withArgs(0, ethers.parseEther("6"));
      // loss 6 over 30: ali 10 → 8, bob 20 → 16
      const aliStake = (await bank.investors(ali.address)).fundsInvested;
      const bobStake = (await bank.investors(bob.address)).fundsInvested;
      expect(aliStake).to.equal(ethers.parseEther("8"));
      expect(bobStake).to.equal(ethers.parseEther("16"));
      expect(await bank.totalFunds()).to.equal(aliStake + bobStake);
      // realised cash is untouched — the write-down is a book loss
      expect(await bank.freeFunds()).to.equal(freeBefore);
      expect((await bank.proposals(0)).writtenOff).to.be.true;
    });

    it("write-off crystallises profit at pre-loss stakes", async function () {
      const { bank, ali, bob, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("10"), { value: ethers.parseEther("10") });
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("30"), { value: ethers.parseEther("30") });
      await bank.connect(ali).distributeRevenue(0);
      // nobody settles; fund a second project and write it off
      await bank.connect(charlie).submitProposal("Fails", ethers.parseEther("10"), "", 1);
      await bank.connect(ali).certifyProposal(1);
      await bank.connect(bob).approveProposal(1);
      await bank.connect(ali).writeOffProposal(1);
      // bob's profit from the first project was crystallised inside the
      // write-off at his full 20/30 stake: 24 * 20/30 * 95% = 15.2 ETH
      const expected = ethers.parseEther("24") * 20n * 95n / (30n * 100n);
      const bobProfit = (await bank.investors(bob.address)).profit;
      expect(bobProfit).to.be.gte(expected - 10n);
      expect(bobProfit).to.be.lte(expected);
      // and only then did his stake shrink: 20 - 20*10/30 = 13.33…
      expect((await bank.investors(bob.address)).fundsInvested)
        .to.be.closeTo(ethers.parseEther("20") - ethers.parseEther("20") * 10n / 30n, 10n);
    });

    it("write-off closes the proposal; earlier revenue stays distributable", async function () {
      const { bank, ali, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("15"), { value: ethers.parseEther("15") });
      await bank.connect(ali).writeOffProposal(0);
      await expect(bank.connect(charlie).receiveRevenue(0, 1n, { value: 1n }))
        .to.be.revertedWith("Written off");
      await expect(bank.connect(charlie).returnPrincipal(0, 1n, { value: 1n }))
        .to.be.revertedWith("Written off");
      // revenue delivered before the write-off is settled against the
      // written-down capital
      await expect(bank.connect(ali).distributeRevenue(0)).to.not.be.reverted;
    });

    it("write-off validations", async function () {
      const funded = await deployWithFundedProposal();
      await expect(funded.bank.connect(funded.bob).writeOffProposal(0))
        .to.be.revertedWith("Not owner");
      await funded.bank.connect(funded.charlie)
        .returnPrincipal(0, ethers.parseEther("10"), { value: ethers.parseEther("10") });
      await expect(funded.bank.connect(funded.ali).writeOffProposal(0))
        .to.be.revertedWith("Nothing to write off");
      const pending = await deployWithProposal();
      await expect(pending.bank.connect(pending.ali).writeOffProposal(0))
        .to.be.revertedWith("Not secured");
      const double = await deployWithFundedProposal();
      await double.bank.connect(double.ali).writeOffProposal(0);
      await expect(double.bank.connect(double.ali).writeOffProposal(0))
        .to.be.revertedWith("Written off");
    });

    it("exit pays out of free funds and shrinks the stake", async function () {
      const { bank, bob } = await deployWithDeposits();
      await expect(bank.connect(bob).exit(ethers.parseEther("5")))
        .to.emit(bank, "Exited").withArgs(bob.address, ethers.parseEther("5"));
      expect((await bank.investors(bob.address)).fundsInvested).to.equal(ethers.parseEther("15"));
      expect(await bank.totalFunds()).to.equal(ethers.parseEther("25"));
      expect(await bank.freeFunds()).to.equal(ethers.parseEther("25"));
      // pull payment: credited, then withdrawn
      expect(await bank.withdrawable(bob.address)).to.equal(ethers.parseEther("5"));
      await expect(bank.connect(bob).withdraw())
        .to.changeEtherBalance(bob, ethers.parseEther("5"));
      // solvency: contract balance covers the free pool
      expect(await ethers.provider.getBalance(await bank.getAddress()))
        .to.be.gte(await bank.freeFunds());
    });

    it("exit validations", async function () {
      const { bank, ali, bob, charlie, dave } = await deployWithDeposits();
      await expect(bank.connect(dave).exit(1n)).to.be.revertedWith("Not investor");
      await expect(bank.connect(bob).exit(0)).to.be.revertedWith("No value");
      await expect(bank.connect(bob).exit(ethers.parseEther("21")))
        .to.be.revertedWith("Exceeds stake");
      // deploy most of the pool, then the stake exceeds what is liquid
      // (bob alone: 20/30 = 66.7% ≥ 60% — funds on the first vote)
      await bank.connect(charlie).submitProposal("Big", ethers.parseEther("25"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      await bank.connect(bob).approveProposal(0);
      expect(await bank.freeFunds()).to.equal(ethers.parseEther("5"));
      await expect(bank.connect(bob).exit(ethers.parseEther("10")))
        .to.be.revertedWith("Insufficient free funds");
    });

    it("exited stake earns nothing from later distributions", async function () {
      const { bank, ali, bob, charlie } = await deployWithDistribution();
      await bank.connect(bob).exit(ethers.parseEther("20"));
      // exit crystallised bob's accrual first: investor rev 40 * 20/30 * 95%
      const accrued = ethers.parseEther("40") * 20n * 95n / (30n * 100n);
      const bobW = await bank.withdrawable(bob.address);
      expect(bobW).to.be.gte(accrued + ethers.parseEther("20") - 10n);
      expect(bobW).to.be.lte(accrued + ethers.parseEther("20"));
      // a later distribution goes entirely to the remaining stake (ali)
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("30"), { value: ethers.parseEther("30") });
      await bank.connect(ali).distributeRevenue(0);
      await bank.settle(bob.address);
      expect(await bank.withdrawable(bob.address)).to.equal(bobW);
    });

    it("distribute reverts cleanly when every stake has exited", async function () {
      const { bank, ali, charlie } = await deployFixture();
      await bank.connect(ali).addManager(charlie.address, "Charlie", 20);
      await bank.connect(ali).depositFunds(ethers.parseEther("10"), { value: ethers.parseEther("10") });
      await bank.connect(charlie).submitProposal("Solo", ethers.parseEther("5"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      await bank.connect(ali).approveProposal(0);
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("5"), { value: ethers.parseEther("5") });
      await bank.connect(ali).exit(ethers.parseEther("10"));
      expect(await bank.totalFunds()).to.equal(0n);
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("3"), { value: ethers.parseEther("3") });
      await expect(bank.connect(ali).distributeRevenue(0))
        .to.be.revertedWith("No investors");
    });
  });

  describe("Proposal lifecycle (PLAN §1)", function () {
    it("vote weight is frozen at vote time — later deposits do not inflate it", async function () {
      const { bank, ali, bob } = await deployWithProposal();
      // Ali votes with 10 of 30 ETH (33% < 60%)
      await bank.connect(ali).approveProposal(0);
      // Ali deposits 50 more — totalFunds 80, but his cast vote stays at 10
      await bank.connect(ali).depositFunds(ethers.parseEther("50"), { value: ethers.parseEther("50") });
      // Bob votes with 20 → approvalWeight 30, 30/80 = 37.5% < 60% → not funded
      await bank.connect(bob).approveProposal(0);
      const p = await bank.proposals(0);
      expect(p.approvalWeight).to.equal(ethers.parseEther("30"));
      expect(p.secured).to.be.false;
    });

    it("voting closes after the deadline", async function () {
      const { bank, bob } = await deployWithProposal();
      await time.increase(30 * 24 * 3600 + 1);
      await expect(bank.connect(bob).approveProposal(0))
        .to.be.revertedWith("Voting closed");
    });

    it("deadline follows the configured votingPeriod", async function () {
      const { bank, ali, charlie } = await deployWithDeposits();
      await bank.connect(ali).setVotingPeriod(2 * 24 * 3600);
      await bank.connect(charlie).submitProposal("Short window", ethers.parseEther("1"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      await time.increase(2 * 24 * 3600 + 1);
      await expect(bank.connect(ali).approveProposal(0))
        .to.be.revertedWith("Voting closed");
    });

    it("manager cancels own pending proposal; votes on it revert", async function () {
      const { bank, ali, charlie } = await deployWithProposal();
      await expect(bank.connect(charlie).cancelProposal(0))
        .to.emit(bank, "ProposalCancelled").withArgs(0);
      await expect(bank.connect(ali).approveProposal(0))
        .to.be.revertedWith("Cancelled");
    });

    it("owner can cancel; strangers cannot; no double cancel", async function () {
      const { bank, ali, bob } = await deployWithProposal();
      await expect(bank.connect(bob).cancelProposal(0))
        .to.be.revertedWith("Not authorized");
      await bank.connect(ali).cancelProposal(0);
      await expect(bank.connect(ali).cancelProposal(0))
        .to.be.revertedWith("Cancelled");
    });

    it("secured proposal cannot be cancelled", async function () {
      const { bank, ali } = await deployWithFundedProposal();
      await expect(bank.connect(ali).cancelProposal(0))
        .to.be.revertedWith("Already funded");
    });

    it("setters: owner-only, bounds enforced, events emitted", async function () {
      const { bank, ali, bob } = await deployFixture();
      await expect(bank.connect(bob).setApproveShareThreshold(50))
        .to.be.revertedWith("Not owner");
      await expect(bank.connect(bob).setVotingPeriod(7 * 24 * 3600))
        .to.be.revertedWith("Not owner");
      await expect(bank.connect(ali).setApproveShareThreshold(0))
        .to.be.revertedWith("Bad threshold");
      await expect(bank.connect(ali).setApproveShareThreshold(101))
        .to.be.revertedWith("Bad threshold");
      await expect(bank.connect(ali).setVotingPeriod(3600))
        .to.be.revertedWith("Bad period");
      await expect(bank.connect(ali).setVotingPeriod(366 * 24 * 3600))
        .to.be.revertedWith("Bad period");
      await expect(bank.connect(ali).setApproveShareThreshold(75))
        .to.emit(bank, "ThresholdChanged").withArgs(75);
      expect(await bank.approveShareThreshold()).to.equal(75n);
      await expect(bank.connect(ali).setVotingPeriod(7 * 24 * 3600))
        .to.emit(bank, "VotingPeriodChanged").withArgs(7 * 24 * 3600);
      expect(await bank.votingPeriod()).to.equal(BigInt(7 * 24 * 3600));
    });

    it("ownership: transfer requires investor, two-step works, rates adjust", async function () {
      const { bank, ali, bob, charlie, dave } = await deployWithDistribution();

      // new owner must be an investor
      await expect(bank.connect(ali).transferOwnership(dave.address))
        .to.be.revertedWith("Not investor");
      // only owner can start the transfer
      await expect(bank.connect(bob).transferOwnership(bob.address))
        .to.be.revertedWith("Not owner");

      await expect(bank.connect(ali).transferOwnership(bob.address))
        .to.emit(bank, "OwnershipTransferStarted").withArgs(ali.address, bob.address);
      // only the pending owner can accept
      await expect(bank.connect(charlie).acceptOwnership())
        .to.be.revertedWith("Not pending owner");

      await expect(bank.connect(bob).acceptOwnership())
        .to.emit(bank, "OwnershipTransferred").withArgs(ali.address, bob.address);

      expect(await bank.owner()).to.equal(bob.address);
      expect(await bank.ownerNickname()).to.equal("Bob");
      expect(await bank.pendingOwner()).to.equal(ethers.ZeroAddress);

      // pre-transfer accrual was crystallised at bob's OLD rate (95%):
      // investor revenue 40 ETH, bob gross = 40 * 20/30, myPart = 95%
      const bobGross = ethers.parseEther("40") * 20n / 30n;
      const bobPreTransfer = bobGross * 95n / 100n;
      const bobProfit = (await bank.investors(bob.address)).profit;
      expect(bobProfit).to.be.gte(bobPreTransfer - 10n);
      expect(bobProfit).to.be.lte(bobPreTransfer);
      expect(Number((await bank.investors(bob.address)).profitRate)).to.equal(100);

      // owner-only functions moved to bob
      await expect(bank.connect(ali).setApproveShareThreshold(50))
        .to.be.revertedWith("Not owner");
      await bank.connect(bob).setApproveShareThreshold(50);

      // post-transfer distribution: bob accrues at 100%, ali (old owner,
      // rate 100) pays no cut to the new owner. Settle both first so the
      // "before" snapshots include everything from the first distribution.
      await bank.settle(ali.address);
      await bank.settle(bob.address);
      const bobBefore = (await bank.investors(bob.address)).profit;
      const aliBefore = (await bank.investors(ali.address)).profit;
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("30"), { value: ethers.parseEther("30") });
      await bank.connect(bob).distributeRevenue(0);
      await bank.settle(bob.address);
      await bank.settle(ali.address);
      const bobDelta = (await bank.investors(bob.address)).profit - bobBefore;
      const aliDelta = (await bank.investors(ali.address)).profit - aliBefore;
      // investor revenue 24 ETH: bob 24*20/30 = 16, ali 24*10/30 = 8
      expect(bobDelta).to.be.gte(ethers.parseEther("16") - 10n);
      expect(bobDelta).to.be.lte(ethers.parseEther("16"));
      expect(aliDelta).to.be.gte(ethers.parseEther("8") - 10n);
      expect(aliDelta).to.be.lte(ethers.parseEther("8"));
    });

    it("vote gas does not grow with the number of prior votes", async function () {
      const signers = await ethers.getSigners();
      const SheikhFi = await ethers.getContractFactory("SheikhFi");
      const bank = await SheikhFi.deploy("Ali", 100, ethers.ZeroAddress);
      await bank.waitForDeployment();
      const [ali, charlie] = [signers[0], signers[1]];
      await bank.connect(ali).addManager(charlie.address, "Charlie", 0);
      await bank.connect(ali).depositFunds(ethers.parseEther("1"), { value: ethers.parseEther("1") });
      for (let i = 2; i < 19; i++) {
        await bank.connect(ali).addInvestor(signers[i].address, `Inv${i}`, 90);
        await bank.connect(signers[i]).depositFunds(ethers.parseEther("1"), { value: ethers.parseEther("1") });
      }
      await bank.connect(charlie).submitProposal("Gas probe", ethers.parseEther("1"), "", 1);
      await bank.connect(ali).certifyProposal(0);
      const gasOf = async (signer) =>
        (await (await bank.connect(signer).approveProposal(0)).wait()).gasUsed;
      await gasOf(signers[2]); // warmup: first vote initialises approvalWeight
      const gEarly = await gasOf(signers[3]);
      for (let i = 4; i < 17; i++) await gasOf(signers[i]);
      const gLate = await gasOf(signers[17]);
      const diff = gLate > gEarly ? gLate - gEarly : gEarly - gLate;
      expect(diff).to.be.lt(gEarly / 10n);
    });
  });

  describe("Tokenized shares (PLAN v3 §1)", function () {
    it("ERC-20 metadata and supply mirror the pool accounting", async function () {
      const { bank, ali, bob } = await deployWithDeposits();
      expect(await bank.name()).to.equal("SheikhFi Musharaka Share");
      expect(await bank.symbol()).to.equal("SHFI");
      expect(await bank.decimals()).to.equal(18);
      expect(await bank.totalSupply()).to.equal(await bank.totalFunds());
      expect(await bank.balanceOf(ali.address)).to.equal(ethers.parseEther("10"));
      expect(await bank.balanceOf(bob.address)).to.equal(ethers.parseEther("20"));
    });

    it("transfer moves stake and crystallises both sides first", async function () {
      const { bank, ali, bob } = await deployWithDistribution();
      await expect(bank.connect(bob).transfer(ali.address, ethers.parseEther("10")))
        .to.emit(bank, "Transfer")
        .withArgs(bob.address, ali.address, ethers.parseEther("10"));
      // profits were crystallised at the pre-transfer 10/20 split
      const bobExpected = ethers.parseEther("40") * 20n * 95n / (30n * 100n);
      const aliExpected = ethers.parseEther("40") * 10n / 30n; // rate 100
      const bobProfit = (await bank.investors(bob.address)).profit;
      const aliProfit = (await bank.investors(ali.address)).profit;
      expect(bobProfit).to.be.gte(bobExpected - 10n);
      expect(bobProfit).to.be.lte(bobExpected);
      expect(aliProfit).to.be.gt(aliExpected - 10n);
      expect(await bank.balanceOf(bob.address)).to.equal(ethers.parseEther("10"));
      expect(await bank.balanceOf(ali.address)).to.equal(ethers.parseEther("20"));
      expect(await bank.totalFunds()).to.equal(ethers.parseEther("30"));
    });

    it("transfer to a non-investor reverts; over-stake reverts", async function () {
      const { bank, bob, dave } = await deployWithDeposits();
      await expect(bank.connect(bob).transfer(dave.address, 1n))
        .to.be.revertedWith("Not investor");
      const { bank: b2, ali: a2, bob: bob2 } = await deployWithDeposits();
      await expect(b2.connect(bob2).transfer(a2.address, ethers.parseEther("21")))
        .to.be.revertedWith("Exceeds stake");
    });

    it("transferFrom respects allowance", async function () {
      const { bank, ali, bob } = await deployWithDeposits();
      await bank.connect(bob).approve(ali.address, ethers.parseEther("5"));
      await expect(bank.connect(ali).transferFrom(bob.address, ali.address, ethers.parseEther("6")))
        .to.be.revertedWith("Exceeds allowance");
      await bank.connect(ali).transferFrom(bob.address, ali.address, ethers.parseEther("5"));
      expect(await bank.allowance(bob.address, ali.address)).to.equal(0n);
      expect(await bank.balanceOf(ali.address)).to.equal(ethers.parseEther("15"));
    });

    it("deposit mints and exit burns in ERC-20 terms", async function () {
      const { bank, bob } = await deployWithDeposits();
      await expect(bank.connect(bob).depositFunds(1000n, { value: 1000n }))
        .to.emit(bank, "Transfer").withArgs(ethers.ZeroAddress, bob.address, 1000n);
      await expect(bank.connect(bob).exit(500n))
        .to.emit(bank, "Transfer").withArgs(bob.address, ethers.ZeroAddress, 500n);
    });
  });

  describe("Token denomination (PLAN v3 §2)", function () {
    async function deployTokenPool() {
      const [ali, bob, charlie] = await ethers.getSigners();
      const Mock = await ethers.getContractFactory("MockERC20");
      const usd = await Mock.deploy();
      await usd.waitForDeployment();
      const M = 10n ** 6n;
      for (const s of [ali, bob, charlie]) await usd.mint(s.address, 1000n * M);
      const SheikhFi = await ethers.getContractFactory("SheikhFi");
      const bank = await SheikhFi.deploy("Ali", 60, await usd.getAddress());
      await bank.waitForDeployment();
      await bank.connect(ali).addInvestor(bob.address, "Bob", 95);
      await bank.connect(ali).addManager(charlie.address, "Charlie", 20);
      return { bank, usd, ali, bob, charlie, M };
    }

    it("full cycle settles in tokens", async function () {
      const { bank, usd, ali, bob, charlie, M } = await deployTokenPool();
      const bankAddr = await bank.getAddress();

      await expect(bank.connect(ali).depositFunds(100n * M))
        .to.be.revertedWith("Allowance");
      await usd.connect(ali).approve(bankAddr, 100n * M);
      await bank.connect(ali).depositFunds(100n * M);
      await usd.connect(bob).approve(bankAddr, 200n * M);
      await bank.connect(bob).depositFunds(200n * M);
      expect(await usd.balanceOf(bankAddr)).to.equal(300n * M);

      await bank.connect(charlie).submitProposal("Sukuk pilot", 100n * M, "", 1);
      await bank.connect(ali).certifyProposal(0);
      await bank.connect(bob).approveProposal(0);
      // manager pulls the funded tranche in tokens
      const before = await usd.balanceOf(charlie.address);
      await bank.connect(charlie).withdraw();
      expect(await usd.balanceOf(charlie.address)).to.equal(before + 100n * M);

      await usd.connect(charlie).approve(bankAddr, 150n * M);
      await bank.connect(charlie).returnPrincipal(0, 100n * M);
      await bank.connect(charlie).receiveRevenue(0, 50n * M);
      await bank.connect(ali).distributeRevenue(0);
      await bank.settle(bob.address);
      const bobBefore = await usd.balanceOf(bob.address);
      await bank.connect(bob).withdraw();
      // bob: 40 USD investor revenue * 2/3 share * 95% = 25.33 USD
      const got = (await usd.balanceOf(bob.address)) - bobBefore;
      expect(got).to.be.gte(25_333_332n);
      expect(got).to.be.lte(25_333_334n);
    });

    it("token mode refuses native value; native mode requires exact value", async function () {
      const { bank, usd, ali, M } = await deployTokenPool();
      await usd.connect(ali).approve(await bank.getAddress(), 10n * M);
      await expect(bank.connect(ali).depositFunds(10n * M, { value: 1n }))
        .to.be.revertedWith("Native not accepted");
      const { bank: nativeBank, ali: a2 } = await deployFixture();
      await expect(nativeBank.connect(a2).depositFunds(2n, { value: 1n }))
        .to.be.revertedWith("Value mismatch");
    });
  });

  describe("Sharia board (PLAN v3 §3)", function () {
    it("voting opens only after certification", async function () {
      const { bank, ali, charlie } = await deployWithDeposits();
      await bank.connect(charlie).submitProposal("Uncertified", ethers.parseEther("1"), "ipfs-cid-demo", 1);
      await expect(bank.connect(ali).approveProposal(0))
        .to.be.revertedWith("Not certified");
      await expect(bank.connect(charlie).certifyProposal(0))
        .to.be.revertedWith("Not board");
      await expect(bank.connect(ali).certifyProposal(0))
        .to.emit(bank, "ProposalCertified").withArgs(0);
      await expect(bank.connect(ali).certifyProposal(0))
        .to.be.revertedWith("Already certified");
      await expect(bank.connect(ali).approveProposal(0)).to.not.be.reverted;
      expect((await bank.proposals(0)).docsHash).to.equal("ipfs-cid-demo");
    });

    it("cancelled proposal cannot be certified", async function () {
      const { bank, ali, charlie } = await deployWithDeposits();
      await bank.connect(charlie).submitProposal("Doomed", ethers.parseEther("1"), "", 1);
      await bank.connect(charlie).cancelProposal(0);
      await expect(bank.connect(ali).certifyProposal(0))
        .to.be.revertedWith("Cancelled");
    });

    it("setBoard: owner-only, non-zero, takes effect", async function () {
      const { bank, ali, bob, charlie } = await deployWithDeposits();
      await expect(bank.connect(bob).setBoard(bob.address))
        .to.be.revertedWith("Not owner");
      await expect(bank.connect(ali).setBoard(ethers.ZeroAddress))
        .to.be.revertedWith("Zero address");
      await expect(bank.connect(ali).setBoard(bob.address))
        .to.emit(bank, "BoardChanged").withArgs(bob.address);
      await bank.connect(charlie).submitProposal("Post-handover", ethers.parseEther("1"), "", 1);
      await expect(bank.connect(ali).certifyProposal(0))
        .to.be.revertedWith("Not board");
      await expect(bank.connect(bob).certifyProposal(0)).to.not.be.reverted;
    });
  });

  describe("Tranches (PLAN v3 §4)", function () {
    async function deployTranched() {
      const f = await deployWithDeposits(); // ali 10, bob 20
      await f.bank.connect(f.charlie).submitProposal("Milestones", ethers.parseEther("9"), "", 3);
      await f.bank.connect(f.ali).certifyProposal(0);
      await f.bank.connect(f.bob).approveProposal(0); // 66% ≥ 60 → secured
      return f;
    }

    it("securing reserves everything but disburses only tranche #1", async function () {
      const { bank, charlie } = await deployTranched();
      expect(await bank.freeFunds()).to.equal(ethers.parseEther("21"));
      expect(await bank.withdrawable(charlie.address)).to.equal(ethers.parseEther("3"));
      expect(await bank.releasedAmount(0)).to.equal(ethers.parseEther("3"));
    });

    it("board releases tranches in order; remainder rides on the last", async function () {
      const { bank, ali, bob, charlie } = await deployWithDeposits();
      await bank.connect(charlie).submitProposal("Indivisible", ethers.parseEther("10"), "", 3);
      await bank.connect(ali).certifyProposal(0);
      await bank.connect(bob).approveProposal(0);
      const t = ethers.parseEther("10") / 3n;
      expect(await bank.releasedAmount(0)).to.equal(t);
      await expect(bank.connect(bob).releaseTranche(0)).to.be.revertedWith("Not board");
      await expect(bank.connect(ali).releaseTranche(0))
        .to.emit(bank, "TrancheReleased").withArgs(0, 2, t);
      await expect(bank.connect(ali).releaseTranche(0))
        .to.emit(bank, "TrancheReleased").withArgs(0, 3, ethers.parseEther("10") - 2n * t);
      expect(await bank.releasedAmount(0)).to.equal(ethers.parseEther("10"));
      expect(await bank.withdrawable(charlie.address)).to.equal(ethers.parseEther("10"));
      await expect(bank.connect(ali).releaseTranche(0))
        .to.be.revertedWith("All released");
    });

    it("principal return is capped by what was disbursed", async function () {
      const { bank, charlie } = await deployTranched();
      await expect(bank.connect(charlie).returnPrincipal(0, ethers.parseEther("4"), { value: ethers.parseEther("4") }))
        .to.be.revertedWith("Exceeds principal");
      await expect(bank.connect(charlie).returnPrincipal(0, ethers.parseEther("3"), { value: ethers.parseEther("3") }))
        .to.not.be.reverted;
    });

    it("profit on completed milestones is distributable mid-project", async function () {
      const { bank, ali, charlie } = await deployTranched();
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("3"), { value: ethers.parseEther("3") });
      await bank.connect(charlie).receiveRevenue(0, ethers.parseEther("6"), { value: ethers.parseEther("6") });
      await expect(bank.connect(ali).distributeRevenue(0)).to.not.be.reverted;
    });

    it("write-off frees undisbursed tranches and books loss only on disbursed", async function () {
      const { bank, ali, bob, charlie } = await deployTranched();
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      // released 3, returned 1 → loss 2; undisbursed 6 goes back to freeFunds
      await expect(bank.connect(ali).writeOffProposal(0))
        .to.emit(bank, "ProposalWrittenOff").withArgs(0, ethers.parseEther("2"));
      expect(await bank.freeFunds()).to.equal(ethers.parseEther("28")); // 21 + 1 + 6
      // truncation dust from the pro-rata cut stays as stake by design
      expect(await bank.totalFunds()).to.be.closeTo(ethers.parseEther("28"), 10n);
      const aliStake = (await bank.investors(ali.address)).fundsInvested;
      const bobStake = (await bank.investors(bob.address)).fundsInvested;
      expect(aliStake + bobStake).to.equal(await bank.totalFunds());
      expect(aliStake).to.be.closeTo(ethers.parseEther("10") - ethers.parseEther("2") / 3n, 10n);
    });

    it("early close with fully returned tranche books zero loss", async function () {
      const { bank, ali, charlie } = await deployTranched();
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("3"), { value: ethers.parseEther("3") });
      await expect(bank.connect(ali).writeOffProposal(0))
        .to.emit(bank, "ProposalWrittenOff").withArgs(0, 0);
      expect(await bank.totalFunds()).to.equal(ethers.parseEther("30"));
      expect(await bank.freeFunds()).to.equal(ethers.parseEther("30")); // 21 + 3 + 6
    });

    it("tranche bounds validated at submission", async function () {
      const { bank, charlie } = await deployWithDeposits();
      await expect(bank.connect(charlie).submitProposal("Zero", ethers.parseEther("1"), "", 0))
        .to.be.revertedWith("Bad tranches");
      await expect(bank.connect(charlie).submitProposal("Many", ethers.parseEther("1"), "", 13))
        .to.be.revertedWith("Bad tranches");
    });
  });

  describe("Collateral (PLAN v3 §5)", function () {
    it("post, locked while projects active, withdrawable after full return", async function () {
      const { bank, charlie } = await deployWithFundedProposal();
      await expect(bank.connect(charlie).postCollateral(ethers.parseEther("5"), { value: ethers.parseEther("5") }))
        .to.emit(bank, "CollateralPosted").withArgs(charlie.address, ethers.parseEther("5"));
      await expect(bank.connect(charlie).withdrawCollateral(ethers.parseEther("5")))
        .to.be.revertedWith("Active projects");
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("10"), { value: ethers.parseEther("10") });
      await expect(bank.connect(charlie).withdrawCollateral(ethers.parseEther("6")))
        .to.be.revertedWith("Exceeds collateral");
      await expect(bank.connect(charlie).withdrawCollateral(ethers.parseEther("5")))
        .to.emit(bank, "CollateralWithdrawn").withArgs(charlie.address, ethers.parseEther("5"));
      // paid out through the same pull-payment path
      const w = await bank.withdrawable(charlie.address);
      expect(w).to.be.gte(ethers.parseEther("5"));
    });

    it("board slash compensates the pool and shrinks the eventual loss", async function () {
      const { bank, ali, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).postCollateral(ethers.parseEther("5"), { value: ethers.parseEther("5") });
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("2"), { value: ethers.parseEther("2") });
      await expect(bank.connect(charlie).slashCollateral(charlie.address, 0, 1n, "self"))
        .to.be.revertedWith("Not board");
      await expect(bank.connect(ali).slashCollateral(charlie.address, 0, ethers.parseEther("9"), "too much"))
        .to.be.revertedWith("Exceeds collateral");
      const freeBefore = await bank.freeFunds();
      await expect(bank.connect(ali).slashCollateral(charlie.address, 0, ethers.parseEther("4"), "breach of reporting duty"))
        .to.emit(bank, "CollateralSlashed")
        .withArgs(charlie.address, 0, ethers.parseEther("4"), "breach of reporting duty");
      expect(await bank.freeFunds()).to.equal(freeBefore + ethers.parseEther("4"));
      expect((await bank.proposals(0)).principalReturned).to.equal(ethers.parseEther("6"));
      // slash capped by the remaining shortfall (10 - 6 = 4): 5 is too much
      await expect(bank.connect(ali).slashCollateral(charlie.address, 0, ethers.parseEther("5"), "over"))
        .to.be.revertedWith("Exceeds collateral");
      // write-off books only the un-compensated remainder
      await expect(bank.connect(ali).writeOffProposal(0))
        .to.emit(bank, "ProposalWrittenOff").withArgs(0, ethers.parseEther("4"));
    });

    it("slash completing the principal closes the project", async function () {
      const { bank, ali, charlie } = await deployWithFundedProposal();
      await bank.connect(charlie).postCollateral(ethers.parseEther("10"), { value: ethers.parseEther("10") });
      await bank.connect(charlie).returnPrincipal(0, ethers.parseEther("5"), { value: ethers.parseEther("5") });
      await bank.connect(ali).slashCollateral(charlie.address, 0, ethers.parseEther("5"), "abandoned project");
      expect((await bank.managers(charlie.address)).activeProjects).to.equal(0n);
      // remaining collateral is free to withdraw
      await expect(bank.connect(charlie).withdrawCollateral(ethers.parseEther("5")))
        .to.not.be.reverted;
    });
  });

});
