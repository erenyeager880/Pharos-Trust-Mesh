// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {DAGRegistry} from "../src/dag-executor/DAGRegistry.sol";

contract DeployDAGRegistry is Script {
    function run() external {
        uint16 requiredApprovals = 2;

        vm.startBroadcast();
        DAGRegistry registry = new DAGRegistry(requiredApprovals);
        vm.stopBroadcast();

        console2.log("=== Deploy Result ===");
        console2.log("Registry address:", address(registry));
        console2.log("Required approvals:", requiredApprovals);
        console2.log("Deployer:", msg.sender);
    }
}
