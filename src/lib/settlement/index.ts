/**
 * Settlement — public entry point. Registers backends and re-exports the verifier interface.
 * Import this once (e.g., from an API route) and all three backends are available via getBackend.
 */
import { registerBackend, getBackend, explorerUrl } from "./verifier";
import { pusdBackend } from "./backends/pusd";
import { stripeBackend } from "./backends/stripe";
import { escrowBackend } from "./backends/escrow";

registerBackend(pusdBackend);
registerBackend(stripeBackend);
registerBackend(escrowBackend);

export { getBackend, explorerUrl };
export type { SettlementBackend, SettlementBackendId, VerifyRequest, VerifyResult, VerifyStatus } from "./verifier";
