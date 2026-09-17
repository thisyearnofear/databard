import { it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
const MEMO_PROGRAM_2 = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
/** web3.js Transaction.signatures are {signature, publicKey} pairs; ids are base58 strings. */
const bs58Encode = (bytes: Uint8Array | null): string => bs58.encode(Buffer.from(bytes ?? new Uint8Array()));
import { createEvidenceReceipt } from "../src/lib/evidence-receipt";
import { createSolanaAttestationAdapter, verifySolanaReceipt } from "../src/lib/attestation/solana";

it("confirms a receipt committed by the expected wallet; rejects another receipt or wallet", async () => {
  // Fixed, public TEST seed. Never fund or use this identity outside tests.
  const wallet = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const receipt = createEvidenceReceipt({ resultHash: "a".repeat(64) });
  const memo = `databard:evidence-receipt:v1:sha256:${receipt.payloadHash}`;
  const tx = new Transaction({
    feePayer: wallet.publicKey,
    recentBlockhash: PublicKey.default.toBase58(),
  }).add(new TransactionInstruction({
    programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: false }],
    data: Buffer.from(memo),
  }));
  tx.sign(wallet);
  assert.ok(tx.verifySignatures());
  // RPC returns a decoded, confirmed transaction; no network or funds involved.
  const referenceId = "1".repeat(64);
  const genesis = "test-genesis";
  const chainTx = {
    slot: 123,
    meta: { err: null },
    transaction: {
      message: tx.compileMessage(),
      signatures: [referenceId],
    },
  };
  let calls = 0;
  const rpc = {
    async getGenesisHash() { return genesis; },
    async getTransaction(reference: string, options: { commitment: string }) {
      calls++;
      assert.equal(reference, referenceId);
      assert.equal(options.commitment, "confirmed");
      return chainTx;
    },
  };
  const reference = { chain: `solana:${genesis}`, transactionId: referenceId, issuer: wallet.publicKey.toBase58() };
  const verified = await verifySolanaReceipt(receipt, reference, rpc);
  assert.equal(verified.integrity, "valid");
  assert.equal(verified.inclusion, "confirmed");
  assert.equal(verified.issuerAuthenticated, true);
  assert.equal(verified.slot, 123);
  assert.equal(calls, 1);

  const otherReceipt = createEvidenceReceipt({ resultHash: "b".repeat(64) });
  assert.equal((await verifySolanaReceipt(otherReceipt, reference, rpc)).inclusion, "mismatch");
  const otherWallet = Keypair.fromSeed(new Uint8Array(32).fill(8));
  assert.equal((await verifySolanaReceipt(receipt, {
    ...reference, issuer: otherWallet.publicKey.toBase58(),
  }, rpc)).issuerAuthenticated, false);
});

it("rejects wrong network, legacy memos, failed sends, and RPC outages without false positives", async () => {
  const wallet = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const receipt = createEvidenceReceipt({ resultHash: "a".repeat(64) });
  const memo = `databard:evidence-receipt:v1:sha256:${receipt.payloadHash}`;
  const signed = (programId: PublicKey, data: Buffer) => {
    const tx = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: PublicKey.default.toBase58() })
      .add(new TransactionInstruction({
        programId,
        keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: false }],
        data,
      }));
    tx.sign(wallet);
    return tx;
  };
  const okTx = signed(new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), Buffer.from(memo));
  const genesis = "test-genesis";
  const reference = { chain: `solana:${genesis}`, transactionId: "1".repeat(64), issuer: wallet.publicKey.toBase58() };
  const base = { slot: 1, meta: { err: null }, transaction: { message: okTx.compileMessage(), signatures: [reference.transactionId] } };
  let rpcCalls = 0;
  const rpc = {
    async getGenesisHash() { return genesis; },
    async getTransaction() { rpcCalls++; return { ...base }; },
  };
  assert.equal((await verifySolanaReceipt({ ...receipt, payloadHash: "0".repeat(64) }, reference, rpc)).integrity, "invalid");
  assert.equal((await verifySolanaReceipt(receipt, { ...reference, chain: "eip155:1" }, rpc)).inclusion, "mismatch");
  assert.equal((await verifySolanaReceipt(receipt, { ...reference, transactionId: "not-base58!!" }, rpc)).inclusion, "mismatch");
  assert.equal((await verifySolanaReceipt(receipt, reference, {
    async getGenesisHash() { return "different-genesis"; },
    async getTransaction() { throw new Error("should not be called"); },
  })).inclusion, "mismatch");
  assert.equal((await verifySolanaReceipt(receipt, reference, {
    ...rpc, async getTransaction() { rpcCalls++; return { ...base, meta: { err: "AccountNotFound" } }; },
  })).inclusion, "failed");
  assert.equal((await verifySolanaReceipt(receipt, reference, {
    ...rpc, async getTransaction() { rpcCalls++; return { ...base, meta: null }; },
  })).inclusion, "not-checked");
  assert.equal((await verifySolanaReceipt(receipt, reference, {
    ...rpc, async getTransaction() { rpcCalls++; return null; },
  })).inclusion, "not-found");
  assert.equal((await verifySolanaReceipt(receipt, reference, {
    ...rpc, async getTransaction() { throw new Error("rpc down"); },
  })).inclusion, "rpc-error");
  const legacy = signed(MEMO_PROGRAM_2, Buffer.from(JSON.stringify({ report_hash: "c".repeat(64) })));
  assert.equal((await verifySolanaReceipt(receipt, reference, {
    ...rpc, async getTransaction() { rpcCalls++; return { ...base, transaction: { message: legacy.compileMessage(), signatures: [reference.transactionId] } }; },
  })).inclusion, "mismatch");
  const transfer = signed(PublicKey.default, Buffer.alloc(0));
  assert.equal((await verifySolanaReceipt(receipt, reference, {
    ...rpc, async getTransaction() { rpcCalls++; return { ...base, transaction: { message: transfer.compileMessage(), signatures: [reference.transactionId] } }; },
  })).inclusion, "mismatch");
  assert.ok(rpcCalls >= 1);
});

it("round-trips prepare → wallet signature → verify through the adapter", async () => {
  const wallet = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const receipt = createEvidenceReceipt({ resultHash: "a".repeat(64) });
  const genesis = "roundtrip-genesis";
  const latest = { blockhash: "2".repeat(44), lastValidBlockHeight: 999 };
  const rpc = {
    async getGenesisHash() { return genesis; },
    async getLatestBlockhash() { return latest; },
    async getTransaction(signature: string) {
      const tx = Transaction.from(Buffer.from(signedBase64, "base64"));
      return {
        slot: 5, meta: { err: null, loadedAddresses: undefined },
        transaction: { message: tx.compileMessage(), signatures: tx.signatures.map((sig) => bs58Encode(sig.signature)) },
      };
    },
  };
  const adapter = createSolanaAttestationAdapter(rpc);
  const prepared = await adapter.prepare(receipt, wallet.publicKey.toBase58());
  assert.equal(prepared.chain, `solana:${genesis}`);
  assert.equal(prepared.payloadHash, receipt.payloadHash);
  const unsigned = Transaction.from(Buffer.from(prepared.unsignedTransactionBase64, "base64"));
  assert.throws(() => unsigned.serialize({ requireAllSignatures: true, verifySignatures: true }));
  unsigned.sign(wallet);
  const signedBase64 = unsigned.serialize().toString("base64");
  const verified = await adapter.verify(receipt, {
    chain: prepared.chain,
    transactionId: bs58Encode(unsigned.signatures[0].signature),
    issuer: prepared.issuer,
  });
  assert.equal(verified.integrity, "valid");
  assert.equal(verified.inclusion, "confirmed");
  assert.equal(verified.issuerAuthenticated, true);
  assert.equal(verified.slot, 5);
});
