// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SheikhFi} from "../../../contracts/SheikhFi.sol";

interface Vm {
    function prank(address) external;
    function deal(address, uint256) external;
    function warp(uint256) external;
}

/// The invariant campaign's actor (PLAN v4 §4). Every public op GUARANTEES it
/// does not revert under `fail_on_revert = true`: preconditions are created
/// (deposit before submit) or the draw no-ops (guarded early return). No-ops
/// are legal; vacuity is policed separately — the ghosts below feed
/// `test_campaignReachedTerminalStates`, and the call table printed by forge
/// is the acceptance artefact, not the green tick.
///
/// The handler itself is the pool's owner (and investor #0): owner-gated ops
/// are direct calls, board ops are pranked from BOARD (v5 §5 keeps the roles
/// separate — certification would revert otherwise), partner/manager ops are
/// pranked per actor.
contract Handler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SheikhFi public bank;

    address public constant BOARD = address(0xB0A7D);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);
    address internal constant ERIN = address(0xE7212);

    address[3] public investors; // handler (owner), ALICE, BOB
    address[2] public managersA; // CAROL, ERIN

    // ghosts — the campaign's own coverage report
    uint256 public ghost_deposited;
    uint256 public ghost_submitted;
    uint256 public ghost_voted;
    uint256 public ghost_funded;
    uint256 public ghost_returned;
    uint256 public ghost_revenue;
    uint256 public ghost_distributed;
    uint256 public ghost_writtenOff;
    uint256 public ghost_released;
    uint256 public ghost_exited;
    uint256 public ghost_slashed;
    uint256 public ghost_slashedPostWriteOff;
    uint256 public ghost_transferred;
    bool public ghost_cpsDecreased; // I3 witness — must stay false
    uint256 internal prevCps;

    receive() external payable {} // owner cut / withdrawals land here

    constructor() {
        bank = new SheikhFi("Owner", 50, address(0));
        bank.setBoard(BOARD); // v5 §5: board must differ from the owner
        // v7: zero delay — each slash op proposes and executes atomically;
        // the delay gate itself is unit-tested
        bank.setSlashDelay(0);
        bank.addInvestor(ALICE, "Alice", 95);
        bank.addInvestor(BOB, "Bob", 80);
        bank.addManager(CAROL, "Carol", 20);
        bank.addManager(ERIN, "Erin", 30);
        investors = [address(this), ALICE, BOB];
        managersA = [CAROL, ERIN];
    }

    // ------------------------------------------------------------- utilities

    function _bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        if (max <= min) return min;
        return min + (x % (max - min + 1));
    }

    modifier notesCps() {
        _;
        uint256 cps = bank.cumulativePerShare();
        if (cps < prevCps) ghost_cpsDecreased = true;
        prevCps = cps;
    }

    function _investor(uint256 seed) internal view returns (address) {
        return investors[seed % investors.length];
    }

    function _manager(uint256 seed) internal view returns (address) {
        return managersA[seed % managersA.length];
    }

    /// Scan proposals from a seeded offset for one matching `kind`; the ids
    /// array only grows, so the loop is bounded by the current count.
    function _findProposal(uint256 seed, uint8 kind) internal view returns (bool ok, uint256 id) {
        uint256 n = bank.getProposalCount();
        for (uint256 i = 0; i < n; i++) {
            // seed % n FIRST: the fuzzer hands out seeds near type(uint).max
            // and (seed + i) would overflow before the modulo
            uint256 cand = (seed % n + i) % n;
            (, , uint fundsRequired, bool secured, uint revenueReceived, uint revenuePaid, ,
             uint deadline, bool cancelled, uint principalReturned, bool writtenOff, , , , ,
             uint lossWrittenOff, uint lossRestored) = bank.proposals(cand);
            uint released = bank.releasedAmount(cand);
            if (kind == 0) { // open for voting
                (bool certified, ) = _certState(cand);
                if (certified && !secured && !cancelled && block.timestamp <= deadline
                    && fundsRequired <= bank.freeFunds()) return (true, cand);
            } else if (kind == 1) { // live: secured, not written off
                if (secured && !writtenOff) return (true, cand);
            } else if (kind == 2) { // principal outstanding
                if (secured && !writtenOff && released > principalReturned) return (true, cand);
            } else if (kind == 3) { // distributable
                if (secured && principalReturned == released
                    && revenueReceived > revenuePaid && bank.totalFunds() > 0) return (true, cand);
            } else if (kind == 4) { // write-offable: an actual shortfall or
                // unreleased tranches; revenue-on-hand alone is NOT enough
                // (with a zero shortfall the netting consumes nothing and the
                // contract reverts "Nothing to write off")
                uint unreleased = fundsRequired - released;
                if (secured && !writtenOff
                    && (released > principalReturned || unreleased > 0))
                    return (true, cand);
            } else if (kind == 5) { // post-write-off slash headroom
                if (writtenOff && lossWrittenOff > lossRestored && bank.totalFunds() > 0)
                    return (true, cand);
            }
        }
        return (false, 0);
    }

    function _certState(uint256 id) internal view returns (bool certified, address manager) {
        (address m, , , , , , , , , , , , , , bool cert, , ) = bank.proposals(id);
        return (cert, m);
    }

    function _managerOf(uint256 id) internal view returns (address m) {
        (m, , , , , , , , , , , , , , , , ) = bank.proposals(id);
    }

    // ------------------------------------------------------------------- ops

    function deposit(uint256 seed, uint256 amt) public notesCps {
        address inv = _investor(seed);
        amt = _bound(amt, 0.001 ether, 50 ether);
        vm.deal(inv, amt);
        if (inv != address(this)) vm.prank(inv);
        bank.depositFunds{value: amt}(amt);
        ghost_deposited++;
    }

    function submitAndCertify(uint256 seed, uint256 amtSeed, uint256 trSeed) public notesCps {
        if (bank.freeFunds() == 0) deposit(seed, amtSeed);
        address m = _manager(seed);
        uint256 req = _bound(amtSeed, 1, bank.freeFunds());
        uint256 tranches = _bound(trSeed, 1, 3);
        vm.prank(m);
        bank.submitProposal("P", req, "docs", tranches);
        // compute the id BEFORE pranking: the staticcall would consume the prank
        uint256 pid = bank.getProposalCount() - 1;
        vm.prank(BOARD);
        bank.certifyProposal(pid);
        ghost_submitted++;
    }

    function vote(uint256 seed) public notesCps {
        if (bank.totalFunds() == 0) deposit(seed, seed >> 8); // approve reverts "No investors"
        (bool ok, uint256 id) = _findProposal(seed, 0);
        if (!ok) { submitAndCertify(seed, seed >> 8, seed >> 16); (ok, id) = _findProposal(seed, 0); }
        if (!ok) return;
        // pick a voter who has not voted yet; stake may be zero — legal vote
        for (uint256 i = 0; i < investors.length; i++) {
            address v = investors[(seed % investors.length + i) % investors.length];
            if (bank.hasVoted(id, v)) continue;
            bool wasSecured = _secured(id);
            if (v != address(this)) vm.prank(v);
            bank.approveProposal(id);
            ghost_voted++;
            if (!wasSecured && _secured(id)) ghost_funded++;
            return;
        }
    }

    function _secured(uint256 id) internal view returns (bool s) {
        (, , , s, , , , , , , , , , , , , ) = bank.proposals(id);
    }

    function returnPrincipal(uint256 seed, uint256 amtSeed) public notesCps {
        (bool ok, uint256 id) = _findProposal(seed, 2);
        if (!ok) return;
        (, , , , , , , , , uint principalReturned, , , , , , , ) = bank.proposals(id);
        uint256 owed = bank.releasedAmount(id) - principalReturned;
        uint256 amt = _bound(amtSeed, 1, owed);
        address m = _managerOf(id);
        vm.deal(m, amt);
        vm.prank(m);
        bank.returnPrincipal{value: amt}(id, amt);
        ghost_returned++;
    }

    function receiveRevenue(uint256 seed, uint256 amtSeed) public notesCps {
        (bool ok, uint256 id) = _findProposal(seed, 1);
        if (!ok) return;
        uint256 amt = _bound(amtSeed, 1, 20 ether);
        address m = _managerOf(id);
        vm.deal(m, amt);
        vm.prank(m);
        bank.receiveRevenue{value: amt}(id, amt);
        ghost_revenue++;
    }

    function distribute(uint256 seed) public notesCps {
        (bool ok, uint256 id) = _findProposal(seed, 3);
        if (!ok) return;
        bank.distributeRevenue(id); // handler is the owner
        ghost_distributed++;
    }

    function writeOff(uint256 seed) public notesCps {
        (bool ok, uint256 id) = _findProposal(seed, 4);
        if (!ok) return;
        bank.writeOffProposal(id);
        ghost_writtenOff++;
    }

    function release(uint256 seed) public notesCps {
        uint256 n = bank.getProposalCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 cand = (seed % n + i) % n;
            (, , , bool secured, , , , , , , bool writtenOff, , uint tranches,
             uint tranchesReleased, , , ) = bank.proposals(cand);
            if (secured && !writtenOff && tranchesReleased < tranches) {
                vm.prank(BOARD);
                bank.releaseTranche(cand);
                ghost_released++;
                return;
            }
        }
    }

    function exitFlow(uint256 seed, uint256 amtSeed) public notesCps {
        address inv = _investor(seed);
        (, , uint stake, , ) = bank.investors(inv);
        uint256 cap = stake < bank.freeFunds() ? stake : bank.freeFunds();
        if (cap == 0) return;
        if (inv != address(this)) vm.prank(inv);
        bank.noticeExit();
        vm.warp(block.timestamp + bank.noticePeriod() + 1);
        uint256 amt = _bound(amtSeed, 1, cap);
        // free funds may only have shrunk by nothing during the warp; re-cap
        uint256 cap2 = stake < bank.freeFunds() ? stake : bank.freeFunds();
        if (cap2 == 0) return;
        if (amt > cap2) amt = cap2;
        if (inv != address(this)) vm.prank(inv);
        bank.exit(amt);
        ghost_exited++;
    }

    function postCollateral(uint256 seed, uint256 amtSeed) public notesCps {
        address m = _manager(seed);
        uint256 amt = _bound(amtSeed, 0.001 ether, 10 ether);
        vm.deal(m, amt);
        vm.prank(m);
        bank.postCollateral{value: amt}(amt);
    }

    function slash(uint256 seed, uint256 amtSeed) public notesCps {
        // live branch first, then the post-write-off restoration branch
        (bool ok, uint256 id) = _findProposal(seed, 2);
        if (ok) {
            address m = _managerOf(id);
            (, , , , uint coll, ) = bank.managers(m);
            (, , , , , , , , , uint principalReturned, , , , , , , ) = bank.proposals(id);
            uint256 cap = bank.releasedAmount(id) - principalReturned;
            if (coll < cap) cap = coll;
            if (cap == 0) return;
            uint256 amt = _bound(amtSeed, 1, cap);
            vm.prank(BOARD);
            bank.proposeSlash(m, id, amt, "walk verdict");
            uint256 sid = bank.getPendingSlashCount() - 1;
            vm.prank(BOARD);
            bank.executeSlash(sid);
            ghost_slashed++;
            return;
        }
        (ok, id) = _findProposal(seed, 5);
        if (!ok) return;
        address m2 = _managerOf(id);
        (, , , , uint coll2, ) = bank.managers(m2);
        (, , , , , , , , , , , , , , , uint lossW, uint lossR) = bank.proposals(id);
        uint256 cap2 = lossW - lossR;
        if (coll2 < cap2) cap2 = coll2;
        if (cap2 == 0) return;
        uint256 amt2 = _bound(amtSeed, 1, cap2);
        vm.prank(BOARD);
        bank.proposeSlash(m2, id, amt2, "post-mortem verdict");
        uint256 sid2 = bank.getPendingSlashCount() - 1;
        vm.prank(BOARD);
        bank.executeSlash(sid2);
        ghost_slashed++;
        ghost_slashedPostWriteOff++;
    }

    function transferShares(uint256 seed, uint256 amtSeed) public notesCps {
        if (!bank.activityCommenced()) return;
        address from = _investor(seed);
        address to = _investor((seed % investors.length) + 1);
        if (from == to) return;
        (, , uint stake, , ) = bank.investors(from);
        if (stake == 0) return;
        if (from != address(this)) vm.prank(from);
        bank.transfer(to, _bound(amtSeed, 1, stake));
        ghost_transferred++;
    }

    function withdrawCall(uint256 seed) public notesCps {
        address a = seed % 2 == 0 ? _investor(seed) : _manager(seed);
        uint256 due = bank.withdrawable(a);
        if (bank.isInvestor(a)) {
            (uint myPending, ) = bank.pendingAccrual(a);
            due += myPending;
        }
        if (due == 0) return;
        if (a != address(this)) vm.prank(a);
        bank.withdraw();
    }

    function settleAll(uint256) public notesCps {
        address[] memory invs = new address[](investors.length);
        for (uint256 i = 0; i < investors.length; i++) invs[i] = investors[i];
        bank.settleBatch(invs);
    }

    // -------------------------------------------------------- invariant views

    function sumStakes() external view returns (uint256 s) {
        for (uint256 i = 0; i < investors.length; i++) {
            (, , uint f, , ) = bank.investors(investors[i]);
            s += f;
        }
    }

    function sumOwed() external view returns (uint256 s) {
        s = bank.freeFunds();
        for (uint256 i = 0; i < investors.length; i++) s += bank.withdrawable(investors[i]);
        for (uint256 i = 0; i < managersA.length; i++) {
            s += bank.withdrawable(managersA[i]);
            (, , , , uint coll, ) = bank.managers(managersA[i]);
            s += coll;
        }
    }
}
