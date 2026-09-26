// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LifelineCreditFacility} from "../src/LifelineCreditFacility.sol";

/**
 * Deploys the facility to Arc testnet.
 *
 * DeployLifeline stands up a MockUSDC beside the facility, which is right for a
 * local chain and wrong on Arc: USDC there is native, exposed as an ERC-20 at
 * a fixed precompile, and repayWithToken has to pull the real thing.
 *
 *   forge script script/DeployArc.s.sol --rpc-url arc_testnet --broadcast
 */
contract DeployArc is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (LifelineCreditFacility facility) {
        address usdc = vm.envOr("NEXT_PUBLIC_USDC_ADDRESS", ARC_USDC);

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        facility = new LifelineCreditFacility(usdc);
        vm.stopBroadcast();

        console2.log("LifelineCreditFacility", address(facility));
        console2.log("usdc", usdc);
        console2.log("owner", facility.owner());
    }
}
