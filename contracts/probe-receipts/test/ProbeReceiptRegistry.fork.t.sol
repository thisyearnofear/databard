// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProbeReceiptRegistry} from "../src/ProbeReceiptRegistry.sol";

contract ProbeReceiptRegistryForkTest is Test {
    address internal constant BSC_AGENT_ID_REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    // Owner of the public `reckon` Agent ID at the validation snapshot.
    address internal constant RECKON_AGENT_ID_OWNER = 0xf1e53E3eB8cd8e7D735e51cF21061aA8b0c3eDdd;

    function testRealAgentIdHolderCanRequestOnBscFork() public {
        string memory rpcUrl = vm.envOr("BSC_FORK_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            emit log("BSC_FORK_RPC_URL unset; fork validation skipped");
            return;
        }

        // Pin the fork block so the test is deterministic: if the reckon Agent ID
        // is ever transferred/burned or the registry migrates, latest-block forking
        // would break CI mysteriously. If the RPC cannot serve state this far back,
        // use an archive endpoint via BSC_FORK_RPC_URL.
        vm.createSelectFork(rpcUrl, 136200000);
        ProbeReceiptRegistry registry = new ProbeReceiptRegistry(BSC_AGENT_ID_REGISTRY);
        assertTrue(registry.hasAgentId(RECKON_AGENT_ID_OWNER));

        string memory subjectUri = "probe:mcp:https://reckon.markets/api/mcp";
        bytes32 subjectHash = keccak256(bytes(subjectUri));
        vm.prank(RECKON_AGENT_ID_OWNER);
        registry.requestProbe(subjectHash, subjectUri);

        (address firstRequester,,, uint32 totalRequests, uint32 uniqueRequesters) = registry.requests(subjectHash);
        assertEq(firstRequester, RECKON_AGENT_ID_OWNER);
        assertEq(totalRequests, 1);
        assertEq(uniqueRequesters, 1);
    }
}
