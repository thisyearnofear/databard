"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MintRecord } from "@/lib/mint-stats";
import { DitherButton, DitherGradient } from "@/components/dither-kit";
import { LeadCapture } from "@/components/LeadCapture";

interface VerifyMemo {
  schemaName: string;
  healthScore: number | null;
  episodeId: string;
  reportHash: string;
  author: string;
  timestamp: string | null;
}

interface VerifyResponse {
  ok: boolean;
  error?: string;
  // Non-attestation memo path
  verifiable?: boolean;
  rawMemo?: string;
  note?: string;
  // Marketplace settlement receipt path
  settlement?: {
    wantId: string;
    personaId: string;
    buyer: string;
    priceLamports: number | null;
    manifestHash: string;
    settledAt: string | null;
  };
  // Attestation path
  network?: string;
  explorerUrl?: string;
  memo?: VerifyMemo;
  blockTime?: number | null;
  episodeAvailable?: boolean;
  recomputedHash?: string | null;
  match?: boolean | null;
  mintRecord?: MintRecord | null;
}

function truncate(value: string, head = 10, tail = 8): string {
  if (!value || value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function HashRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-[var(--text-muted)] shrink-0">{label}</span>
      {value ? (
        <span className="font-mono text-[var(--text)] truncate" title={value}>
          {truncate(value, 12, 12)}
        </span>
      ) : (
        <span className="text-[var(--text-muted)]">—</span>
      )}
    </div>
  );
}

function MemoFacts({ memo, blockTime }: { memo: VerifyMemo; blockTime: number | null | undefined }) {
  const when = memo.timestamp
    ? new Date(memo.timestamp).toLocaleString()
    : blockTime
    ? new Date(blockTime * 1000).toLocaleString()
    : "—";
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mt-3">
      <div>
        <div className="text-[var(--text-muted)] mb-0.5">Schema</div>
        <div className="font-medium">{memo.schemaName || "—"}</div>
      </div>
      <div>
        <div className="text-[var(--text-muted)] mb-0.5">Health score</div>
        <div className="font-medium tabular-nums">
          {memo.healthScore !== null ? `${memo.healthScore}%` : "—"}
        </div>
      </div>
      <div>
        <div className="text-[var(--text-muted)] mb-0.5">Attested</div>
        <div className="font-medium">{when}</div>
      </div>
      <div>
        <div className="text-[var(--text-muted)] mb-0.5">Author</div>
        <div className="font-mono" title={memo.author}>
          {memo.author ? truncate(memo.author, 6, 6) : "—"}
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <VerifyPageInner />
    </Suspense>
  );
}

function VerifyPageInner() {
  const searchParams = useSearchParams();
  const initialTx = searchParams.get("tx") ?? "";
  const [tx, setTx] = useState(initialTx);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);

  const runVerify = useCallback(async (signature: string) => {
    const trimmed = signature.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/onchain/verify?tx=${encodeURIComponent(trimmed)}`);
      const data: VerifyResponse = await res.json();
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Could not reach the verification endpoint. Try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-verify when arriving with ?tx=
  useEffect(() => {
    if (initialTx) runVerify(initialTx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attestation = result?.ok && result.memo ? result : null;

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8 relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden" aria-hidden>
        <DitherGradient from="purple" direction="down" opacity={0.14} className="h-full w-full" />
      </div>

      <div className="max-w-[720px] mx-auto relative">
        <div className="mb-8">
          <Link href="/" className="text-[var(--text-muted)] text-sm no-underline">
            ← Back to DataBard
          </Link>
          <h1 className="text-[28px] font-extrabold mt-4 mb-1">Verify an attestation</h1>
          <p className="text-[var(--text-muted)] text-[15px]">
            Every DataBard health report is hashed and written to Solana. Paste a transaction
            signature to check the record against the report — no trust in DataBard&apos;s servers
            required for the hash itself.
          </p>
        </div>

        {/* Input */}
        <form
          className="flex gap-3 items-stretch mb-8 flex-wrap sm:flex-nowrap"
          onSubmit={(e) => {
            e.preventDefault();
            runVerify(tx);
          }}
        >
          <input
            value={tx}
            onChange={(e) => setTx(e.target.value)}
            placeholder="Solana transaction signature (e.g. 5Kd7z…)"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 min-w-0 font-mono text-xs bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <DitherButton
            type="submit"
            color="purple"
            variant="gradient"
            bloom="low"
            disabled={loading || !tx.trim()}
            className="px-6 py-3 text-sm font-semibold shrink-0"
          >
            {loading ? "Verifying…" : "Verify"}
          </DitherButton>
        </form>

        {/* Loading */}
        {loading && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text-muted)] text-sm animate-pulse">
            Fetching transaction from Solana and recomputing the report hash…
          </div>
        )}

        {/* Error / not found / not an attestation (ok:false) */}
        {!loading && result && !result.ok && (
          <div className="bg-[var(--danger)]/5 border border-[var(--danger)]/30 rounded-2xl p-6">
            <p className="text-sm font-semibold text-[var(--danger)] mb-1">Verification failed</p>
            <p className="text-xs text-[var(--text-muted)]">{result.error}</p>
          </div>
        )}

        {/* Marketplace settlement receipt — a different DataBard memo kind */}
        {!loading && result?.ok && result.verifiable === false && result.settlement && (
          <div className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-1">
              <span className="w-9 h-9 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-lg shrink-0">
                ⛓
              </span>
              <div>
                <p className="text-base font-bold">Marketplace settlement receipt</p>
                <p className="text-xs text-[var(--text-muted)]">{result.note}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mt-4">
              <div>
                <div className="text-[var(--text-muted)] mb-0.5">Deal</div>
                <div className="font-mono">{result.settlement.wantId || "—"}</div>
              </div>
              <div>
                <div className="text-[var(--text-muted)] mb-0.5">Price</div>
                <div className="font-medium tabular-nums">
                  {result.settlement.priceLamports !== null
                    ? `${(result.settlement.priceLamports / 1e9).toFixed(4)} SOL`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-muted)] mb-0.5">Buyer</div>
                <div className="font-mono" title={result.settlement.buyer}>{truncate(result.settlement.buyer)}</div>
              </div>
              <div>
                <div className="text-[var(--text-muted)] mb-0.5">Settled</div>
                <div className="font-medium">
                  {result.settlement.settledAt ? new Date(result.settlement.settledAt).toLocaleString() : "—"}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <HashRow label="Manifest hash (on-chain)" value={result.settlement.manifestHash || null} />
            </div>
            {result.explorerUrl && (
              <a
                href={result.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] text-xs inline-block mt-4"
              >
                View transaction on Solana Explorer →
              </a>
            )}
          </div>
        )}

        {/* Memo exists but is not a DataBard attestation */}
        {!loading && result?.ok && result.verifiable === false && !result.settlement && (
          <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-2xl p-6">
            <p className="text-sm font-semibold text-[var(--warning)] mb-1">
              Not a DataBard attestation
            </p>
            <p className="text-xs text-[var(--text-muted)] mb-3">{result.note}</p>
            {result.rawMemo && (
              <pre className="text-[11px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all text-[var(--text-muted)]">
                {result.rawMemo}
              </pre>
            )}
            {result.explorerUrl && (
              <a
                href={result.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] text-xs inline-block mt-3"
              >
                View transaction on Solana Explorer →
              </a>
            )}
          </div>
        )}

        {/* Attestation result */}
        {!loading && attestation?.memo && (
          <div className="flex flex-col gap-4">
            {attestation.match === true && (
              <div className="bg-[var(--success)]/5 border border-[var(--success)]/40 rounded-2xl p-6 animate-slide-up">
                <div className="flex items-center gap-3 mb-1">
                  <span className="w-9 h-9 rounded-full bg-[var(--success)]/15 text-[var(--success)] flex items-center justify-center text-lg shrink-0">
                    ✓
                  </span>
                  <div>
                    <p className="text-base font-bold text-[var(--success)]">Verified</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Report hash matches the on-chain record
                    </p>
                  </div>
                </div>
                <MemoFacts memo={attestation.memo} blockTime={attestation.blockTime} />
              </div>
            )}

            {attestation.match === false && (
              <div className="bg-[var(--danger)]/5 border border-[var(--danger)]/40 rounded-2xl p-6 animate-slide-up">
                <div className="flex items-center gap-3 mb-1">
                  <span className="w-9 h-9 rounded-full bg-[var(--danger)]/15 text-[var(--danger)] flex items-center justify-center text-lg shrink-0">
                    ✕
                  </span>
                  <div>
                    <p className="text-base font-bold text-[var(--danger)]">Hash mismatch</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      The report does not match the on-chain record (possible tampering)
                    </p>
                  </div>
                </div>
                <MemoFacts memo={attestation.memo} blockTime={attestation.blockTime} />
              </div>
            )}

            {attestation.match === null && (
              <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-2xl p-6 animate-slide-up">
                <div className="flex items-center gap-3 mb-1">
                  <span className="w-9 h-9 rounded-full bg-[var(--warning)]/15 text-[var(--warning)] flex items-center justify-center text-lg shrink-0">
                    ⏳
                  </span>
                  <div>
                    <p className="text-base font-bold text-[var(--warning)]">
                      Attestation found — report unavailable
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      The on-chain record is permanent, but the shared report has expired locally
                      (24h TTL), so the hash can&apos;t be recomputed here.
                    </p>
                  </div>
                </div>
                <MemoFacts memo={attestation.memo} blockTime={attestation.blockTime} />
              </div>
            )}

            {/* Hash comparison + explorer */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-3">
                On-chain record · {attestation.network}
              </div>
              <div className="flex flex-col gap-2">
                <HashRow label="On-chain report hash" value={attestation.memo.reportHash} />
                <HashRow
                  label="Recomputed from report"
                  value={
                    attestation.episodeAvailable
                      ? attestation.recomputedHash ?? null
                      : null
                  }
                />
                {!attestation.episodeAvailable && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Recomputation requires the shared report, which is no longer cached.
                  </p>
                )}
                {attestation.mintRecord && (
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="text-[var(--text-muted)] shrink-0">Minted</span>
                    <span>
                      {new Date(attestation.mintRecord.createdAt).toLocaleString()} ·{" "}
                      <span className="font-mono" title={attestation.mintRecord.walletAddress}>
                        {truncate(attestation.mintRecord.walletAddress, 6, 6)}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              {attestation.explorerUrl && (
                <a
                  href={attestation.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] text-xs inline-block mt-4"
                >
                  View transaction on Solana Explorer →
                </a>
              )}
              {attestation.memo.episodeId && attestation.episodeAvailable && (
                <Link
                  href={`/episode/${attestation.memo.episodeId}`}
                  className="text-[var(--accent)] text-xs inline-block mt-4 ml-6"
                >
                  Open the report →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="mt-10 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <h2 className="text-sm font-semibold mb-4">How verification works</h2>
          <ol className="flex flex-col gap-3 text-xs text-[var(--text-muted)]">
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center font-bold shrink-0 text-[10px]">
                1
              </span>
              <span>
                <span className="text-[var(--text)] font-medium">Fetch the transaction</span> from
                Solana RPC by its signature — the record lives on-chain, not on our servers.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center font-bold shrink-0 text-[10px]">
                2
              </span>
              <span>
                <span className="text-[var(--text)] font-medium">Decode the SPL Memo</span> payload:
                schema, health score, author, and the SHA-256 hash of the report script.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center font-bold shrink-0 text-[10px]">
                3
              </span>
              <span>
                <span className="text-[var(--text)] font-medium">Recompute and compare</span> —
                SHA-256 of the report script is recomputed and checked against the on-chain hash.
                Any edit to the report changes the hash.
              </span>
            </li>
          </ol>
        </div>

        {/* Conversion CTA — turn verifiers into users */}
        <div className="mt-6 bg-[var(--accent)]/5 border border-[var(--accent)]/30 rounded-2xl p-6 text-center">
          <LeadCapture
            source="verify_cta"
            prompt="Want this for your protocol? Leave your email — we'll set you up with a verified health report."
            buttonText="Get my report →"
          />
        </div>
      </div>
    </main>
  );
}
