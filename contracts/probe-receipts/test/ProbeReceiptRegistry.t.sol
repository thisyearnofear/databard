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
    bytes32 internal contentHash = keccak256(bytes("canonical evidence json sha256 stand-in"));
    bytes32 internal expectedEvidenceHash = keccak256(abi.encode(keccak256(bytes(subjectUri)), contentHash));

    function setUp() public {
        vm.warp(1_700_000_000);
        agentId = new MockAgentIdRegistry();
        vm.prank(publisher);
        registry = new ProbeReceiptRegistry(address(agentId));
        agentId.mint(holder);
    }

    function publish(uint8 score, uint8 status, uint40 checkedAt, bytes32 contentHash_) internal {
        registry.publishReceipt(
            ProbeReceiptRegistry.ReceiptInput({
                subjectHash: subjectHash,
                subjectUri: subjectUri,
                score: score,
                status: status,
                checkedAt: checkedAt,
                contentHash: contentHash_,
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
        publish(82, 1, uint40(block.timestamp), contentHash);
    }

    function testPublisherCanPublishReceiptAndReadersCanConsumeIt() public {
        uint40 checkedAt = uint40(block.timestamp - 30);
        vm.prank(publisher);
        publish(82, 1, checkedAt, contentHash);

        ProbeReceiptRegistry.Receipt memory receipt = registry.receiptOf(subjectHash);

        assertEq(receipt.score, 82);
        assertEq(receipt.status, 1);
        assertEq(receipt.checkedAt, checkedAt);
        assertEq(receipt.publishedAt, uint40(block.timestamp));
        assertEq(receipt.contentHash, contentHash);
        assertEq(receipt.evidenceHash, expectedEvidenceHash);
        assertEq(receipt.version, 1);
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
        publish(101, 1, uint40(block.timestamp), contentHash);

        vm.expectRevert(ProbeReceiptRegistry.InvalidStatus.selector);
        publish(80, 5, uint40(block.timestamp), contentHash);

        vm.expectRevert(ProbeReceiptRegistry.InvalidCheckedAt.selector);
        publish(80, 1, 0, contentHash);

        vm.expectRevert(ProbeReceiptRegistry.InvalidCheckedAt.selector);
        publish(80, 1, uint40(block.timestamp + 1), contentHash);

        vm.expectRevert(ProbeReceiptRegistry.EmptyContentHash.selector);
        publish(80, 1, uint40(block.timestamp), bytes32(0));
        vm.stopPrank();
    }

    function testSafetyGateRejectsLowScoreBadStatusAndStaleReceipts() public {
        uint40 checkedAt = uint40(block.timestamp - 2 hours);
        vm.prank(publisher);
        publish(60, 1, checkedAt, contentHash);

        assertFalse(registry.isSafeToPay(subjectHash, 70, 3 hours));
        assertFalse(registry.isSafeToPay(subjectHash, 50, 1 hours));

        vm.prank(publisher);
        publish(90, 3, uint40(block.timestamp), contentHash);
        assertFalse(registry.isSafeToPay(subjectHash, 70, 1 hours));
    }

    function testPublicationCanBeReplaced() public {
        vm.startPrank(publisher);
        publish(60, 2, uint40(block.timestamp), contentHash);
        bytes32 newEvidenceHash = keccak256(bytes("new measured evidence"));
        publish(91, 1, uint40(block.timestamp), newEvidenceHash);
        vm.stopPrank();

        (uint8 score, uint8 status,) = registry.scoreOf(subjectHash);
        assertEq(score, 91);
        assertEq(status, 1);
    }

    function testEvidenceHashIsBoundToSubject() public {
        uint40 checkedAt = uint40(block.timestamp - 30);
        vm.prank(publisher);
        publish(82, 1, checkedAt, contentHash);

        ProbeReceiptRegistry.Receipt memory receipt = registry.receiptOf(subjectHash);
        // The contract computes the commitment itself: keccak256(abi.encode(subjectHash, contentHash)).
        assertEq(receipt.evidenceHash, keccak256(abi.encode(subjectHash, contentHash)));
        // A different subject with the same contentHash must yield a different commitment.
        bytes32 otherSubjectHash = keccak256(bytes("a2mcp://example.test/other"));
        assertTrue(receipt.evidenceHash != keccak256(abi.encode(otherSubjectHash, contentHash)));
    }

    function testPublishCannotRegressCheckedAt() public {
        vm.startPrank(publisher);
        publish(82, 1, uint40(block.timestamp - 10), contentHash);

        vm.expectRevert(ProbeReceiptRegistry.StaleReceipt.selector);
        publish(90, 1, uint40(block.timestamp - 20), contentHash);

        // Same-timestamp replacement is allowed (correcting a botched publish
        // of the same measurement); forward movement is allowed.
        publish(83, 1, uint40(block.timestamp - 10), contentHash);
        publish(91, 1, uint40(block.timestamp), contentHash);
        vm.stopPrank();

        (uint8 score,, uint40 checkedAt) = registry.scoreOf(subjectHash);
        assertEq(score, 91);
        assertEq(checkedAt, uint40(block.timestamp));
    }

    function testVersionIncrementsMonotonicallyAcrossReplacements() public {
        vm.startPrank(publisher);
        publish(60, 2, uint40(block.timestamp), contentHash);
        publish(91, 1, uint40(block.timestamp), contentHash);
        publish(92, 1, uint40(block.timestamp), contentHash);
        vm.stopPrank();

        ProbeReceiptRegistry.Receipt memory receipt = registry.receiptOf(subjectHash);
        assertEq(receipt.version, 3);
    }
}
