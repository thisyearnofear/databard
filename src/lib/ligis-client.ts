/**
 * Ligis credential check client (optional enrichment for DataBard Probe).
 *
 * Ligis is the trust-gate layer for agent identity. DataBard Probe is the
 * quality/health layer. Together they form a complete trust signal:
 *
 *   Ligis answers:   "Does this agent hold valid credentials?" (identity)
 *   DataBard answers: "Does this service actually perform well?" (quality)
 *
 * This module queries Ligis's credential registry to check whether a given
 * agent address holds a valid capability credential. The result feeds the
 * "credentials" dimension of the probe score.
 *
 * Ligis endpoint (from the Ligis web app):
 *   GET {LIGIS_BASE_URL}/api/agent/{address}?chain={chain}
 *
 * Returns credential history and held capabilities. We interpret the result:
 *   - `exists: true` + held credentials  → verified (true)
 *   - `exists: true` + no credentials    → unverified (false)
 *   - `exists: false` or unreachable     → unknown (null, scored as neutral)
 */

const LIGIS_BASE_URL = process.env.LIGIS_BASE_URL || "https://ligis.dev";
const LIGIS_CHAIN = process.env.LIGIS_CHAIN || "pharos"; // or "casper-testnet"

export interface LigisCheckResult {
  /** true = agent holds at least one valid credential */
  verified: boolean | null;
  /** Human-readable label of held capabilities (if any) */
  capabilities: string[];
  /** Total number of credentials held */
  credentialCount: number;
  /** Whether the Ligis lookup itself succeeded */
  lookupOk: boolean;
  /** Error message if lookup failed */
  error?: string;
}

/**
 * Check whether an agent address holds valid credentials in the Ligis registry.
 *
 * @param agentAddress - The agent's wallet/communication address (0x... for EVM, account-hash-... for Casper)
 * @param chain - Override the default chain (e.g. "casper-testnet")
 */
export async function checkLigisCredentials(
  agentAddress: string,
  chain?: string
): Promise<LigisCheckResult> {
  const targetChain = chain || LIGIS_CHAIN;
  const url = `${LIGIS_BASE_URL}/api/agent/${encodeURIComponent(agentAddress)}?chain=${targetChain}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        verified: null,
        capabilities: [],
        credentialCount: 0,
        lookupOk: false,
        error: `Ligis returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();

    if (data.exists === false) {
      return {
        verified: null,
        capabilities: [],
        credentialCount: 0,
        lookupOk: true,
        error: "Agent not found in Ligis registry",
      };
    }

    const held: Array<{ id: string; label?: string }> = data.held ?? [];
    return {
      verified: held.length > 0,
      capabilities: held.map((h) => h.label || h.id),
      credentialCount: held.length,
      lookupOk: true,
    };
  } catch (err) {
    return {
      verified: null,
      capabilities: [],
      credentialCount: 0,
      lookupOk: false,
      error: err instanceof Error ? err.message : "Ligis lookup failed",
    };
  }
}
