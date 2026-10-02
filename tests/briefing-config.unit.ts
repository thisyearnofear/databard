import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMcpInput } from "../src/lib/mcp";
import { briefingRouteConfig, BRIEFING_PRICE, X402_NETWORK } from "../src/lib/x402";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Regression guards for the two settings behind the OKX paid-endpoint
 * delistings: sync settlement (without it, verified payments settled nothing
 * — Sep 25) and text-only default audio (TTS pushed the response past the
 * reviewer timeout). A silent revert of either must fail here, not in prod.
 */
describe("paid briefing config", () => {
  it("syncSettle stays true — the response waits for on-chain confirmation", () => {
    // syncSettle lives inside the facilitator client constructor, which is
    // only built when prod creds exist, so the guard reads the source.
    const src = readFileSync(path.join(ROOT, "src/lib/x402.ts"), "utf8");
    assert.match(src, /syncSettle:\s*true/);
  });

  it("audio defaults to none — a bare paid call never waits on TTS", () => {
    assert.equal(parseMcpInput({}).audio, "none");
    assert.equal(parseMcpInput({ audio: "url" }).audio, "url");
    assert.equal(parseMcpInput({ audio: "inline" }).audio, "inline");
    // Unrecognised values fail closed to "none", not to audio.
    assert.equal(parseMcpInput({ audio: "wav" }).audio, "none");
  });

  it("the briefing route config keeps the exact USDT0-on-X-Layer gate", () => {
    assert.ok(briefingRouteConfig.resource?.endsWith("/api/mcp/briefing"));
    const accept = Array.isArray(briefingRouteConfig.accepts)
      ? briefingRouteConfig.accepts[0]
      : briefingRouteConfig.accepts;
    assert.equal(accept.scheme, "exact");
    assert.equal(accept.network, "eip155:196");
    assert.equal(X402_NETWORK, "eip155:196");
    assert.equal(accept.price, BRIEFING_PRICE);
    assert.equal(briefingRouteConfig.mimeType, "application/json");
  });
});
