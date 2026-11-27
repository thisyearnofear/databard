// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ProbeReceiptRegistry} from "../src/ProbeReceiptRegistry.sol";

contract DeployProbeReceiptRegistry is Script {
    // Official SPACE ID Agent ID registry on BNB Smart Chain mainnet.
    address internal constant BSC_AGENT_ID_REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external returns (ProbeReceiptRegistry registry) {
        address agentIdRegistry = vm.envOr("AGENT_ID_REGISTRY", BSC_AGENT_ID_REGISTRY);
        vm.broadcast();
        registry = new ProbeReceiptRegistry(agentIdRegistry);
    }
}
