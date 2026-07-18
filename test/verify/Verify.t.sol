// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SheikhFi} from "../../contracts/SheikhFi.sol";

/// Symbolic proofs of the Shari'ah-load-bearing invariants (Halmos, a16z).
///
/// Why this file exists next to `test/Invariants.test.js`: that suite walks ONE
/// pseudo-random trajectory (seed 20260711, 200 steps) and checks the same
/// invariants along it. It can only fail to find a counterexample. Halmos
/// executes these functions with SYMBOLIC arguments and proves the assertion
/// holds for EVERY input — or returns a concrete counterexample. Same
/// invariants, same AAOIFI clauses; "not falsified on one walk" becomes
/// "proved for all inputs".
///
/// Proved against the real contract, not a model of it — there is no
/// abstraction to drift out of sync (cf. PLAN.md «Волна v4 §1»).
///
/// Bounds are honest and stated: the pool is instantiated with 3 investors, so
/// the write-off loop is unrolled to 4 (`--loop 4`). Proofs are therefore for
/// all inputs at this pool shape, not for all pool sizes.
///
///   I2 Book equality  — totalFunds == Σ fundsInvested == totalSupply()
///                       (AAOIFI SS 17 3/6 — the share mirrors the books)
///   I3 Accrual monotone — cumulativePerShare never decreases
///                       (AAOIFI SS 12 3/1/5/7 — profit is added, never clawed back)
///   I6 Loss pro-rata  — a write-off preserves relative shares
///                       (AAOIFI SS 12 3/1/5/4 — loss strictly follows capital)
///   v5 §1 Netting     — a write-off nets undistributed revenue into the
///                       shortfall, fee-free (AAOIFI SS 40 3/2/1, SS 13 8/7)
interface Vm {
    function prank(address) external;
    function deal(address, uint256) external;
    function warp(uint256) external;
}

contract VerifyTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SheikhFi internal bank;

    address internal constant ALICE = address(0xA11CE); // investor, 95% profit share
    address internal constant BOB = address(0xB0B); // investor, 80%
    address internal constant CAROL = address(0xCA401); // manager
    address internal constant BOARD = address(0xB0A7D); // sharia board (v5 §5: != owner)

    // owner (this contract) 40 + alice 40 + bob 20 = 100
    uint256 internal constant OWNER_STAKE = 40 ether;
    uint256 internal constant ALICE_STAKE = 40 ether;
    uint256 internal constant BOB_STAKE = 20 ether;
    uint256 internal constant PROJECT = 10 ether;

    receive() external payable {}

    function setUp() public {
        // native denomination; owner == this contract, and is investor #0
        bank = new SheikhFi("Owner", 60, address(0));
        bank.addInvestor(ALICE, "Alice", 95);
        bank.addInvestor(BOB, "Bob", 80);
        bank.addManager(CAROL, "Carol", 20);
        bank.setBoard(BOARD); // certification requires board != owner (v5 §5)

        vm.deal(address(this), 1000 ether);
        vm.deal(ALICE, 1000 ether);
        vm.deal(BOB, 1000 ether);
        vm.deal(CAROL, 1000 ether);

        bank.depositFunds{value: OWNER_STAKE}(OWNER_STAKE);
        vm.prank(ALICE);
        bank.depositFunds{value: ALICE_STAKE}(ALICE_STAKE);
        vm.prank(BOB);
        bank.depositFunds{value: BOB_STAKE}(BOB_STAKE);
    }

    function _book() internal view returns (uint256) {
        return bank.balanceOf(address(this)) + bank.balanceOf(ALICE) + bank.balanceOf(BOB);
    }

    /// A secured, fully-disbursed project — the precondition for revenue and
    /// for a write-off. Single tranche, so approveProposal disburses the whole
    /// amount the moment the vote crosses the threshold (releaseTranche would
    /// revert with "All released").
    function _securedProject() internal {
        vm.prank(CAROL);
        bank.submitProposal("Project", PROJECT, "docs", 1);
        vm.prank(BOARD);
        bank.certifyProposal(0); // v5 §5: only a separated board certifies
        // owner 40% then alice 40% = 80% of shares >= 60% threshold -> secured
        bank.approveProposal(0);
        vm.prank(ALICE);
        bank.approveProposal(0);
    }

    // ------------------------------------------------------------------ I2

    /// I2 — a share transfer moves stake between partners and creates none:
    /// the books and the token supply stay equal for ANY amount. Activity has
    /// commenced (v5 §3, SS 17 5/2/1) — before it every transfer reverts.
    /// AAOIFI SS 17 3/6, 5/2/16 (certificates tradable, pool permissioned).
    function check_I2_transferPreservesBook(uint256 amount) public {
        _securedProject(); // commences activity, opening share transfers
        uint256 supplyBefore = bank.totalSupply();
        vm.prank(ALICE);
        bank.transfer(BOB, amount); // reverting paths are pruned by Halmos
        assert(bank.totalSupply() == supplyBefore); // a transfer mints nothing
        assert(_book() == bank.totalSupply()); // books still mirror the token
    }

    /// I2 — an exit burns exactly what it pays out, for ANY amount, after the
    /// due notice SS 12 3/1/6/1 requires (v5 §2).
    function check_I2_exitPreservesBook(uint256 amount) public {
        vm.prank(ALICE);
        bank.noticeExit();
        vm.warp(block.timestamp + 48 hours + 1);
        uint256 othersBefore = bank.balanceOf(address(this)) + bank.balanceOf(BOB);
        vm.prank(ALICE);
        bank.exit(amount);
        assert(_book() == bank.totalSupply());
        // the exiting partner's withdrawal does not touch anyone else's stake
        assert(bank.balanceOf(address(this)) + bank.balanceOf(BOB) == othersBefore);
    }

    /// I2 — a deposit mints share one-for-one with capital, for ANY amount.
    /// AAOIFI SS 12 3/1/5/3 (shares follow contributions).
    function check_I2_depositPreservesBook(uint256 amount) public {
        uint256 aliceBefore = bank.balanceOf(ALICE);
        uint256 supplyBefore = bank.totalSupply();
        vm.deal(ALICE, amount);
        vm.prank(ALICE);
        bank.depositFunds{value: amount}(amount);
        assert(bank.balanceOf(ALICE) == aliceBefore + amount); // one-for-one
        assert(bank.totalSupply() == supplyBefore + amount);
        assert(_book() == bank.totalSupply());
    }

    // ------------------------------------------------------------------ I3

    /// I3 — profit is only ever added to the accumulator, never clawed back,
    /// for ANY revenue amount. AAOIFI SS 12 3/1/5/7.
    function check_I3_accrualMonotone(uint256 revenue) public {
        _securedProject();
        vm.prank(CAROL);
        bank.returnPrincipal{value: PROJECT}(0, PROJECT); // capital home first
        vm.deal(CAROL, revenue);
        vm.prank(CAROL);
        bank.receiveRevenue{value: revenue}(0, revenue);

        uint256 cpsBefore = bank.cumulativePerShare();
        bank.distributeRevenue(0);
        assert(bank.cumulativePerShare() >= cpsBefore); // never decreases
    }

    // ------------------------------------------------------------------ I6

    /// I6 — the heart of it. For ANY partial repayment, writing off the
    /// shortfall cuts every partner's stake strictly in proportion to capital:
    /// nobody's stake grows on a loss, the books stay equal to the token, and
    /// the pool never writes off more than the loss. AAOIFI SS 12 3/1/5/4 —
    /// "loss must be borne in proportion to the contribution".
    ///
    /// The fuzzer only ever sampled this at concrete losses; here it is proved
    /// for every repayment the contract will accept.
    /// `repaid` is uint64 rather than uint256 on purpose, and this costs no
    /// generality: `returnPrincipal` reverts above the disbursed 10 ether
    /// (1e19 < 2^64), so every value the contract can accept is still covered.
    /// It keeps the solver on 64-bit division instead of 256-bit, which is the
    /// difference between a proof and a timeout.
    function check_I6_writeOffProRata(uint64 repaid) public {
        _securedProject();
        vm.deal(CAROL, repaid);
        vm.prank(CAROL);
        bank.returnPrincipal{value: repaid}(0, repaid); // symbolic partial repayment

        uint256 tfBefore = bank.totalFunds();
        uint256 ownerBefore = bank.balanceOf(address(this));
        uint256 aliceBefore = bank.balanceOf(ALICE);
        uint256 bobBefore = bank.balanceOf(BOB);
        uint256 loss = PROJECT - repaid; // disbursed minus returned

        bank.writeOffProposal(0);

        // THE clause: each partner's cut is exactly their share of the loss,
        // in proportion to capital contributed — AAOIFI SS 12 3/1/5/4.
        // Stated as an equality, not a bound: an equal split, a 1-wei drift,
        // or any rounding in the pool's favour is a counterexample.
        assert(bank.balanceOf(address(this)) == ownerBefore - (ownerBefore * loss) / tfBefore);
        assert(bank.balanceOf(ALICE) == aliceBefore - (aliceBefore * loss) / tfBefore);
        assert(bank.balanceOf(BOB) == bobBefore - (bobBefore * loss) / tfBefore);
        // the books still mirror the token after the pro-rata cut
        assert(_book() == bank.totalSupply());
        // truncation dust stays with the partners: the pool never writes down
        // more than the loss it suffered
        assert(bank.totalFunds() >= tfBefore - loss);
        assert(bank.totalFunds() <= tfBefore);
    }

    // ------------------------------------------------------------------ v5 §1

    /// Write-off nets undistributed revenue into the shortfall FIRST — for
    /// ANY revenue amount the contract will accept. The netted part is
    /// capital recovery: the manager's fee and the owner's cut never touch
    /// it, and the booked loss shrinks by exactly the netted amount.
    /// AAOIFI SS 40 3/2/1 (loss covered from the operation's own proceeds),
    /// SS 13 8/7 (no Mudarib share of a loss-making operation).
    /// `revenue` is uint64 for the same solver-honest reason as `repaid` in
    /// check_I6: receiveRevenue of more than the pool ever handles is
    /// unreachable, and 64-bit division keeps the proof tractable.
    function check_writeOffNetsRevenue(uint64 revenue) public {
        _securedProject();
        vm.deal(CAROL, revenue);
        vm.prank(CAROL);
        bank.receiveRevenue{value: revenue}(0, revenue); // reverts if 0 — pruned

        uint256 tfBefore = bank.totalFunds();
        uint256 freeBefore = bank.freeFunds();
        uint256 mgrBefore = bank.withdrawable(CAROL);
        uint256 ownerBefore = bank.withdrawable(address(this));

        bank.writeOffProposal(0);

        uint256 toward = revenue >= PROJECT ? PROJECT : revenue;
        uint256 loss = PROJECT - toward;
        // the netted revenue came home as capital, not as anyone's profit
        assert(bank.withdrawable(CAROL) == mgrBefore); // no manager fee
        assert(bank.withdrawable(address(this)) == ownerBefore); // no owner cut
        assert(bank.freeFunds() == freeBefore + toward);
        // the loss booked against the partners is the NET shortfall only
        assert(bank.totalFunds() >= tfBefore - loss);
        assert(bank.totalFunds() <= tfBefore);
        assert(_book() == bank.totalSupply());
    }
}
