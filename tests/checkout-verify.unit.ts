import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.PALM_USD_RECIPIENT = "So11111111111111111111111111111111111111112";

import { Connection, PublicKey } from "@solana/web3.js";
import { POST as verifyRoute } from "../src/app/api/checkout/palmusd/verify/route";
import { registerBackend, type VerifyRequest, type VerifyResult } from "../src/lib/settlement/verifier";
import { blockTimeWithinWindow, solBackend } from "../src/lib/settlement/backends/sol";
import { pusdBackend } from "../src/lib/settlement/backends/pusd";
import { createIntent, getPublished } from "../src/lib/editions";
import { store } from "../src/lib/store";
import { pusdMint, usdcMint, type SolQuote } from "../src/lib/pusd";

function sig(): string {
  return `sig_${randomBytes(8).toString("hex")}`;
}

function call(body: Record<string, unknown>) {
  const req = new Request("http://localhost/api/checkout/palmusd/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return verifyRoute(req as never);
}

interface Stub {
  requests: VerifyRequest[];
  activations: string[];
  result: VerifyResult;
}

function stubBackend(id: "pusd" | "sol", result: VerifyResult): Stub {
  const stub: Stub = { requests: [], activations: [], result };
  registerBackend({
    id,
    verify: async (req) => {
      stub.requests.push(req);
      return stub.result;
    },
    activate: async (customerId) => {
      stub.activations.push(customerId);
    },
  });
  return stub;
}

const VERIFIED: VerifyResult = { status: "verified", explorerUrl: "https://explorer.solana.com/tx/x", settledAmount: "25000000" };

function storeQuote(overrides: Partial<SolQuote> = {}): SolQuote {
  const quote: SolQuote = {
    id: `q_test_${randomBytes(4).toString("hex")}`,
    walletAddress: "Wallet111",
    purpose: "edition",
    intentId: "int_1",
    usdAmount: 25,
    lamports: 235_534_000,
    solUsd: 106.14,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  };
  store.set(`pay:quote:${quote.id}`, quote, 86400 * 7);
  return quote;
}

describe("pro activation replay", () => {
  it("re-verifying the same signature + purpose + wallet succeeds instead of 409", async () => {
    const stub = stubBackend("pusd", VERIFIED);
    const txSignature = sig();
    const walletAddress = `Wallet_${randomBytes(4).toString("hex")}`;
    const body = { walletAddress, txSignature, purpose: "pro", method: "pusd" };

    const first = await (await call(body)).json();
    assert.equal(first.ok, true);
    assert.equal(stub.activations.length, 1);

    const retry = await (await call(body)).json();
    assert.equal(retry.ok, true);
    assert.equal(stub.activations.length, 2);
  });

  it("the same signature claimed for another purpose or wallet still conflicts", async () => {
    stubBackend("pusd", VERIFIED);
    const txSignature = sig();
    const walletAddress = `Wallet_${randomBytes(4).toString("hex")}`;
    const first = await (await call({ walletAddress, txSignature, purpose: "pro", method: "pusd" })).json();
    assert.equal(first.ok, true);

    const other = await call({ walletAddress: `Other_${randomBytes(4).toString("hex")}`, txSignature, purpose: "pro", method: "pusd" });
    assert.equal(other.status, 409);
    const otherBody = await other.json();
    assert.equal(otherBody.ok, false);

    const intent = createIntent(`Replay Sponsor ${randomBytes(3).toString("hex")}`);
    const cross = await call({
      walletAddress, txSignature, purpose: "edition", editionId: intent.id, method: "pusd",
    });
    assert.equal(cross.status, 409);
  });
});

describe("SOL quote window", () => {
  it("passes the locked quote's blockTime window to the backend", async () => {
    const stub = stubBackend("sol", VERIFIED);
    const created = Date.now() - 20 * 60_000;
    const quote = storeQuote({
      purpose: "pro",
      intentId: null,
      walletAddress: "WalletWin",
      createdAt: new Date(created).toISOString(),
      expiresAt: new Date(created + 600_000).toISOString(),
    });
    const res = await call({
      walletAddress: "WalletWin", txSignature: sig(), purpose: "pro", method: "sol", quoteId: quote.id,
    });
    const body = await res.json();
    assert.equal(body.ok, true);
    const req = stub.requests[0];
    assert.equal(req.expectedAfter, Math.floor(created / 1000) - 30);
    assert.equal(req.expectedBefore, Math.floor((created + 600_000) / 1000));
    assert.equal(req.expectedAmount, quote.lamports);
  });

  it("a missing or foreign quote refuses without preparing a fresh payment", async () => {
    stubBackend("sol", VERIFIED);
    const res = await call({
      walletAddress: "WalletWin", txSignature: sig(), purpose: "pro", method: "sol", quoteId: "q_gone",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Payment quote unavailable.*do not pay again/);
  });

  it("a quote bound to another payer does not verify", async () => {
    stubBackend("sol", VERIFIED);
    const quote = storeQuote({ purpose: "pro", intentId: null, walletAddress: "PayerA" });
    const res = await call({
      walletAddress: "PayerB", txSignature: sig(), purpose: "pro", method: "sol", quoteId: quote.id,
    });
    assert.equal(res.status, 400);
  });
});

describe("blockTimeWithinWindow (pure boundary)", () => {
  const req = { expectedAfter: 1_000, expectedBefore: 2_000 };

  it("on-time blockTime verifies even when wall-clock expired", () => {
    assert.equal(blockTimeWithinWindow(req, 1_500), true);
    assert.equal(blockTimeWithinWindow(req, 1_000), true);
    assert.equal(blockTimeWithinWindow(req, 2_000), true);
  });

  it("late, early or missing blockTime is rejected", () => {
    assert.equal(blockTimeWithinWindow(req, 2_001), false);
    assert.equal(blockTimeWithinWindow(req, 999), false);
    assert.equal(blockTimeWithinWindow(req, null), false);
    assert.equal(blockTimeWithinWindow(req, undefined), false);
  });

  it("no window means no constraint", () => {
    assert.equal(blockTimeWithinWindow({}, undefined), true);
  });
});

describe("refusals stay refused", () => {
  it("a mismatched backend verdict (wrong payer/mint/amount) is a 400", async () => {
    stubBackend("pusd", { status: "mismatched", detail: "Transaction was not funded by the claiming wallet" });
    const res = await call({
      walletAddress: "WalletX", txSignature: sig(), purpose: "pro", method: "pusd",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /not funded by the claiming wallet/);
  });

  it("an unconfirmed (not-found) payment is a 400, keeping the reference alive", async () => {
    stubBackend("pusd", { status: "not-found", detail: "Transaction not found on-chain" });
    const res = await call({
      walletAddress: "WalletX", txSignature: sig(), purpose: "pro", method: "pusd",
    });
    assert.equal(res.status, 400);
  });
});

describe("edition publish", () => {
  it("stores the verified on-chain amount as payment metadata — never the caller's", async () => {
    const stub = stubBackend("pusd", { ...VERIFIED, settledAmount: "25000000" });
    const sponsor = `Meta Sponsor ${randomBytes(3).toString("hex")}`;
    const intent = createIntent(sponsor);
    const res = await call({
      walletAddress: "BuyerMeta", txSignature: sig(),
      purpose: "edition", editionId: intent.id, method: "usdc",
    });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(stub.requests[0].expectedAmount, Math.round(intent.pricePusd * 1e6));
    const published = getPublished(intent.slug);
    assert.ok(published);
    assert.deepEqual(published!.payment, {
      method: "usdc",
      amountBaseUnits: "25000000",
      decimals: 6,
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet",
    });
    assert.equal(published!.pricePusd, intent.pricePusd);
  });

  it("a published edition verifies idempotently on retry with the same signature", async () => {
    stubBackend("pusd", VERIFIED);
    const sponsor = `Retry Sponsor ${randomBytes(3).toString("hex")}`;
    const intent = createIntent(sponsor);
    const txSignature = sig();
    const body = {
      walletAddress: "BuyerRetry", txSignature,
      purpose: "edition", editionId: intent.id, method: "pusd",
    };
    const first = await (await call(body)).json();
    assert.equal(first.ok, true);

    const retry = await (await call(body)).json();
    assert.equal(retry.ok, true);
    assert.equal(retry.slug, intent.slug);

    const other = await (await call({ ...body, txSignature: sig() })).json();
    assert.equal(other.ok, true);
  });
});

describe("activation failure and retry", () => {
  it("a failed edition publish releases the claim so the same signature retries", async () => {
    stubBackend("pusd", VERIFIED);
    const sponsor = `Fail Publish ${randomBytes(3).toString("hex")}`;
    const intent = createIntent(sponsor);
    const txSignature = sig();
    const body = {
      walletAddress: "BuyerFail", txSignature,
      purpose: "edition", editionId: intent.id, method: "pusd",
    };

    const origSet = store.set.bind(store);
    let thrown = false;
    const mocked = mock.method(store, "set", (key: string, value: unknown, ttl?: number) => {
      if (!thrown && key.startsWith("edition:pub:")) {
        thrown = true;
        throw new Error("disk full");
      }
      return origSet(key, value, ttl);
    });
    const first = await call(body);
    mocked.mock.restore();
    assert.equal(first.status, 500);
    const firstBody = await first.json();
    assert.equal(firstBody.error, "Verification failed — keep your transaction reference and retry.");
    assert.equal(store.get(`pusd:spent:${txSignature}`), null);
    assert.equal(getPublished(intent.slug), null);

    const retry = await (await call(body)).json();
    assert.equal(retry.ok, true);
    assert.equal(retry.slug, intent.slug);
  });

  it("a failed Pro activation releases the claim so the same signature retries", async () => {
    let activateCalls = 0;
    registerBackend({
      id: "pusd",
      verify: async () => VERIFIED,
      activate: async () => {
        activateCalls++;
        if (activateCalls === 1) throw new Error("accounts db down");
      },
    });
    const txSignature = sig();
    const body = {
      walletAddress: `Wallet_${randomBytes(4).toString("hex")}`,
      txSignature, purpose: "pro", method: "pusd",
    };

    const first = await call(body);
    assert.equal(first.status, 500);
    const firstBody = await first.json();
    assert.equal(firstBody.error, "Verification failed — keep your transaction reference and retry.");
    assert.equal(store.get(`pusd:spent:${txSignature}`), null);

    const retry = await (await call(body)).json();
    assert.equal(retry.ok, true);
    assert.equal(activateCalls, 2);
  });

  it("an edition verification without a settled amount refuses to publish", async () => {
    stubBackend("pusd", { status: "verified", explorerUrl: "https://x" });
    const intent = createIntent(`No Amount ${randomBytes(3).toString("hex")}`);
    const txSignature = sig();
    const res = await call({
      walletAddress: "BuyerNoAmt", txSignature,
      purpose: "edition", editionId: intent.id, method: "pusd",
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, "Verification failed — keep your transaction reference and retry.");
    assert.equal(getPublished(intent.slug), null);
    assert.equal(store.get(`pusd:spent:${txSignature}`), null);
  });
});

describe("settlement backends against transaction fixtures", () => {
  const payer = new PublicKey("So11111111111111111111111111111111111111112");
  const treasury = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const other = new PublicKey("11111111111111111111111111111111");

  function keysMessage(staticKeys: PublicKey[]) {
    return {
      getAccountKeys: (opts?: { accountKeysFromLookups?: { writable?: PublicKey[]; readonly?: PublicKey[] } }) => ({
        keySegments: () => [
          staticKeys,
          opts?.accountKeysFromLookups?.writable ?? [],
          opts?.accountKeysFromLookups?.readonly ?? [],
        ],
      }),
    };
  }

  function solTx(opts: {
    keys: PublicKey[];
    blockTime?: number | null;
    pre: number[];
    post: number[];
    writable?: PublicKey[];
  }) {
    return {
      blockTime: opts.blockTime ?? null,
      meta: {
        err: null,
        preBalances: opts.pre,
        postBalances: opts.post,
        loadedAddresses: { writable: opts.writable ?? [], readonly: [] },
      },
      transaction: { message: keysMessage(opts.keys) },
    };
  }

  function splTx(opts: {
    keys: PublicKey[];
    mint: string;
    preAmount: string;
    postAmount: string;
  }) {
    const balance = (amount: string) => [{
      accountIndex: 1,
      mint: opts.mint,
      owner: treasury.toBase58(),
      uiTokenAmount: { amount },
    }];
    return {
      blockTime: null,
      meta: {
        err: null,
        preBalances: [0, 0],
        postBalances: [0, 0],
        preTokenBalances: balance(opts.preAmount),
        postTokenBalances: balance(opts.postAmount),
        loadedAddresses: { writable: [], readonly: [] },
      },
      transaction: { message: keysMessage(opts.keys) },
    };
  }

  function withTx(tx: unknown, fn: () => Promise<unknown>) {
    const mocked = mock.method(Connection.prototype, "getTransaction", async () => tx);
    return fn().finally(() => mocked.mock.restore());
  }

  it("sol backend verifies an on-time payment after wall-clock expiry", async () => {
    const now = Math.floor(Date.now() / 1000);
    const tx = solTx({ keys: [payer, treasury], blockTime: now - 1200, pre: [0, 1_000_000], post: [0, 1_150_000] });
    const res = await withTx(tx, () => solBackend.verify({
      reference: "sig_fixture_ontime",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedAmount: 150_000,
      expectedAfter: now - 1500,
      expectedBefore: now - 900,
    }));
    assert.equal((res as VerifyResult).status, "verified");
    assert.equal((res as VerifyResult).settledAmount, "150000");
  });

  it("sol backend rejects a late blockTime", async () => {
    const now = Math.floor(Date.now() / 1000);
    const tx = solTx({ keys: [payer, treasury], blockTime: now, pre: [0, 0], post: [0, 200_000] });
    const res = await withTx(tx, () => solBackend.verify({
      reference: "sig_fixture_late",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedAmount: 150_000,
      expectedAfter: now - 1500,
      expectedBefore: now - 900,
    }));
    assert.equal((res as VerifyResult).status, "mismatched");
  });

  it("sol backend resolves the treasury through address lookup tables", async () => {
    const now = Math.floor(Date.now() / 1000);
    const tx = solTx({
      keys: [payer],
      blockTime: now,
      writable: [treasury],
      pre: [0, 5_000],
      post: [0, 175_000],
    });
    const res = await withTx(tx, () => solBackend.verify({
      reference: "sig_fixture_lookup",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedAmount: 170_000,
    }));
    assert.equal((res as VerifyResult).status, "verified");
    assert.equal((res as VerifyResult).settledAmount, "170000");
  });

  it("sol backend rejects a wrong payer and an insufficient treasury delta", async () => {
    const tx = solTx({ keys: [other, treasury], blockTime: null, pre: [0, 0], post: [0, 500_000] });
    const res = await withTx(tx, () => solBackend.verify({
      reference: "sig_fixture_payer",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedAmount: 100_000,
    }));
    assert.equal((res as VerifyResult).status, "mismatched");

    const short = solTx({ keys: [payer, treasury], blockTime: null, pre: [0, 0], post: [0, 50_000] });
    const res2 = await withTx(short, () => solBackend.verify({
      reference: "sig_fixture_short",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedAmount: 150_000,
    }));
    assert.equal((res2 as VerifyResult).status, "mismatched");
  });

  it("pusd backend verifies the treasury token delta and reports settledAmount", async () => {
    const tx = splTx({ keys: [payer, treasury], mint: pusdMint().toBase58(), preAmount: "1000000", postAmount: "50000000" });
    const res = await withTx(tx, () => pusdBackend.verify({
      reference: "sig_fixture_spl",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedMint: pusdMint().toBase58(),
      expectedAmount: 49_000_000,
    }));
    assert.equal((res as VerifyResult).status, "verified");
    assert.equal((res as VerifyResult).settledAmount, "49000000");
  });

  it("pusd backend rejects a wrong payer, a wrong mint and an insufficient delta", async () => {
    const wrongPayer = splTx({ keys: [other, treasury], mint: pusdMint().toBase58(), preAmount: "0", postAmount: "60000000" });
    const res = await withTx(wrongPayer, () => pusdBackend.verify({
      reference: "sig_fixture_spl_payer",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedMint: pusdMint().toBase58(),
      expectedAmount: 49_000_000,
    }));
    assert.equal((res as VerifyResult).status, "mismatched");

    const wrongMint = splTx({ keys: [payer, treasury], mint: usdcMint().toBase58(), preAmount: "0", postAmount: "60000000" });
    const res2 = await withTx(wrongMint, () => pusdBackend.verify({
      reference: "sig_fixture_spl_mint",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedMint: pusdMint().toBase58(),
      expectedAmount: 49_000_000,
    }));
    assert.equal((res2 as VerifyResult).status, "mismatched");

    const short = splTx({ keys: [payer, treasury], mint: pusdMint().toBase58(), preAmount: "0", postAmount: "1000000" });
    const res3 = await withTx(short, () => pusdBackend.verify({
      reference: "sig_fixture_spl_short",
      expectedRecipient: treasury.toBase58(),
      expectedPayer: payer.toBase58(),
      expectedMint: pusdMint().toBase58(),
      expectedAmount: 49_000_000,
    }));
    assert.equal((res3 as VerifyResult).status, "mismatched");
  });
});
