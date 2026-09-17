import { it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { createEvidenceReceipt, hashEvidence } from "../src/lib/evidence-receipt";
import { createAttestationRoute, type AttestationAction } from "../src/lib/attestation/http";
import { type AttestationRpc, explorerUrlFor } from "../src/lib/attestation/service";
import { ValidationError } from "../src/lib/validation";
import { POST as prepareRoute } from "../src/app/api/attestation/solana/prepare/route";
import { POST as anchorRoute } from "../src/app/api/attestation/solana/anchor/route";
import { POST as verifyRoute } from "../src/app/api/attestation/solana/verify/route";

const wallet = Keypair.fromSeed(new Uint8Array(32).fill(7)); // Public TEST identity; never fund.
const genesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const result = { demo: true, score: 95 };
const receipt = createEvidenceReceipt({ resultHash: hashEvidence(result) });
const base = { receipt, issuer: wallet.publicKey.toBase58(), chain: `solana:${genesis}` };
function fixture() {
  let signed: Transaction | undefined;
  let sends = 0;
  const rpc: AttestationRpc = {
    async getGenesisHash() { return genesis; },
    async getLatestBlockhash() { return { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 99 }; },
    async sendRawTransaction(raw) {
      sends++;
      signed = Transaction.from(raw);
      return bs58.encode(signed.signature!);
    },
    async getTransaction() {
      if (!signed) return null;
      return { slot: 5, meta: { err: null }, transaction: {
        message: signed.compileMessage(), signatures: [bs58.encode(signed.signature!)],
      } };
    },
  };
  const request = (body: unknown) => new Request("http://localhost/api/attestation/solana", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const call = (action: AttestationAction, body: unknown) => createAttestationRoute(action, { rpc: () => rpc, guard: () => {} })(request(body));
  return { rpc, call, request, sends: () => sends };
}

it("HTTP prepare → wallet sign → anchor → verify; retries use the same signature", async () => {
  const f = fixture();
  const prepared = await f.call("prepare", { ...base, consent: true });
  assert.equal(prepared.status, 200);
  const body = await prepared.json();
  assert.equal(body.prepared.chain, base.chain);
  const tx = Transaction.from(Buffer.from(body.prepared.unsignedTransactionBase64, "base64"));
  assert.equal(tx.instructions.length, 1);
  tx.sign(wallet);
  const anchorBody = { ...base, consent: true, signedTransactionBase64: tx.serialize().toString("base64") };
  const anchored = await f.call("anchor", anchorBody);
  assert.equal(anchored.status, 202);
  const submitted = await anchored.json();
  assert.equal(submitted.submission, "submitted");
  assert.equal(submitted.inclusion, "not-checked");
  assert.equal(submitted.reference.transactionId, bs58.encode(tx.signature!));
  const retry = await (await f.call("anchor", anchorBody)).json();
  assert.deepEqual(retry.reference, submitted.reference);
  for (const finality of ["confirmed", "finalized"]) {
    const checked = await (await f.call("verify", { ...base, transactionId: submitted.reference.transactionId, finality, result })).json();
    assert.equal(checked.verification.inclusion, finality);
    assert.equal(checked.verification.issuerAuthenticated, true);
    assert.equal(checked.resultIntegrity, "valid");
    assert.match(checked.explorerUrl, /cluster=devnet/);
  }
  f.rpc.sendRawTransaction = async () => { throw new Error("secret RPC URL"); };
  const unknown = await (await f.call("anchor", anchorBody)).json();
  assert.equal(unknown.submission, "unknown");
  assert.deepEqual(unknown.reference, submitted.reference);
  assert.ok(!JSON.stringify(unknown).includes("secret RPC URL"));
});

it("rejects unsafe submissions before broadcast", async () => {
  const f = fixture();
  const p = await (await f.call("prepare", { ...base, consent: true })).json();
  const tx = Transaction.from(Buffer.from(p.prepared.unsignedTransactionBase64, "base64"));
  const encode = () => tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  assert.equal((await f.call("anchor", { ...base, consent: true, signedTransactionBase64: encode() })).status, 400);
  tx.sign(wallet);
  assert.equal((await f.call("anchor", { ...base, signedTransactionBase64: encode() })).status, 400);
  assert.equal((await f.call("anchor", { ...base, receipt: createEvidenceReceipt({ other: true }), consent: true, signedTransactionBase64: encode() })).status, 400);
  tx.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: PublicKey.default, lamports: 1 }));
  tx.sign(wallet);
  assert.equal((await f.call("anchor", { ...base, consent: true, signedTransactionBase64: encode() })).status, 400);
  assert.equal(f.sends(), 0);
});


it("HTTP errors, invalid integrity, wrong chains and RPC outages never become verification success", async () => {
  const f = fixture();
  assert.equal((await f.call("prepare", null)).status, 400);
  assert.equal((await f.call("prepare", { ...base, consent: true, rpcUrl: "https://untrusted.invalid" })).status, 400);
  assert.equal((await f.call("prepare", { ...base, consent: true, chain: `solana:${PublicKey.default}` })).status, 409);
  assert.equal((await f.call("prepare", { ...base, consent: true, finality: "pending" })).status, 400);
  const transactionId = "1".repeat(64);
  const missing = await (await f.call("verify", { ...base, transactionId })).json();
  assert.equal(missing.verification.inclusion, "not-found");
  const tampered = await (await f.call("verify", { ...base, receipt: { ...receipt, payloadHash: "a".repeat(64) }, transactionId })).json();
  assert.equal(tampered.verification.integrity, "invalid");
  assert.equal(tampered.verification.issuerAuthenticated, false);
  const badResult = await (await f.call("verify", { ...base, transactionId, result: { demo: false } })).json();
  assert.equal(badResult.resultIntegrity, "invalid");
  f.rpc.getGenesisHash = async () => { throw new Error("secret RPC URL"); };
  const down = await (await f.call("verify", { ...base, transactionId })).json();
  assert.equal(down.verification.inclusion, "rpc-error");
  assert.equal((await f.call("prepare", { ...base, consent: true })).status, 502);
  const limited = createAttestationRoute("prepare", { guard: () => { throw new ValidationError("Rate limit"); } });
  const rateResponse = await limited(f.request(base));
  assert.equal(rateResponse.status, 429);
  assert.ok(rateResponse.headers.get("Retry-After"));
  assert.equal((await f.call("prepare", { ...base, padding: "x".repeat(256 * 1024) })).status, 413);
  for (const route of [prepareRoute, anchorRoute, verifyRoute]) {
    const malformed = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    assert.equal((await route(malformed)).status, 400);
    assert.equal((await route(new Request("http://localhost", { method: "POST", body: "{}" }))).status, 415);
  }
  assert.equal(explorerUrlFor(`solana:${PublicKey.default}`, transactionId), null);
});
