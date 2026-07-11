// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Test helper: a contract that can deposit into SheikhFi but reverts on ETH receive.
// Used to verify that pull-payment distribution cannot be blocked by a bad actor.
contract BadReceiver {
    function deposit(address bank) external payable {
        (bool ok, ) = bank.call{value: msg.value}(
            abi.encodeWithSignature("depositFunds(uint256)", msg.value)
        );
        require(ok, "Deposit failed");
    }

    receive() external payable { revert("I reject payments"); }
    fallback() external payable { revert("I reject payments"); }
}
