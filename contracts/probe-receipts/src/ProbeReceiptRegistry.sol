// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title ProbeReceiptRegistry
/// @notice Agent ID-gated demand registry plus publisher-signed Probe receipt
///         index. Agent ID holders write demand by requesting a Probe; only
///         the immutable publisher can write measured receipts.
/// @dev Bindings and hash schemes:
///      - subjectHash = keccak256(bytes(canonicalSubjectUri)) — proven on-chain
///        in _validateSubject.
///      - contentHash = sha256(canonical evidence JSON), computed off-chain and
///        supplied by the publisher. sha256 is the evidence scheme because the
///        canonical artifacts are hashed off-chain where keccak is uncommon.
///      - evidenceHash = keccak256(abi.encode(subjectHash, contentHash)),
///        computed by the contract itself. The evidence commitment is bound to
///        the subject at the commitment level: a receipt can never reference
///        evidence hashed for a different subject, even by publisher error.
///      Off-chain verification: fetch evidenceUri → canonicalize bytes →
///      sha256 → compare contentHash → recompute evidenceHash from the
///      subjectHash and contentHash → compare. The evidence document itself
///      also embeds the subject URI, so the binding is double-anchored.
///      Receipt status codes: 1 healthy, 2 degraded, 3 broken, 4 unreachable.
///      (0 is never valid input; an empty receipt slot means "unmeasured".)
///      Statuses describe the measured interface only — never the correctness
///      of paid outputs, which interface probing cannot prove.
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
        bytes32 contentHash;
        string evidenceUri;
    }

    struct Receipt {
        uint8 score;
        uint8 status;
        uint32 version;
        uint40 checkedAt;
        uint40 publishedAt;
        bytes32 contentHash;
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
        uint32 version,
        uint8 score,
        uint8 status,
        uint40 checkedAt,
        uint40 publishedAt,
        bytes32 contentHash,
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
    error EmptyContentHash();
    error StaleReceipt();

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
    ///         checkedAt can never move backwards: a fresher measurement must
    ///         replace an older one, so corrections re-measure rather than
    ///         regress. Prior versions remain in ReceiptPublished events and
    ///         the monotonic version counter lets indexers detect replacements.
    function publishReceipt(ReceiptInput calldata input) external onlyPublisher {
        _validateSubject(input.subjectHash, input.subjectUri);
        _validateUri(input.evidenceUri);
        if (input.score > 100) revert InvalidScore();
        if (input.status > 4) revert InvalidStatus();
        if (input.checkedAt == 0 || input.checkedAt > block.timestamp) revert InvalidCheckedAt();
        if (input.contentHash == bytes32(0)) revert EmptyContentHash();

        Receipt storage receipt = _receipts[input.subjectHash];
        if (receipt.checkedAt != 0 && input.checkedAt < receipt.checkedAt) revert StaleReceipt();

        bytes32 evidenceHash = keccak256(abi.encode(input.subjectHash, input.contentHash));
        uint40 publishedAt = uint40(block.timestamp);
        receipt.score = input.score;
        receipt.status = input.status;
        receipt.version += 1;
        receipt.checkedAt = input.checkedAt;
        receipt.publishedAt = publishedAt;
        receipt.contentHash = input.contentHash;
        receipt.evidenceHash = evidenceHash;
        receipt.subjectUri = input.subjectUri;
        receipt.evidenceUri = input.evidenceUri;

        emit ReceiptPublished(
            input.subjectHash,
            receipt.version,
            input.score,
            input.status,
            input.checkedAt,
            publishedAt,
            input.contentHash,
            evidenceHash,
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
    ///         measured within maxAge seconds. Statuses 1 healthy / 2 degraded
    ///         pass; 3 broken / 4 unreachable never do. Callers must treat this
    ///         as interface evidence only — it cannot prove paid output quality.
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
