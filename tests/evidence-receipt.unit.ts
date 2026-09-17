import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalEvidenceJson, createEvidenceReceipt, hashEvidence, verifyEvidenceReceipt } from "../src/lib/evidence-receipt";

assert.equal(canonicalEvidenceJson({ z: 1, a: { y: true, x: null } }), '{"a":{"x":null,"y":true},"z":1}');
assert.equal(hashEvidence({ b: 2, a: 1 }), createHash("sha256").update('{"a":1,"b":2}').digest("hex"));
assert.equal(hashEvidence({ a: 1, b: 2 }), hashEvidence({ b: 2, a: 1 }));
assert.notEqual(hashEvidence([1, 2]), hashEvidence([2, 1]));
assert.equal(canonicalEvidenceJson({ "10": 10, "2": 2 }), '{"10":10,"2":2}');
assert.equal(hashEvidence(-0), hashEvidence(0));
assert.equal(hashEvidence("é\n😀"), hashEvidence(JSON.parse(JSON.stringify("é\n😀"))));
for (const bad of [undefined, NaN, Infinity, BigInt(1), new Date(), new Map(), () => 1, { x: undefined }, new Array(2)]) {
  assert.throws(() => hashEvidence(bad));
}
const cyclic: Record<string, unknown> = {};
cyclic.self = cyclic;
assert.throws(() => hashEvidence(cyclic));
assert.throws(() => hashEvidence({ get value() { return 1; } }));
assert.throws(() => hashEvidence({ [Symbol("key")]: 1 }));
const shared = { n: 1 };
assert.doesNotThrow(() => hashEvidence([shared, shared]));
const result = { score: 95, monidCost: { costUsd: 0.006 } };
const snapshot = { tables: [] };
const payload = { issuer: "databard", resultHash: hashEvidence(result), evidence: { snapshotHash: hashEvidence(snapshot) } };
const receipt = createEvidenceReceipt(payload);
assert.ok(verifyEvidenceReceipt(receipt));
assert.ok(verifyEvidenceReceipt(JSON.parse(JSON.stringify(receipt)), { result, snapshot }));
assert.equal(verifyEvidenceReceipt(receipt, { result: { score: 96 } }), false);
assert.equal(verifyEvidenceReceipt(receipt, { snapshot: { tables: [1] } }), false);
assert.equal(verifyEvidenceReceipt(receipt, { result: undefined }), false);
payload.issuer = "changed";
assert.equal(receipt.payload.issuer, "databard");
for (const invalid of [null, [], {}, { ...receipt, version: 2 }, { ...receipt, hashAlgorithm: "keccak256" },
  { ...receipt, canonicalization: "other" }, { ...receipt, payloadHash: "x" }, { ...receipt, extra: true },
  { ...receipt, payload: [] }, { ...receipt, payload: { ...receipt.payload, issuer: "changed" } }]) {
  assert.equal(verifyEvidenceReceipt(invalid), false);
}
console.log("evidence-receipt: canonicalization, malformed inputs, tampering, snapshot isolation and preimage checks passed");
