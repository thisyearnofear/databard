/**
 * Wallet ops for the loop's local runner.
 *
 * - `precheck` — read every market keypair's devnet balance and fail fast if any is too low
 *                to complete the demo. Prevents the "HTTP 500 masks invariant failure" mode.
 * - `recycle`  — transfer accumulated SOL from Newsroom (which wins every sub-brief) back to
 *                Consumer and DigestBuyer. Keeps the demo economy closed without external funding.
 *
 * All ops target devnet only.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/** Read the raw file store to fetch a persisted keypair. */
function loadStoredKeypair(storeKey) {
  const cacheDir = resolve(new URL("../../.databard/cache", import.meta.url).pathname);
  const encoded = Buffer.from(storeKey).toString("base64url") + ".json";
  const path = join(cacheDir, encoded);
  const entry = JSON.parse(readFileSync(path, "utf-8"));
  const secret = Buffer.from(entry.data, "base64");
  return Keypair.fromSecretKey(secret);
}

export const WALLET_ROLES = [
  { name: "Watchdog",     storeKey: "watchdog-buyer-key" },
  { name: "Consumer",     storeKey: "consumer-buyer-key" },
  { name: "DigestBuyer",  storeKey: "digest-buyer-key" },
  { name: "signal",       storeKey: "seller-key:signal" },
  { name: "cascade",      storeKey: "seller-key:cascade" },
  { name: "newsroom",     storeKey: "seller-key:newsroom" },
  { name: "digest",       storeKey: "seller-key:digest" },
];

export async function readBalances(connection) {
  const rows = [];
  for (const role of WALLET_ROLES) {
    let kp;
    try {
      kp = loadStoredKeypair(role.storeKey);
    } catch {
      rows.push({ ...role, publicKey: null, lamports: 0, sol: 0, error: "keypair not yet provisioned" });
      continue;
    }
    const lamports = await connection.getBalance(kp.publicKey).catch(() => 0);
    rows.push({
      ...role,
      publicKey: kp.publicKey.toBase58(),
      lamports,
      sol: lamports / LAMPORTS_PER_SOL,
      keypair: kp,
    });
  }
  return rows;
}

/**
 * Precheck for the digest-margin loop: Consumer + DigestBuyer must have enough to fund a
 * full graph cycle plus a few retries. Returns { ok, message, rows }.
 */
export async function precheckForGraphCycle({ minConsumerSol = 0.1, minDigestBuyerSol = 0.08 } = {}) {
  const connection = new Connection(RPC, "confirmed");
  const rows = await readBalances(connection);
  const consumer = rows.find((r) => r.name === "Consumer");
  const digestBuyer = rows.find((r) => r.name === "DigestBuyer");

  const issues = [];
  if (!consumer?.publicKey) issues.push("Consumer keypair not provisioned — hit /api/market/keypairs first");
  if (!digestBuyer?.publicKey) issues.push("DigestBuyer keypair not provisioned — hit /api/market/keypairs first");
  if (consumer?.sol < minConsumerSol) issues.push(`Consumer at ${consumer.sol.toFixed(4)} SOL (needs ≥ ${minConsumerSol})`);
  if (digestBuyer?.sol < minDigestBuyerSol) issues.push(`DigestBuyer at ${digestBuyer.sol.toFixed(4)} SOL (needs ≥ ${minDigestBuyerSol})`);

  // Sellers need enough for a commit_delivery tx fee (~5000 lamports). 0.001 = 200 txs of headroom.
  for (const s of ["signal", "cascade", "newsroom", "digest"]) {
    const row = rows.find((r) => r.name === s);
    if (!row?.publicKey) continue;
    if (row.sol < 0.001) issues.push(`${s} seller at ${row.sol.toFixed(4)} SOL (needs ≥ 0.001 for tx fees)`);
  }

  return { ok: issues.length === 0, message: issues.join(" · "), rows };
}

/**
 * Recycle SOL from accumulating sellers (Newsroom + Digest — the ones that win deals) back
 * to the buyers (Consumer + DigestBuyer) so the demo economy stays closed. Leaves each
 * source with `keepSol` for tx fees. Preserves the "graph not pair" cash-flow story: money
 * that flowed to sellers gets recycled to buyers to fund the next cycle.
 */
export async function recycleFromNewsroom({ toConsumer = 0.15, toDigestBuyer = 0.1, keepSol = 0.005 } = {}) {
  const connection = new Connection(RPC, "confirmed");
  const rows = await readBalances(connection);
  const consumer = rows.find((r) => r.name === "Consumer");
  const digestBuyer = rows.find((r) => r.name === "DigestBuyer");
  const sources = rows.filter((r) => ["newsroom", "digest"].includes(r.name) && r.keypair);

  if (!consumer?.publicKey) return { ok: false, reason: "Consumer keypair missing" };
  if (!digestBuyer?.publicKey) return { ok: false, reason: "DigestBuyer keypair missing" };
  if (sources.length === 0) return { ok: false, reason: "no seller keypairs to drain" };

  const totalAvailable = sources.reduce((n, s) => n + Math.max(0, s.sol - keepSol), 0);
  if (totalAvailable <= 0) {
    return { ok: false, reason: `all seller balances below keepSol=${keepSol} — nothing to recycle` };
  }

  // Target amounts (Consumer needs more since it pays more per cycle)
  const totalTarget = toConsumer + toDigestBuyer;
  const results = [];
  let recycledToConsumer = 0;
  let recycledToDigestBuyer = 0;

  for (const src of sources) {
    const available = Math.max(0, src.sol - keepSol);
    if (available < 0.001) continue;

    // Split this source's available balance between the two destinations proportionally.
    const consumerNeed = Math.max(0, toConsumer - recycledToConsumer);
    const digestNeed = Math.max(0, toDigestBuyer - recycledToDigestBuyer);
    const totalNeed = consumerNeed + digestNeed;
    if (totalNeed < 0.001) break;

    const toConsumerAmt = Math.min(consumerNeed, available * (consumerNeed / totalNeed));
    const toDigestBuyerAmt = Math.min(digestNeed, available - toConsumerAmt);

    for (const [role, kpTo, amount] of [
      ["Consumer", consumer, toConsumerAmt],
      ["DigestBuyer", digestBuyer, toDigestBuyerAmt],
    ]) {
      if (amount < 0.001) continue;
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: src.keypair.publicKey,
          toPubkey: kpTo.keypair.publicKey,
          lamports: Math.round(amount * LAMPORTS_PER_SOL),
        }),
      );
      try {
        const sig = await sendAndConfirmTransaction(connection, tx, [src.keypair], { commitment: "confirmed" });
        results.push({ from: src.name, role, amountSol: amount, sig });
        if (role === "Consumer") recycledToConsumer += amount;
        else recycledToDigestBuyer += amount;
      } catch (e) {
        results.push({ from: src.name, role, amountSol: amount, error: e.message });
      }
    }
  }

  const after = await readBalances(connection);
  return {
    ok: results.some((r) => !r.error && r.amountSol > 0),
    results,
    balancesAfter: after.map((r) => ({ name: r.name, sol: r.sol })),
  };
}

// CLI mode: `node wallet-ops.mjs precheck` or `node wallet-ops.mjs recycle` or `... list`
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "list";
  if (cmd === "list" || cmd === "balances") {
    const connection = new Connection(RPC, "confirmed");
    const rows = await readBalances(connection);
    console.log("role        pubkey                                        balance (SOL)");
    for (const r of rows) {
      console.log(`  ${r.name.padEnd(12)} ${(r.publicKey ?? "not provisioned").padEnd(46)} ${r.sol.toFixed(6)}`);
    }
  } else if (cmd === "precheck") {
    const res = await precheckForGraphCycle();
    console.log(res.ok ? "✓ precheck ok" : "✗ precheck failed");
    if (res.message) console.log("  " + res.message);
    console.table(res.rows.map((r) => ({ name: r.name, sol: r.sol.toFixed(6), pubkey: r.publicKey?.slice(0, 12) })));
    process.exit(res.ok ? 0 : 1);
  } else if (cmd === "recycle") {
    const res = await recycleFromNewsroom();
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else {
    console.error(`unknown command: ${cmd}. use one of: list, precheck, recycle`);
    process.exit(2);
  }
}
