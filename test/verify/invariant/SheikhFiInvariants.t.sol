// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Handler} from "./Handler.sol";

/// Foundry invariant campaign (PLAN v4 §4) — the fail_on_revert counterpart
/// of the seeded hardhat walk in test/Invariants.test.js (which stays as the
/// fast regression). Every state-changing selector must show Reverts = 0 in
/// forge's call table; reachability of the terminal states is a deterministic
/// test, not an invariant — an invariant must also hold in the initial state.
///
/// No forge-std (libs = []): the targetContracts/targetSelectors introspection
/// functions forge queries are implemented directly.
contract SheikhFiInvariantsTest {
    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    Handler internal handler;

    function setUp() public {
        handler = new Handler();
    }

    function targetContracts() public view returns (address[] memory t) {
        t = new address[](1);
        t[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory f) {
        bytes4[] memory sel = new bytes4[](13);
        sel[0]  = Handler.deposit.selector;
        sel[1]  = Handler.submitAndCertify.selector;
        sel[2]  = Handler.vote.selector;
        sel[3]  = Handler.returnPrincipal.selector;
        sel[4]  = Handler.receiveRevenue.selector;
        sel[5]  = Handler.distribute.selector;
        sel[6]  = Handler.writeOff.selector;
        sel[7]  = Handler.release.selector;
        sel[8]  = Handler.exitFlow.selector;
        sel[9]  = Handler.postCollateral.selector;
        sel[10] = Handler.slash.selector;
        sel[11] = Handler.transferShares.selector;
        sel[12] = Handler.withdrawCall.selector;
        f = new FuzzSelector[](1);
        f[0] = FuzzSelector({addr: address(handler), selectors: sel});
    }

    /// I1 — solvency: the contract balance covers the free pool, every
    /// participant's withdrawable and every manager's collateral.
    function invariant_I1_solvency() public view {
        assert(address(handler.bank()).balance >= handler.sumOwed());
    }

    /// I2 — the books equal the token: totalFunds == Σ fundsInvested ==
    /// totalSupply (AAOIFI SS 17 3/6 — the share mirrors the books).
    function invariant_I2_books() public view {
        uint256 tf = handler.bank().totalFunds();
        assert(handler.sumStakes() == tf);
        assert(handler.bank().totalSupply() == tf);
    }

    /// I3 — the profit accumulator never decreases (AAOIFI SS 12 3/1/5/7);
    /// the handler notes any decrease after every op.
    function invariant_I3_cpsMonotone() public view {
        assert(!handler.ghost_cpsDecreased());
    }

    /// Reachability is a deterministic test, not an invariant: drive the full
    /// v5 lifecycle — fund, partial return, revenue, netting write-off,
    /// post-write-off verdict, exit after notice, transfer after activity —
    /// so a regression to a walk that touches nothing fails loudly here even
    /// though the invariants above would stay vacuously green.
    function test_campaignReachedTerminalStates() public {
        handler.deposit(1, 30 ether);
        handler.deposit(2, 30 ether);
        handler.submitAndCertify(0, 10 ether, 1);
        handler.vote(0);
        handler.vote(1);
        assert(handler.ghost_funded() > 0);

        handler.postCollateral(0, 8 ether);
        handler.returnPrincipal(0, 1 ether);
        handler.receiveRevenue(0, 3 ether);
        handler.writeOff(0); // nets the revenue on hand first (v5 §1)
        assert(handler.ghost_writtenOff() > 0);

        handler.slash(0, type(uint256).max); // post-mortem restoration branch
        assert(handler.ghost_slashedPostWriteOff() > 0);

        handler.transferShares(1, 1 ether); // ALICE→BOB: activity commenced above
        assert(handler.ghost_transferred() > 0);

        handler.exitFlow(1, 1 ether); // notice + warp + exit
        assert(handler.ghost_exited() > 0);

        handler.withdrawCall(0);
        handler.settleAll(0);
    }
}
