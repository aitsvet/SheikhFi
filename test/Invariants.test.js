const { expect } = require("chai");
const { ethers } = require("hardhat");

// Sharia-load-bearing invariants, continuously checked over a randomized
// (seeded, reproducible) op sequence — the hardhat-flavoured analogue of a
// Foundry invariant suite. Each invariant cites the AAOIFI clause it encodes
// (quotes in STANDARDS.md).
//
//   I1 Solvency        — contract balance covers freeFunds + all withdrawable
//                        + all collateral (pull-payments always payable).
//   I2 Book equality   — totalFunds == Σ fundsInvested == totalSupply()
//                        (tokenized share mirrors the books; SS 17 3/6).
//   I3 Accrual monotone— cumulativePerShare never decreases (profit is only
//                        added, never a clawback; SS 12 3/1/5/7).
//   I4 Profit gate     — a successful distribute implies capital home or
//                        written off at that moment (SS 13 8/7, SS 12 3/1/5/6).
//   I5 Frozen votes    — approvalWeight changes only by voting, never by
//                        later deposits/exits (vote weight frozen at cast).
//   I6 Loss pro-rata   — a write-off preserves investors' relative shares
//                        (SS 12 3/1/5/4), up to 1 wei of truncation each.

// deterministic PRNG — reproducible failures
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Invariants (randomized ops)", function () {
  it("I1–I6 hold across a seeded random op sequence", async function () {
    const [ali, bob, dave, charlie, erin] = await ethers.getSigners();
    const SheikhFi = await ethers.getContractFactory("SheikhFi");
    const bank = await SheikhFi.deploy("Ali", 60, ethers.ZeroAddress);
    await bank.waitForDeployment();
    const bankAddr = await bank.getAddress();

    await bank.addInvestor(bob.address, "Bob", 95);
    await bank.addInvestor(dave.address, "Dave", 80);
    await bank.addManager(charlie.address, "Charlie", 20);
    await bank.addManager(erin.address, "Erin", 30);

    const investors = [ali, bob, dave];
    const managersS = [charlie, erin];
    const everyone = [ali, bob, dave, charlie, erin];
    const rnd = mulberry32(20260711);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const amount = () => ethers.parseEther((rnd() * 3 + 0.001).toFixed(6));

    let proposalCount = 0;
    let lastOp = '';
    let lastOpProposal = -1;

    // bounded random actions; "legal" reverts are part of the walk
    const ops = [
      async () => {
        lastOp = 'deposit';
        const s = pick(investors); const a = amount();
        await bank.connect(s).depositFunds(a, { value: a });
      },
      async () => {
        lastOp = 'submit+certify';
        const m = pick(managersS);
        const free = await bank.freeFunds();
        if (free === 0n) return;
        const req = free / BigInt(2 + Math.floor(rnd() * 3));
        if (req === 0n) return;
        const tranches = 1 + Math.floor(rnd() * 3);
        await bank.connect(m).submitProposal(`P${proposalCount}`, req, "", tranches);
        await bank.certifyProposal(proposalCount);
        proposalCount += 1;
      },
      async () => {
        if (proposalCount === 0) return;
        lastOp = 'vote';
        lastOpProposal = Math.floor(rnd() * proposalCount);
        await bank.connect(pick(investors)).approveProposal(lastOpProposal);
      },
      async () => {
        if (proposalCount === 0) return;
        lastOp = 'release';
        await bank.releaseTranche(Math.floor(rnd() * proposalCount));
      },
      async () => {
        if (proposalCount === 0) return;
        lastOp = 'returnPrincipal';
        const id = Math.floor(rnd() * proposalCount);
        const p = await bank.proposals(id);
        const released = await bank.releasedAmount(id);
        const owed = released - p.principalReturned;
        if (owed === 0n) return;
        const a = owed / BigInt(1 + Math.floor(rnd() * 2));
        if (a === 0n) return;
        const m = managersS.find(s => s.address === p.manager) ?? charlie;
        await bank.connect(m).returnPrincipal(id, a, { value: a });
      },
      async () => {
        if (proposalCount === 0) return;
        lastOp = 'revenue';
        const id = Math.floor(rnd() * proposalCount);
        const p = await bank.proposals(id);
        const a = amount();
        const m = managersS.find(s => s.address === p.manager) ?? charlie;
        await bank.connect(m).receiveRevenue(id, a, { value: a });
      },
      async () => {
        if (proposalCount === 0) return;
        lastOp = 'distribute';
        lastOpProposal = Math.floor(rnd() * proposalCount);
        await bank.distributeRevenue(lastOpProposal);
        // I4 — profit recognised only with capital home or written down
        const p = await bank.proposals(lastOpProposal);
        const released = await bank.releasedAmount(lastOpProposal);
        expect(p.writtenOff || p.principalReturned === released,
          "I4: distribute without capital maintenance").to.be.true;
      },
      async () => {
        if (proposalCount === 0) return;
        lastOp = 'writeOff';
        await bank.writeOffProposal(Math.floor(rnd() * proposalCount));
      },
      async () => {
        lastOp = 'exit';
        const s = pick(investors);
        const stake = (await bank.investors(s.address)).fundsInvested;
        const free = await bank.freeFunds();
        const cap = stake < free ? stake : free;
        if (cap === 0n) return;
        const a = cap / BigInt(1 + Math.floor(rnd() * 4)) + 1n;
        await bank.connect(s).exit(a > cap ? cap : a);
      },
      async () => {
        lastOp = 'transferShares';
        const from = pick(investors); const to = pick(investors);
        if (from.address === to.address) return;
        const stake = (await bank.investors(from.address)).fundsInvested;
        if (stake === 0n) return;
        await bank.connect(from).transfer(to.address, stake / 3n + 1n);
      },
      async () => {
        lastOp = 'collateral';
        const m = pick(managersS); const a = amount();
        await bank.connect(m).postCollateral(a, { value: a });
      },
      async () => {
        if (proposalCount === 0) return;
        lastOp = 'slash';
        const id = Math.floor(rnd() * proposalCount);
        const p = await bank.proposals(id);
        const released = await bank.releasedAmount(id);
        const shortfall = released > p.principalReturned ? released - p.principalReturned : 0n;
        const coll = (await bank.managers(p.manager)).collateral;
        const cap = shortfall < coll ? shortfall : coll;
        if (cap === 0n) return;
        await bank.slashCollateral(p.manager, id, cap / 2n + 1n, "invariant-walk verdict");
      },
      async () => {
        lastOp = 'withdraw';
        await bank.connect(pick(everyone)).withdraw();
      },
      async () => {
        lastOp = 'settle';
        await bank.settleBatch(investors.map(s => s.address));
      },
    ];

    let prevCps = 0n;
    let prevWeights = [];

    const checkInvariants = async () => {
      // I1 — solvency
      let owed = await bank.freeFunds();
      for (const s of everyone) owed += await bank.withdrawable(s.address);
      for (const s of managersS) owed += (await bank.managers(s.address)).collateral;
      const balance = await ethers.provider.getBalance(bankAddr);
      expect(balance, `I1 solvency after ${lastOp}`).to.be.gte(owed);

      // I2 — books == token
      let stakes = 0n;
      for (const s of investors) stakes += (await bank.investors(s.address)).fundsInvested;
      const tf = await bank.totalFunds();
      expect(stakes, `I2 books after ${lastOp}`).to.equal(tf);
      expect(await bank.totalSupply(), `I2 supply after ${lastOp}`).to.equal(tf);

      // I3 — accrual accumulator is monotone
      const cps = await bank.cumulativePerShare();
      expect(cps, `I3 monotone after ${lastOp}`).to.be.gte(prevCps);
      prevCps = cps;

      // I5 — vote weights frozen except by voting on that proposal
      const weights = [];
      for (let i = 0; i < proposalCount; i++) {
        weights.push((await bank.proposals(i)).approvalWeight);
        if (prevWeights[i] !== undefined
            && !(lastOp === 'vote' && lastOpProposal === i)) {
          expect(weights[i], `I5 frozen vote on #${i} after ${lastOp}`)
            .to.equal(prevWeights[i]);
        }
      }
      prevWeights = weights;
    };

    for (let step = 0; step < 200; step++) {
      const sharesBefore = [];
      for (const s of investors) {
        sharesBefore.push((await bank.investors(s.address)).fundsInvested);
      }
      const tfBefore = await bank.totalFunds();

      try {
        await ops[Math.floor(rnd() * ops.length)]();
      } catch (e) {
        // legal reverts (guards doing their job) are part of the walk;
        // panics are not
        expect(String(e.message), `panic during ${lastOp}`).to.not.match(/panic/i);
      }

      // I6 — write-off keeps relative shares (±1 wei truncation per investor)
      if (lastOp === 'writeOff' && tfBefore > 0n) {
        const tfAfter = await bank.totalFunds();
        if (tfAfter !== tfBefore) { // a loss was actually booked
          for (let i = 0; i < investors.length; i++) {
            const after = (await bank.investors(investors[i].address)).fundsInvested;
            const expected = sharesBefore[i] * tfAfter / tfBefore;
            expect(after, `I6 pro-rata for investor ${i}`)
              .to.be.closeTo(expected, 2n);
          }
        }
      }

      await checkInvariants();
    }
  });
});
