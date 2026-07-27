import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { x402ResourceServer, type RouteConfig } from "@okxweb3/x402-core/server";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";

/**
 * x402 payment server for the paid A2MCP endpoint (Data Briefing).
 *
 * The paid endpoint issues a 402 Payment Required challenge (base64 in the
 * `PAYMENT-REQUIRED` header) describing an `exact` EIP-3009 transfer of USDT0
 * on X Layer. After the caller's agent signs and replays with `X-PAYMENT`,
 * the OKX facilitator verifies + settles on-chain and the briefing is returned.
 *
 * Env required for the paid endpoint to go live (set on the production host):
 *   OKX_API_KEY        — OKX Developer Portal API key
 *   OKX_SECRET_KEY     — OKX Developer Portal secret
 *   OKX_PASSPHRASE     — OKX Developer Portal passphrase
 *   PAY_TO_ADDRESS     — X Layer (eip155:196) EVM address that receives funds
 *   BRIEFING_PRICE_USD — per-call price as a money string (default "$1.00")
 *
 * Without these the paid route returns 503 instead of a 402 challenge, so a
 * misconfigured deploy fails loudly rather than registering a broken ASP.
 *
 * Get the OKX API key/secret/passphrase from the OKX Developer Portal:
 * https://web3.okx.com/zh-hans/onchainos/dev-portal
 * Get PAY_TO_ADDRESS from your Agentic Wallet (the wallet you register the ASP with).
 */
export const X402_NETWORK = "eip155:196"; // X Layer mainnet
// NOTE: do NOT prefix the env value with "$" — Next.js's env loader expands $VAR
// references in .env files, so "$1.00" becomes ".00". Use "1.00" (no $) in .env;
// the SDK's parseMoneyToDecimal handles both "$1.00" and "1.00" formats.
export const BRIEFING_PRICE = process.env.BRIEFING_PRICE_USD || "$1.00";

export const x402Configured = Boolean(
  process.env.PAY_TO_ADDRESS &&
    process.env.OKX_API_KEY &&
    process.env.OKX_SECRET_KEY &&
    process.env.OKX_PASSPHRASE
);

/**
 * Pre-configured x402 resource server. Created once at module load when all
 * credentials are present. `syncFacilitatorOnStart` (default true, handled by
 * the withX402 wrapper) lazily fetches supported payment kinds on the first
 * request, so no explicit `initialize()` call is needed here.
 */
export const x402Server = x402Configured
  ? new x402ResourceServer(
      new OKXFacilitatorClient({
        apiKey: process.env.OKX_API_KEY!,
        secretKey: process.env.OKX_SECRET_KEY!,
        passphrase: process.env.OKX_PASSPHRASE!,
        // Wait for on-chain confirmation before reporting settlement success,
        // so a delivered briefing always corresponds to a confirmed payment.
        syncSettle: true,
      })
    ).register(X402_NETWORK, new ExactEvmScheme())
  : null;

export const briefingRouteConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: X402_NETWORK,
    payTo: process.env.PAY_TO_ADDRESS || "",
    price: BRIEFING_PRICE,
  },
  description: "Data Briefing — AI data analyst synthesis (script + audio + health score + recommended actions)",
  mimeType: "application/json",
};
