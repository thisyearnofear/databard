/**
 * The attested showcase run — a real, recorded DataBard Probe execution on
 * X Layer mainnet (18 Sep 2026). Rendered as a labelled record on /probe so
 * visitors can see the full agent-to-agent money loop without paying.
 *
 * This is the same captured-data pattern as report-examples.ts: the values
 * below come from one recorded run and are never recomputed client-side.
 * Every transaction hash is verifiable on a public explorer.
 */

export interface AttestedRunCandidate {
  rank: number;
  name: string;
  score: number;
  label: string;
  paymentNote: string | null;
}

export const ATTESTED_RUN = {
  ranAt: "2026-09-18T16:47:42.475Z",
  network: "X Layer mainnet",
  question: "Which A2MCP service should a portfolio agent pay for token data?",
  priceUsd: "$1.00",
  outboundSpentUsd: 0.01,
  outboundCapUsd: 0.5,
  paidCount: 2,
  cachedCount: 4,
  settlementTx:
    "0x581d13568d3f44bd98a85943e20808e3a34b993ef4f719fc0fdf375e6edb60a7",
  outboundTx:
    "0xeb22c2362a861548b64fdc4eb0ee9275957ace28b916496e850040bedf163be6",
  attestationTx:
    "0x5519c31276c8947e0144bd7bc35378f262c7a4ca0d98b3b3f41f5b7f6fac7a59",
  attestationBlock: 70981029,
  ranked: [
    {
      rank: 1,
      name: "DataBard — Health Check (self)",
      score: 71,
      label: "good",
      paymentNote: "Free endpoint",
    },
    {
      rank: 2,
      name: "Atlas Data API — Market Signal",
      score: 58,
      label: "fair",
      paymentNote: "Paid $0.00001 via x402",
    },
    {
      rank: 3,
      name: "Onchain Data Explorer — Token Metadata",
      score: 47,
      label: "fair",
      paymentNote: "Paid $0.01 via x402",
    },
    {
      rank: 4,
      name: "PolyDesk — Football Match Live Data",
      score: 33,
      label: "poor",
      paymentNote: "Paid, then re-challenged — flagged",
    },
    {
      rank: 5,
      name: "Doxa — Structured Data Validate",
      score: 0,
      label: "unreachable",
      paymentNote: "Unreachable",
    },
  ] as AttestedRunCandidate[],
};

export function explorerTxUrl(txHash: string): string {
  return `https://www.oklink.com/xlayer/tx/${txHash}`;
}
