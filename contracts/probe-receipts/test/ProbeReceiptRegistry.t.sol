// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProbeReceiptRegistry} from "../src/ProbeReceiptRegistry.sol";

contract MockAgentIdRegistry {
    mapping(address => uint256) public balanceOf;

    function mint(address account) external {
        balanceOf[account] = 1;
    }
}

contract ProbeReceiptRegistryTest is Test {
    ProbeReceiptRegistry internal registry;
    MockAgentIdRegistry internal agentId;

    address internal publisher = address(0xA11CE);
    address internal holder = address(0xB0B);
    address internal stranger = address(0xBAD);

    string internal subjectUri = "a2mcp://example.test/service";
    bytes32 internal subjectHash = keccak256(bytes(subjectUri));
    string internal evidenceUri = "https://databard.persidian.com/probe/receipts/example.json";
    bytes32 internal evidenceHash = keccak256(bytes("measured evidence"));

    function setUp() public {
        vm.warp(1_700_000_000);
        agentId = new MockAgentIdRegistry();
        vm.prank(publisher);
        registry = new ProbeReceiptRegistry(address(agentId));
        agentId.mint(holder);
    }

    function publish(uint8 score, uint8 status, uint40 checkedAt, bytes32 evidenceHash_) internal {
        registry.publishReceipt(
            ProbeReceiptRegistry.ReceiptInput({
                subjectHash: subjectHash,
                subjectUri: subjectUri,
                score: score,
                status: status,
                checkedAt: checkedAt,
                evidenceHash: evidenceHash_,
                evidenceUri: evidenceUri
            })
        );
    }

    function testAgentIdHolderCanRequestProbe() public {
        vm.prank(holder);
        registry.requestProbe(subjectHash, subjectUri);

        (
            address firstRequester,
            uint40 firstRequestedAt,
            uint40 lastRequestedAt,
            uint32 totalRequests,
            uint32 uniqueRequesters
        ) = registry.requests(subjectHash);

        assertEq(firstRequester, holder);
        assertEq(firstRequestedAt, uint40(block.timestamp));
        assertEq(lastRequestedAt, uint40(block.timestamp));
        assertEq(totalRequests, 1);
        assertEq(uniqueRequesters, 1);
        assertTrue(registry.hasRequested(subjectHash, holder));
    }

    function testRequestCountsRepeatDemandWithoutDoubleCountingIdentity() public {
        vm.startPrank(holder);
        registry.requestProbe(subjectHash, subjectUri);
        vm.warp(block.timestamp + 1 hours);
        registry.requestProbe(subjectHash, subjectUri);
        vm.stopPrank();

        (,,, uint32 totalRequests, uint32 uniqueRequesters) = registry.requests(subjectHash);
        assertEq(totalRequests, 2);
        assertEq(uniqueRequesters, 1);
    }

    function testNonHolderCannotRequestProbe() public {
        vm.prank(stranger);
        vm.expectRevert(ProbeReceiptRegistry.NotAgentIdHolder.selector);
        registry.requestProbe(subjectHash, subjectUri);
    }

    function testSubjectHashMustMatchUri() public {
        vm.prank(holder);
        vm.expectRevert(ProbeReceiptRegistry.SubjectHashMismatch.selector);
        registry.requestProbe(bytes32(uint256(1)), subjectUri);
    }

    function testOnlyPublisherCanPublishReceipt() public {
        vm.prank(stranger);
        vm.expectRevert(ProbeReceiptRegistry.NotPublisher.selector);
        publish(82, 1, uint40(block.timestamp), evidenceHash);
    }

    function testPublisherCanPublishReceiptAndReadersCanConsumeIt() public {
        uint40 checkedAt = uint40(block.timestamp - 30);
        vm.prank(publisher);
        publish(82, 1, checkedAt, evidenceHash);

        ProbeReceiptRegistry.Receipt memory receipt = registry.receiptOf(subjectHash);

        assertEq(receipt.score, 82);
        assertEq(receipt.status, 1);
        assertEq(receipt.checkedAt, checkedAt);
        assertEq(receipt.publishedAt, uint40(block.timestamp));
        assertEq(receipt.evidenceHash, evidenceHash);
        assertEq(receipt.subjectUri, subjectUri);
        assertEq(receipt.evidenceUri, evidenceUri);

        (uint8 directScore, uint8 directStatus, uint40 directCheckedAt) = registry.scoreOf(subjectHash);
        assertEq(directScore, 82);
        assertEq(directStatus, 1);
        assertEq(directCheckedAt, checkedAt);
        assertTrue(registry.isSafeToPay(subjectHash, 70, 1 hours));
    }

    function testPublishValidatesReceiptFields() public {
        vm.startPrank(publisher);
        vm.expectRevert(ProbeReceiptRegistry.InvalidScore.selector);
        publish(101, 1, uint40(block.timestamp), evidenceHash);

        vm.expectRevert(ProbeReceiptRegistry.InvalidStatus.selector);
        publish(80, 5, uint40(block.timestamp), evidenceHash);

        vm.expectRevert(ProbeReceiptRegistry.InvalidCheckedAt.selector);
        publish(80, 1, 0, evidenceHash);

        vm.expectRevert(ProbeReceiptRegistry.InvalidCheckedAt.selector);
        publish(80, 1, uint40(block.timestamp + 1), evidenceHash);

        vm.expectRevert(ProbeReceiptRegistry.EmptyEvidenceHash.selector);
        publish(80, 1, uint40(block.timestamp), bytes32(0));
        vm.stopPrank();
    }

    function testSafetyGateRejectsLowScoreBadStatusAndStaleReceipts() public {
        uint40 checkedAt = uint40(block.timestamp - 2 hours);
        vm.prank(publisher);
        publish(60, 1, checkedAt, evidenceHash);

        assertFalse(registry.isSafeToPay(subjectHash, 70, 3 hours));
        assertFalse(registry.isSafeToPay(subjectHash, 50, 1 hours));

        vm.prank(publisher);
        publish(90, 3, uint40(block.timestamp), evidenceHash);
        assertFalse(registry.isSafeToPay(subjectHash, 70, 1 hours));
    }

    function testPublicationCanBeReplaced() public {
        vm.startPrank(publisher);
        publish(60, 2, uint40(block.timestamp), evidenceHash);
        bytes32 newEvidenceHash = keccak256(bytes("new measured evidence"));
        publish(91, 1, uint40(block.timestamp), newEvidenceHash);
        vm.stopPrank();

        (uint8 score, uint8 status,) = registry.scoreOf(subjectHash);
        assertEq(score, 91);
        assertEq(status, 1);
    }
}
