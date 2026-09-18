import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import {
  checkoutStorageKey,
  clearPendingCheckout,
  CORRUPT_PENDING_MESSAGE,
  readPendingCheckout,
  recoverCheckout,
  savePendingCheckout,
  signatureToBase58,
  submitRecoverableCheckout,
  verifyCheckoutRequest,
  type PendingCheckout,
} from "../src/lib/checkout-recovery";

function memStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const SIG_B58 = bs58.encode(Buffer.from(Array.from({ length: 64 }, (_, i) => i + 1)));

function pending(overrides: Partial<PendingCheckout> = {}): PendingCheckout {
  return {
    version: 1,
    walletAddress: "Wallet111",
    purpose: "edition",
    editionId: "int_1",
    slug: "jupiter",
    method: "usdc",
    txSignature: SIG_B58,
    amountLabel: "25 USDC",
    createdAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("signatureToBase58", () => {
  it("matches the bs58 oracle on arbitrary 64-byte signatures", () => {
    for (let i = 0; i < 20; i++) {
      const bytes = new Uint8Array(64).map(() => Math.floor(Math.random() * 256));
      assert.equal(signatureToBase58(bytes), bs58.encode(Buffer.from(bytes)));
    }
  });

  it("encodes leading zero bytes as leading '1's", () => {
    const bytes = new Uint8Array(64);
    bytes[63] = 7;
    assert.equal(signatureToBase58(bytes), bs58.encode(Buffer.from(bytes)));
    assert.ok(signatureToBase58(bytes).startsWith("1"));
  });

  it("refuses anything that is not a 64-byte signature", () => {
    assert.throws(() => signatureToBase58(new Uint8Array(32)), /Missing wallet signature/);
    assert.throws(() => signatureToBase58(new Uint8Array(0)), /Missing wallet signature/);
  });
});

describe("checkoutStorageKey", () => {
  it("keys by purpose and reference", () => {
    assert.equal(
      checkoutStorageKey("edition", "jupiter"),
      "databard:pending-checkout:edition:jupiter",
    );
    assert.equal(
      checkoutStorageKey("pro", "WalletABC"),
      "databard:pending-checkout:pro:WalletABC",
    );
  });
});

describe("readPendingCheckout", () => {
  const key = checkoutStorageKey("edition", "jupiter");

  it("returns null only when nothing was saved", () => {
    assert.equal(readPendingCheckout(memStorage(), key), null);
  });

  it("round-trips a valid record", () => {
    const storage = memStorage();
    savePendingCheckout(storage, key, pending());
    assert.deepEqual(readPendingCheckout(storage, key), pending());
  });

  it("throws a client-readable error on corrupt JSON — never silently enables repay", () => {
    const storage = memStorage({ [key]: "{not json" });
    assert.throws(() => readPendingCheckout(storage, key), new RegExp(CORRUPT_PENDING_MESSAGE));
  });

  it("rejects wrong version, purpose, method and non-base58 signatures", () => {
    for (const bad of [
      { ...pending(), version: 2 },
      { ...pending(), purpose: "team" },
      { ...pending(), method: "eth" },
      { ...pending(), txSignature: "not-base58!!" },
      { ...pending(), txSignature: "0OIl" + SIG_B58.slice(4) },
      { ...pending(), txSignature: SIG_B58.slice(0, 40) },
      { ...pending(), walletAddress: "" },
    ]) {
      const storage = memStorage({ [key]: JSON.stringify(bad) });
      assert.throws(() => readPendingCheckout(storage, key), new RegExp(CORRUPT_PENDING_MESSAGE));
    }
  });

  it("requires quoteId for SOL and editionId+slug for editions", () => {
    const noQuote = { ...pending(), method: "sol" };
    const noQuoteStorage = memStorage({ [key]: JSON.stringify(noQuote) });
    assert.throws(() => readPendingCheckout(noQuoteStorage, key), new RegExp(CORRUPT_PENDING_MESSAGE));

    const withQuote = { ...pending(), method: "sol", quoteId: "q_1" };
    const okStorage = memStorage({ [key]: JSON.stringify(withQuote) });
    assert.equal(readPendingCheckout(okStorage, key)?.quoteId, "q_1");

    const noSlug = pending();
    delete (noSlug as Partial<PendingCheckout>).slug;
    const noSlugStorage = memStorage({ [key]: JSON.stringify(noSlug) });
    assert.throws(() => readPendingCheckout(noSlugStorage, key), new RegExp(CORRUPT_PENDING_MESSAGE));

    const pro = { ...pending(), purpose: "pro" };
    delete (pro as Partial<PendingCheckout>).editionId;
    delete (pro as Partial<PendingCheckout>).slug;
    const proStorage = memStorage({ [checkoutStorageKey("pro", "Wallet111")]: JSON.stringify(pro) });
    assert.equal(
      readPendingCheckout(proStorage, checkoutStorageKey("pro", "Wallet111"))?.purpose,
      "pro",
    );
  });

  it("rejects a record stored under a key that does not match its contents", () => {
    const wrongKey = checkoutStorageKey("edition", "raydium");
    const storage = memStorage({ [wrongKey]: JSON.stringify(pending()) });
    assert.throws(() => readPendingCheckout(storage, wrongKey), new RegExp(CORRUPT_PENDING_MESSAGE));

    const proWrong = checkoutStorageKey("pro", "OtherWallet");
    const proRecord = { ...pending(), purpose: "pro", editionId: undefined, slug: undefined };
    const proStorage = memStorage({ [proWrong]: JSON.stringify(proRecord) });
    assert.throws(() => readPendingCheckout(proStorage, proWrong), new RegExp(CORRUPT_PENDING_MESSAGE));
  });

  it("rejects a record whose createdAt is not a finite date", () => {
    const storage = memStorage({ [key]: JSON.stringify({ ...pending(), createdAt: "not-a-date" }) });
    assert.throws(() => readPendingCheckout(storage, key), new RegExp(CORRUPT_PENDING_MESSAGE));
  });

  it("translates a throwing storage.getItem into the corrupt-record message", () => {
    const broken = { getItem: () => { throw new Error("denied"); } };
    assert.throws(() => readPendingCheckout(broken, key), new RegExp(CORRUPT_PENDING_MESSAGE));
  });
});

describe("savePendingCheckout", () => {
  it("fails closed when the record cannot be read back", () => {
    let reads = 0;
    const broken = {
      getItem: () => (++reads === 1 ? null : "tampered"),
      setItem: () => {},
    };
    assert.throws(
      () => savePendingCheckout(broken, checkoutStorageKey("edition", "jupiter"), pending()),
      /payment not sent/i,
    );
  });

  it("refuses to overwrite an existing record with a different signature", () => {
    const storage = memStorage();
    const key = checkoutStorageKey("edition", "jupiter");
    savePendingCheckout(storage, key, pending());
    const other = pending({ txSignature: bs58.encode(Buffer.alloc(64, 9)) });
    assert.throws(() => savePendingCheckout(storage, key, other), /already pending/i);
    assert.equal(readPendingCheckout(storage, key)?.txSignature, SIG_B58);
  });
});

describe("submitRecoverableCheckout", () => {
  it("saves before it submits, then always verifies the saved reference", async () => {
    const order: string[] = [];
    await submitRecoverableCheckout(pending(), {
      save: () => order.push("save"),
      submit: async () => { order.push("submit"); },
      verify: async () => { order.push("verify"); },
    });
    assert.deepEqual(order, ["save", "submit", "verify"]);
  });

  it("a rejected send still verifies the same saved signature", async () => {
    let verified: PendingCheckout | null = null;
    await submitRecoverableCheckout(pending(), {
      save: () => {},
      submit: async () => { throw new Error("send failed"); },
      verify: async (p) => { verified = p; },
    });
    assert.equal(verified!.txSignature, SIG_B58);
  });

  it("a failed verify propagates and retains the persisted record", async () => {
    const storage = memStorage();
    const key = checkoutStorageKey("edition", "jupiter");
    await assert.rejects(
      submitRecoverableCheckout(pending(), {
        save: (p) => savePendingCheckout(storage, key, p),
        submit: async () => {},
        verify: async () => { throw new Error("not confirmed"); },
      }),
      /not confirmed/,
    );
    assert.equal(readPendingCheckout(storage, key)?.txSignature, SIG_B58);
  });

  it("persistence failure fails closed — submit is never attempted", async () => {
    let submitted = false;
    await assert.rejects(
      submitRecoverableCheckout(pending(), {
        save: () => { throw new Error("storage full"); },
        submit: async () => { submitted = true; },
        verify: async () => {},
      }),
      /storage full/,
    );
    assert.equal(submitted, false);
  });

  it("a different pending signature blocks the broadcast before it happens", async () => {
    const storage = memStorage();
    const key = checkoutStorageKey("edition", "jupiter");
    savePendingCheckout(storage, key, pending());
    let submitted = false;
    let verified = false;
    await assert.rejects(
      submitRecoverableCheckout(pending({ txSignature: bs58.encode(Buffer.alloc(64, 9)) }), {
        save: (p) => savePendingCheckout(storage, key, p),
        submit: async () => { submitted = true; },
        verify: async () => { verified = true; },
      }),
      /already pending/i,
    );
    assert.equal(submitted, false);
    assert.equal(verified, false);
    assert.equal(readPendingCheckout(storage, key)?.txSignature, SIG_B58);
  });
});

describe("recoverCheckout", () => {
  function stubFetch(handler: (url: string, body: Record<string, unknown>) => { status: number; json: unknown }) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const request = (async (input: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      calls.push({ url: String(input), body });
      const out = handler(String(input), body);
      return {
        ok: out.status >= 200 && out.status < 300,
        status: out.status,
        json: async () => out.json,
      } as Response;
    }) as typeof fetch;
    return { request, calls };
  }

  it("calls only the verify endpoint with the saved transaction reference", async () => {
    const { request, calls } = stubFetch(() => ({ status: 200, json: { ok: true, explorerUrl: "https://x" } }));
    const data = await recoverCheckout(pending({ method: "sol", quoteId: "q_9" }), request);
    assert.equal(data.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/checkout/palmusd/verify");
    assert.equal(calls[0].body.txSignature, SIG_B58);
    assert.equal(calls[0].body.quoteId, "q_9");
  });

  it("rejects on an HTTP error and retains the saved record", async () => {
    const storage = memStorage();
    const key = checkoutStorageKey("edition", "jupiter");
    savePendingCheckout(storage, key, pending());
    const { request, calls } = stubFetch(() => ({ status: 400, json: { ok: false, error: "mismatched" } }));
    await assert.rejects(recoverCheckout(pending(), request), /mismatched/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/checkout/palmusd/verify");
    assert.equal(readPendingCheckout(storage, key)?.txSignature, SIG_B58);
  });

  it("rejects on a network failure without touching storage", async () => {
    const storage = memStorage();
    const key = checkoutStorageKey("edition", "jupiter");
    savePendingCheckout(storage, key, pending());
    const request = (async () => { throw new Error("offline"); }) as typeof fetch;
    await assert.rejects(recoverCheckout(pending(), request), /offline/);
    assert.equal(readPendingCheckout(storage, key)?.txSignature, SIG_B58);
  });

  it("rejects when the server answers ok:false", async () => {
    const { request } = stubFetch(() => ({ status: 200, json: { ok: false, error: "not confirmed" } }));
    await assert.rejects(recoverCheckout(pending(), request), /not confirmed/);
  });
});

describe("verifyCheckoutRequest", () => {
  it("builds a verify-only body from the saved record", () => {
    const { url, body } = verifyCheckoutRequest(pending({ method: "sol", quoteId: "q_9" }));
    assert.equal(url, "/api/checkout/palmusd/verify");
    assert.equal(body.purpose, "edition");
    assert.equal(body.editionId, "int_1");
    assert.equal(body.method, "sol");
    assert.equal(body.quoteId, "q_9");
    assert.equal(body.txSignature, SIG_B58);
    assert.equal("amount" in body, false);
    assert.equal("usdAmount" in body, false);
  });
});

describe("clearPendingCheckout", () => {
  it("removes the record so success reads clean", () => {
    const storage = memStorage();
    const key = checkoutStorageKey("pro", "Wallet111");
    savePendingCheckout(storage, key, pending({ purpose: "pro", editionId: undefined, slug: undefined }));
    clearPendingCheckout(storage, key);
    assert.equal(readPendingCheckout(storage, key), null);
  });
});
