// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {LifelineCreditFacility} from "../src/LifelineCreditFacility.sol";

/**
 * Deploys the facility the rest of the stack actually targets.
 *
 * This script used to deploy LifelineCreditManager, while the web app and the
 * subgraph both bound to LifelineCreditFacility's ABI - so the hardened contract
 * and the deployed one were not the same contract.
 *
 * The facility is a ledger, not a pool: a drawdown records debt and Lifeline's
 * funding wallet settles the x402 payment off-chain. USDC only enters on
 * repayWithToken and only leaves on withdraw, so there is no liquidity to seed.
 */
contract DeployLifeline {
    function run() external returns (address usdcAddr, address facilityAddr) {
        MockUSDC usdc = new MockUSDC();
        LifelineCreditFacility facility = new LifelineCreditFacility(address(usdc));

        return (address(usdc), address(facility));
    }
}
