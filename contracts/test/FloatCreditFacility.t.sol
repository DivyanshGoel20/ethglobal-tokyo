// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {FloatCreditFacility} from "../src/FloatCreditFacility.sol";

abstract contract TestHelper {
    function assertTrue(bool condition) internal pure {
        require(condition, "Assertion failed: expected true");
    }

    function assertFalse(bool condition) internal pure {
        require(!condition, "Assertion failed: expected false");
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "Assertion failed: uints not equal");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "Assertion failed: addresses not equal");
    }

    function assertEq(bytes32 a, bytes32 b) internal pure {
        require(a == b, "Assertion failed: bytes32 not equal");
    }

    function assertEq(string memory a, string memory b) internal pure {
        require(keccak256(bytes(a)) == keccak256(bytes(b)), "Assertion failed: strings not equal");
    }
}

contract FloatCreditFacilityTest is TestHelper {
    MockUSDC public usdc;
    FloatCreditFacility public facility;

    address public owner = address(this);
    address public humanOwner = address(0x1111);
    address public agentA = address(0x2222);
    address public agentB = address(0x3333);
    bytes32 public profileId = keccak256(abi.encodePacked(humanOwner));
    bytes32 public humanRoot = keccak256("world-id-human-root-001");

    function setUp() public {
        usdc = new MockUSDC();
        facility = new FloatCreditFacility(address(usdc));

        // Create human credit profile with $500 USDC limit (500 * 1e6)
        facility.createCreditProfile(profileId, humanOwner, humanRoot, 500 * 1e6);

        // Authorize Agent A and Agent B under Human Profile
        facility.authorizeAgent(profileId, agentA);
        facility.authorizeAgent(profileId, agentB);
    }

    function testProfileCreationAndAgentAuthorization() public {
        FloatCreditFacility.CreditProfile memory p = facility.getProfile(profileId);
        assertEq(p.humanOwner, humanOwner);
        assertEq(p.creditLimit, 500 * 1e6);
        assertEq(p.outstandingDebt, 0);
        assertEq(facility.getRemainingCredit(profileId), 500 * 1e6);

        assertTrue(facility.isAgentAuthorized(profileId, agentA));
        assertTrue(facility.isAgentAuthorized(profileId, agentB));
        assertFalse(facility.isAgentAuthorized(profileId, address(0x9999)));
    }

    function testDrawdownWithoutDirectTokenTransfer() public {
        // Agent A draws $0.03 (30,000 units) to cover an x402 overdraft
        uint256 loanId = facility.recordDrawdown(profileId, agentA, 30_000, 1, keccak256(bytes("x402:/premium-data:tx1")));
        assertEq(loanId, 1);

        assertEq(facility.getOutstandingDebt(profileId), 30_000);
        assertEq(facility.getRemainingCredit(profileId), 500 * 1e6 - 30_000);

        FloatCreditFacility.Drawdown memory d = facility.getDrawdown(loanId);
        assertEq(d.agentAddress, agentA);
        assertEq(d.amount, 30_000);
        assertEq(d.referenceHash, keccak256(bytes("x402:/premium-data:tx1")));
        assertEq(d.paymentCount, 1);

        // Notice: Contract does NOT transfer USDC to agent, as the x402 payment
        // is covered directly by Float's Gateway funding facility.
        assertEq(usdc.balanceOf(agentA), 0);
    }

    function testMultiAgentSharedHumanCreditLimit() public {
        // Human credit limit = $500
        // Agent A draws $50
        facility.recordDrawdown(profileId, agentA, 50 * 1e6, 1, keccak256(bytes("x402:batch-1")));
        // Agent B draws $30
        facility.recordDrawdown(profileId, agentB, 30 * 1e6, 1, keccak256(bytes("x402:batch-2")));

        // Total Human Outstanding Debt = $80
        assertEq(facility.getOutstandingDebt(profileId), 80 * 1e6);
        assertEq(facility.getRemainingCredit(profileId), 420 * 1e6);

        // Agent B repays $50 on behalf of the human profile
        (uint256 repaid, uint256 remaining) = facility.recordRepayment(profileId, agentB, agentA, 50 * 1e6);
        assertEq(repaid, 50 * 1e6);
        assertEq(remaining, 30 * 1e6);
        assertEq(facility.getOutstandingDebt(profileId), 30 * 1e6);

        // Repay remaining $30
        facility.recordRepayment(profileId, humanOwner, agentB, 30 * 1e6);
        assertEq(facility.getOutstandingDebt(profileId), 0);
        assertEq(facility.getRemainingCredit(profileId), 500 * 1e6);
    }

    function testExcessRepaymentCapped() public {
        // Agent A draws $20
        facility.recordDrawdown(profileId, agentA, 20 * 1e6, 1, keccak256(bytes("x402:draw-1")));
        assertEq(facility.getOutstandingDebt(profileId), 20 * 1e6);

        // Payer attempts to repay $25
        (uint256 actualRepaid, uint256 remainingDebt) = facility.recordRepayment(profileId, agentA, agentA, 25 * 1e6);
        assertEq(actualRepaid, 20 * 1e6);
        assertEq(remainingDebt, 0);
        assertEq(facility.getOutstandingDebt(profileId), 0);
    }

    function testOnChainRepayWithToken() public {
        // Agent A draws $10
        facility.recordDrawdown(profileId, agentA, 10 * 1e6, 1, keccak256(bytes("x402:token-draw")));

        // Mint USDC to payer and approve facility
        usdc.mint(address(this), 10 * 1e6);
        usdc.approve(address(facility), 10 * 1e6);

        (uint256 repaid, uint256 remaining) = facility.repayWithToken(profileId, agentA, 10 * 1e6);
        assertEq(repaid, 10 * 1e6);
        assertEq(remaining, 0);
        assertEq(usdc.balanceOf(address(facility)), 10 * 1e6);
    }
}
