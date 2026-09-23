// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ProbeVerdictRegistry
/// @notice On-chain health index for OKX.AI marketplace A2MCP services,
///         published by DataBard Probe. Other agents and contracts can gate
///         payments on `isSafeToPay` / `scoreOf` instead of trusting a listing.
contract ProbeVerdictRegistry {
    address public immutable publisher;

    // status enum: 0 unknown, 1 healthy, 2 degraded, 3 broken, 4 unreachable
    struct Verdict {
        uint8 score;
        uint8 status;
        uint40 checkedAt;
    }

    mapping(uint256 => Verdict) public verdicts;

    bytes32 public latestIndexHash;
    uint40 public latestRunAt;

    event VerdictUpdated(
        uint256 indexed serviceId,
        uint8 score,
        uint8 status,
        uint40 checkedAt
    );
    event RunPublished(
        bytes32 indexed indexHash,
        uint40 generatedAt,
        uint16 checked,
        uint16 updated
    );

    modifier onlyPublisher() {
        require(msg.sender == publisher, "not publisher");
        _;
    }

    constructor() {
        publisher = msg.sender;
    }

    /// @notice Publish one index run. Callers chunk large runs into multiple
    ///         transactions; each carries the same indexHash.
    function publishRun(
        bytes32 indexHash,
        uint40 generatedAt,
        uint16 checked,
        uint256[] calldata serviceIds,
        uint8[] calldata scores,
        uint8[] calldata statuses
    ) external onlyPublisher {
        require(
            serviceIds.length == scores.length && scores.length == statuses.length,
            "length mismatch"
        );
        require(serviceIds.length <= 65535, "batch too large");

        for (uint256 i = 0; i < serviceIds.length; i++) {
            verdicts[serviceIds[i]] = Verdict({
                score: scores[i],
                status: statuses[i],
                checkedAt: generatedAt
            });
            emit VerdictUpdated(serviceIds[i], scores[i], statuses[i], generatedAt);
        }

        latestIndexHash = indexHash;
        latestRunAt = generatedAt;
        emit RunPublished(indexHash, generatedAt, checked, uint16(serviceIds.length));
    }

    function scoreOf(
        uint256 serviceId
    ) external view returns (uint8 score, uint8 status, uint40 checkedAt) {
        Verdict memory v = verdicts[serviceId];
        return (v.score, v.status, v.checkedAt);
    }

    /// @notice Composability hook: is this listing healthy-or-degraded, at
    ///         least minScore, and checked within maxAge seconds?
    function isSafeToPay(
        uint256 serviceId,
        uint8 minScore,
        uint40 maxAge
    ) external view returns (bool) {
        Verdict memory v = verdicts[serviceId];
        if (v.checkedAt == 0) return false; // never published
        if (v.status != 1 && v.status != 2) return false; // healthy|degraded only
        if (v.score < minScore) return false;
        return block.timestamp - v.checkedAt <= maxAge;
    }
}
