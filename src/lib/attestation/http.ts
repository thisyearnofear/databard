import { Connection } from "@solana/web3.js";
import { rateLimit, ValidationError } from "../validation";
import { AttestationHttpError, handlePrepare, handleAnchor, handleVerify, type AttestationRpc } from "./service";

export type AttestationAction = "prepare" | "anchor" | "verify";
const handlers = { prepare: handlePrepare, anchor: handleAnchor, verify: handleVerify };
const MAX_BODY = 256 * 1024;

function configuredRpc(): AttestationRpc {
  const url = process.env.SOLANA_ATTESTATION_RPC_URL ?? "https://api.devnet.solana.com";
  return new Connection(url, {
    commitment: "confirmed", disableRetryOnRateLimit: true,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new AttestationHttpError(415, "Use application/json");
  }
  if (!req.body) throw new AttestationHttpError(400, "JSON body required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new AttestationHttpError(413, "Body exceeds 256 KiB"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AttestationHttpError(400, "Expected a JSON object"); }
}

/** Dependency injection tests the actual route boundary without RPC traffic. */
export function createAttestationRoute(action: AttestationAction, dependencies: {
  rpc?: () => AttestationRpc;
  guard?: (req: Request) => void;
} = {}) {
  return async (req: Request): Promise<Response> => {
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
    try {
      (dependencies.guard ?? ((request) => rateLimit(request, { maxRequests: 60, windowMs: 3600000 })))(req);
      const body = await readBody(req);
      // No request-provided RPC URLs or credentials. Reject unknown fields rather than silently accepting them.
      const allowed = new Set(["receipt", "issuer", "chain",
        ...(action === "verify" ? ["transactionId", "finality", "result"] :
          action === "prepare" ? ["consent", "finality"] : ["consent", "signedTransactionBase64"])]);
      if (Object.keys(body).some((key) => !allowed.has(key))) throw new AttestationHttpError(400, "Unsupported request field");
      const result = await handlers[action](body, (dependencies.rpc ?? configuredRpc)());
      return json(result, action === "anchor" ? 202 : 200);
    } catch (error) {
      if (error instanceof AttestationHttpError) return json({ ok: false, error: error.message }, error.status);
      if (error instanceof ValidationError) return json({ ok: false, error: "Rate limit exceeded" }, 429, { "Retry-After": "3600" });
      return json({ ok: false, error: "Attestation RPC unavailable or misconfigured; retry later" }, 502);
    }
  };
}
