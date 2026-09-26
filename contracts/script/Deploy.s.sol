// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {FloatCreditFacility} from "../src/FloatCreditFacility.sol";

/**
 * Deploys the facility the rest of the stack actually targets.
 *
 * This script used to deploy FloatCreditManager, while the web app and the
 * subgraph both bound to FloatCreditFacility's ABI - so the hardened contract
 * and the deployed one were not the same contract.
 *
 * The facility is a ledger, not a pool: a drawdown records debt and Float's
 * funding wallet settles the x402 payment off-chain. USDC only enters on
 * repayWithToken and only leaves on withdraw, so there is no liquidity to seed.
 */
contract DeployFloat {
    function run() external returns (address usdcAddr, address facilityAddr) {
        MockUSDC usdc = new MockUSDC();
        FloatCreditFacility facility = new FloatCreditFacility(address(usdc));

        return (address(usdc), address(facility));
    }
}
