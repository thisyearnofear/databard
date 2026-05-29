# DataBard Strategy: Dual-Path Evolution

## Overview
DataBard is evolving from a "data catalog podcast" into an **Information Feed Engine** that bridges the gap between traditional enterprise data warehouses and decentralized protocol health. This document outlines the strategy for the landing page and product design to ensure clarity, intuitiveness, and high conversion for two distinct personas.

---

## 1. The Two-Path Persona Strategy

### Path A: The Data Engineer (Off-chain/Enterprise)
*   **Goal**: Awareness, documentation, and team alignment.
*   **Terminology**: Warehouse, dbt models, PII, Test Failures, Lineage.
*   **Output**: MP3 for Slack/Discord, PDF Health Reports for management.
*   **Success Metric**: "Time saved on onboarding and documentation."

### Path B: The Protocol Operator (On-chain/Web3)
*   **Goal**: Protocol reliability, indexer monitoring, and community trust.
*   **Terminology**: Subgraphs, Indexers, Chain Sync, Lag, Entities.
*   **Output**: **On-chain Attestations (Solana)**, RSS for DAO governance.
*   **Success Metric**: "Publicly verifiable health of the protocol."

---

## 2. Landing Page Architecture

### Hero: The "Split-Mirror" Concept
Instead of a single headline, we implement a **Perspective Toggle** or a side-by-side hero:
- **Left (Warehouses)**: "Your dbt warehouse, as a podcast."
- **Right (Protocols)**: "Your on-chain data, as a podcast."

### Visualizing the Value
- **Enterprise**: Show a "Health Score" dashboard with dbt test icons.
- **Web3**: Show a "Protocol Pulse" with Solana transaction hashes and Subgraph entity counts.

### On-chain Verification Section
A dedicated section explaining **"Data Accountability on Solana"**:
- Explain that every health report can be minted as a snapshot.
- Use the wallet address as the "Identity of Record" for the auditor.

---

## 3. UI/UX & Intuitive Design

### Source Categorization
In the `Connect` flow, sources are tiered by integration depth:
- **Tier 1 (First-Class)**: OpenMetadata, dbt Cloud, dbt Local, The Graph, Dune Analytics — deep metadata extraction, zero extra dependencies, source-specific error handling.
- **Tier 2 (Coral Escape Hatch)**: Any source Coral supports — user writes SQL, gets generic schema. Best for: long-tail sources, cross-source joins, local files, custom APIs.

See [`DATA_SOURCES_ARCHITECTURE.md`](DATA_SOURCES_ARCHITECTURE.md) for the full rationale.

### Source Grouping in UI
- **Enterprise / Off-chain**: OpenMetadata, dbt Cloud, dbt Local
- **On-chain / Protocol**: The Graph, Dune Analytics
- **Bring Your Own (Coral)**: Any source via SQL — positioned as the power-user path

### Seamless Transitions
- **Performance**: Use dynamic imports for heavy Web3 libraries to keep the "Warehouse" path lightweight.
- **Clarity**: Use distinct icons to differentiate between a "Table" and an "Entity."
- **Progressive disclosure**: Coral appears as "Connect anything else" — not competing with Tier 1 sources for attention.

---

## 4. Implementation Roadmap

### Phase 1: Messaging Refresh
- [x] Update `page.tsx` with the dual-identity hero.
- [x] Group data sources by tier in the Connect wizard.
- [x] Position Coral as "Connect anything else" with SQL editor UX.

### Phase 2: On-chain Visibility
- [x] Add a "Verified on Solana" badge to episodes that have been minted.
- [x] Create a "Protocol Dashboard" view for The Graph/Dune sources.

### Phase 3: Coral Graduation Pipeline
- [x] Track which sources users connect via Coral (anonymous usage signal).
- [x] When a source hits threshold usage, spec out a first-class adapter.
- [x] First candidate: GitHub (high demand via Coral, rich metadata available).

### Phase 4: Performance Optimization
- [x] Lazy-load heavy Web3 libraries.
- [x] Implement SSR for the initial "Demo" path to ensure instant playback.
