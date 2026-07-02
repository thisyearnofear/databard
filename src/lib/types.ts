/** Shared domain types — single source of truth */

export type DataSource = "openmetadata" | "dbt-cloud" | "dbt-local" | "the-graph" | "dune" | "coral";

export interface OMConnection {
  url: string;
  token: string;
}

export interface DbtConnection {
  accountId: string;
  projectId: string;
  token: string;
}

export interface TheGraphConnection {
  subgraphUrl: string;
  apiKey?: string;
}

export interface DuneConnection {
  apiKey: string;
  namespace?: string;
}

export interface CoralConnection {
  query: string;
  localFiles?: { path: string; name: string }[];
}

export interface ConnectionConfig {
  source: DataSource;
  openmetadata?: OMConnection;
  dbtCloud?: DbtConnection;
  dbtLocal?: { manifestPath?: string; manifestContent?: string };
  theGraph?: TheGraphConnection;
  dune?: DuneConnection;
  coral?: CoralConnection;
}

export interface ColumnMeta {
  name: string;
  dataType: string;
  description?: string;
  tags: string[];
}

export interface QualityTest {
  name: string;
  status: "Success" | "Failed" | "Aborted" | "Queued";
  column?: string;
}

export interface LineageEdge {
  fromTable: string;
  toTable: string;
}

export interface TableMeta {
  fqn: string;
  name: string;
  description?: string;
  columns: ColumnMeta[];
  qualityTests: QualityTest[];
  tags: string[];
  /** OpenMetadata-enriched fields (optional — populated when source is OM) */
  owner?: string;
  rowCount?: number;
  freshness?: string;  // ISO timestamp of last update
  glossaryTerms?: string[];
  piiColumns?: string[];
}

export interface SchemaMeta {
  fqn: string;
  name: string;
  description?: string;
  tables: TableMeta[];
  lineage: LineageEdge[];
}

export type ResearchFocus = "overview" | "quality" | "coverage" | "lineage" | "governance" | "freshness";

export type EvidenceVerificationMode = "generated" | "source-linked" | "browser-verified";

export interface EvidenceSourceContext {
  provider: string;
  sourceLabel: string;
  sourceUrl?: string;
}

export interface ResearchCitation {
  source: string;
  reference: string;
  detail?: string;
  sourceUrl?: string;
  verificationMode?: EvidenceVerificationMode;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface ResearchEvidence {
  id: string;
  label: string;
  detail: string;
  sourceType: "table" | "test" | "lineage" | "ownership" | "freshness" | "governance" | "coverage";
  table?: string;
  citations: ResearchCitation[];
}

export interface ResearchPlanStep {
  id: string;
  title: string;
  intent: string;
  evidenceIds: string[];
}

export interface ResearchTrail {
  question: string;
  focus: ResearchFocus;
  summary: string;
  plan: ResearchPlanStep[];
  evidence: ResearchEvidence[];
  recommendedActions: { title: string; priority: "critical" | "high" | "medium" | "low"; category: string; table?: string }[];
}

export interface ResearchSessionBranch {
  id: string;
  question: string;
  createdAt: string;
  parentBranchId?: string;
  researchTrail: ResearchTrail;
  episodeId?: string;
  /** Present when the branch was produced through the on-chain market (Deal reference + state). */
  deal?: DealRef;
}

/* ---------------------------- Market domain ---------------------------- */

/** Who / what posted a WANT. `agent` = machine (Watchdog or external agent); `human` = wallet UI. */
export type MarketActorKind = "human" | "agent";

export interface MarketActor {
  kind: MarketActorKind;
  /** Wallet address (buyer) or seller public key. */
  publicKey: string;
  /** Optional display label (persona name for sellers, agent id for machine buyers). */
  label?: string;
}

/**
 * What kind of deliverable a WANT is asking for.
 * - "brief":  single-topic episode (default). Content personas (Signal/Cascade/Newsroom) bid.
 * - "digest": aggregated package of multiple briefs. Reseller personas bid (Digest); resellers
 *             fulfill by posting sub-WANTs to content personas — creating the graph.
 */
export type WantType = "brief" | "digest";

/**
 * A WANT is a request to buy an Episode. It fully specifies what the buyer wants and how much
 * they'll pay. Sellers respond with Bids; the buyer awards to one and deposits into escrow.
 */
export interface Want {
  id: string;
  buyer: MarketActor;
  schemaFqn: string;
  focus: ResearchFocus;
  /** Optional evidence hints so sellers know what changed since last brief (Watchdog uses this). */
  evidenceHints?: { table: string; reason: string }[];
  /** Hard budget cap (per-brief). Bids above this are rejected before the buyer LLM sees them. */
  budgetLamports: number;
  /** Deadline for sellers to bid + deliver. Seconds from creation. */
  deadlineSec: number;
  createdAt: string;
  state: WantState;
  /** Deliverable kind — defaults to "brief" for back-compat. */
  wantType?: WantType;
  /** For digest WANTs: the schemas the reseller should aggregate. */
  digestSchemas?: string[];
  /** Set on sub-WANTs the reseller posts to inventory sellers. Links back to parent digest WANT. */
  parentWantId?: string;
}

export type WantState =
  | "open"        // accepting bids
  | "awarded"     // buyer awarded to a bid; awaiting deposit
  | "deposited"   // escrow initialized; seller may deliver
  | "delivered"   // seller committed manifest hash; buyer may release
  | "released"    // funds paid to seller; episode is the receipt
  | "refunded"    // deadline passed with no delivery; buyer reclaimed
  | "expired";    // deadline passed with no bids

export interface Bid {
  id: string;
  wantId: string;
  seller: MarketActor;
  /** Persona slug from voice-config.ts (signal | cascade | newsroom | <external>). */
  personaId: string;
  priceLamports: number;
  /** ETA to deliver, in seconds from award. */
  etaSec: number;
  /** One-sentence reasoning shown in the auction dashboard — makes the LLM negotiation legible. */
  reasoning: string;
  createdAt: string;
}

export interface Award {
  wantId: string;
  winningBidId: string;
  /** Buyer LLM's rationale for picking this bid — displayed in the dashboard for transparency. */
  buyerRationale: string;
  awardedAt: string;
}

/** The reference stamped into every Episode that settles on-chain. */
export interface DealRef {
  wantId: string;
  /** Solana Pay reference / escrow seed — the Pubkey base58 that ties this deal to on-chain state. */
  reference: string;
  buyer: string;         // wallet address
  seller: string;        // seller public key
  personaId: string;
  priceLamports: number;
  /** SHA-256 of the episode manifest — matches the on-chain `deliverable_hash` after commit. */
  manifestHash?: string;
  /** State machine mirror of on-chain state (for UI); source of truth is the escrow account. */
  state: WantState;
  /** Explorer URLs for each settlement step, populated as the state advances. */
  explorer: {
    deposit?: string;
    commit?: string;
    release?: string;
    refund?: string;
    /** Auto-mint attestation — the seller's on-chain memo of the settled deal. */
    mint?: string;
  };
}

/** Full deal record persisted server-side alongside the ResearchSessionBranch. */
export interface Deal extends DealRef {
  want: Want;
  winningBid: Bid;
  award: Award;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSession {
  id: string;
  schemaFqn: string;
  schemaName: string;
  source: DataSource;
  evidenceContext?: EvidenceSourceContext;
  createdAt: string;
  updatedAt: string;
  schemaMeta: SchemaMeta;
  branches: ResearchSessionBranch[];
  latestBranchId?: string;
  latestEpisodeId?: string;
}

export type Speaker = "Alex" | "Morgan";

export interface ScriptSegment {
  speaker: Speaker;
  topic: string;
  text: string;
}

export interface MusicSection {
  sectionName: string;
  durationMs: number;
  lines: string[];
  positiveStyles?: string[];
  negativeStyles?: string[];
}

export interface MusicPlan {
  positiveGlobalStyles: string[];
  negativeGlobalStyles: string[];
  sections: MusicSection[];
  genre: string;
  mood: string;
}

export interface Episode {
  schemaFqn: string;
  schemaName: string;
  researchQuestion?: string;
  researchTrail?: ResearchTrail;
  researchSessionId?: string;
  tableCount: number;
  qualitySummary: { passed: number; failed: number; total: number };
  script: ScriptSegment[];
  /** Optional musical plan if this episode was generated as an Anthem */
  musicPlan?: MusicPlan;
  /** Full schema metadata for interactive drill-down in the player */
  schemaMeta?: SchemaMeta;
  /** ISO timestamp of when this episode was generated */
  generatedAt?: string;
  audioUrl?: string;
  duration?: number;
}
