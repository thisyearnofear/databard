// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title ProbeReceiptRegistry
/// @notice Agent ID-gated demand registry plus publisher-signed Probe receipt
///         index. Agent ID holders write demand by requesting a Probe; only
///         DataBard's immutable publisher key can write measured receipts.
/// @dev subjectHash must be keccak256(bytes(canonicalSubjectUri)). Keeping the
///      URI in the write call lets the contract prove the hash binding on-chain.
contract ProbeReceiptRegistry {
    uint256 public constant MAX_URI_BYTES = 512;

    IAgentIdRegistry public immutable agentIdRegistry;
    address public immutable publisher;

    struct RequestState {
        address firstRequester;
        uint40 firstRequestedAt;
        uint40 lastRequestedAt;
        uint32 totalRequests;
        uint32 uniqueRequesters;
    }

    struct ReceiptInput {
        bytes32 subjectHash;
        string subjectUri;
        uint8 score;
        uint8 status;
        uint40 checkedAt;
        bytes32 evidenceHash;
        string evidenceUri;
    }

    struct Receipt {
        uint8 score;
        uint8 status;
        uint40 checkedAt;
        uint40 publishedAt;
        bytes32 evidenceHash;
        string subjectUri;
        string evidenceUri;
    }

    mapping(bytes32 => RequestState) public requests;
    mapping(bytes32 => mapping(address => bool)) public hasRequested;
    mapping(bytes32 => Receipt) private _receipts;

    event ProbeRequested(bytes32 indexed subjectHash, address indexed requester, string subjectUri, uint40 requestedAt);

    event ReceiptPublished(
        bytes32 indexed subjectHash,
        uint8 score,
        uint8 status,
        uint40 checkedAt,
        uint40 publishedAt,
        bytes32 evidenceHash,
        string subjectUri,
        string evidenceUri
    );

    error NotAgentIdHolder();
    error NotPublisher();
    error EmptyUri();
    error UriTooLong();
    error SubjectHashMismatch();
    error InvalidScore();
    error InvalidStatus();
    error InvalidCheckedAt();
    error EmptyEvidenceHash();

    constructor(address agentIdRegistry_) {
        require(agentIdRegistry_ != address(0), "agent id registry required");
        agentIdRegistry = IAgentIdRegistry(agentIdRegistry_);
        publisher = msg.sender;
    }

    modifier onlyAgentIdHolder() {
        if (agentIdRegistry.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        _;
    }

    modifier onlyPublisher() {
        if (msg.sender != publisher) revert NotPublisher();
        _;
    }

    /// @notice Record demand for a Probe of a service. This is deliberately not
    ///         a review or score submission: users request measurement, while
    ///         only the publisher can write measured receipts.
    function requestProbe(bytes32 subjectHash, string calldata subjectUri) external onlyAgentIdHolder {
        _validateSubject(subjectHash, subjectUri);

        RequestState storage state = requests[subjectHash];
        uint40 requestedAt = uint40(block.timestamp);
        if (state.firstRequestedAt == 0) {
            state.firstRequester = msg.sender;
            state.firstRequestedAt = requestedAt;
        }
        state.lastRequestedAt = requestedAt;
        state.totalRequests += 1;

        if (!hasRequested[subjectHash][msg.sender]) {
            hasRequested[subjectHash][msg.sender] = true;
            state.uniqueRequesters += 1;
        }

        emit ProbeRequested(subjectHash, msg.sender, subjectUri, requestedAt);
    }

    /// @notice Publish or replace the latest measured receipt for a subject.
    ///         Prior versions remain available in ReceiptPublished events.
    function publishReceipt(ReceiptInput calldata input) external onlyPublisher {
        _validateSubject(input.subjectHash, input.subjectUri);
        _validateUri(input.evidenceUri);
        if (input.score > 100) revert InvalidScore();
        if (input.status > 4) revert InvalidStatus();
        if (input.checkedAt == 0 || input.checkedAt > block.timestamp) revert InvalidCheckedAt();
        if (input.evidenceHash == bytes32(0)) revert EmptyEvidenceHash();

        uint40 publishedAt = uint40(block.timestamp);
        Receipt storage receipt = _receipts[input.subjectHash];
        receipt.score = input.score;
        receipt.status = input.status;
        receipt.checkedAt = input.checkedAt;
        receipt.publishedAt = publishedAt;
        receipt.evidenceHash = input.evidenceHash;
        receipt.subjectUri = input.subjectUri;
        receipt.evidenceUri = input.evidenceUri;

        emit ReceiptPublished(
            input.subjectHash,
            input.score,
            input.status,
            input.checkedAt,
            publishedAt,
            input.evidenceHash,
            input.subjectUri,
            input.evidenceUri
        );
    }

    function receiptOf(bytes32 subjectHash) external view returns (Receipt memory) {
        return _receipts[subjectHash];
    }

    function scoreOf(bytes32 subjectHash) external view returns (uint8 score, uint8 status, uint40 checkedAt) {
        Receipt storage receipt = _receipts[subjectHash];
        return (receipt.score, receipt.status, receipt.checkedAt);
    }

    /// @notice Composability hook: healthy-or-degraded, at least minScore, and
    ///         measured within maxAge seconds. Statuses: 1 healthy, 2 degraded.
    function isSafeToPay(bytes32 subjectHash, uint8 minScore, uint40 maxAge) external view returns (bool) {
        Receipt storage receipt = _receipts[subjectHash];
        if (receipt.checkedAt == 0) return false;
        if (receipt.status != 1 && receipt.status != 2) return false;
        if (receipt.score < minScore) return false;
        return block.timestamp - receipt.checkedAt <= maxAge;
    }

    function hasAgentId(address account) external view returns (bool) {
        return agentIdRegistry.balanceOf(account) > 0;
    }

    function _validateSubject(bytes32 subjectHash, string calldata subjectUri) internal pure {
        _validateUri(subjectUri);
        if (keccak256(bytes(subjectUri)) != subjectHash) revert SubjectHashMismatch();
    }

    function _validateUri(string calldata uri) internal pure {
        uint256 length = bytes(uri).length;
        if (length == 0) revert EmptyUri();
        if (length > MAX_URI_BYTES) revert UriTooLong();
    }
}
