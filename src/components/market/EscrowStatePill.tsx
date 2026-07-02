"use client";
import type { DealRef, WantState } from "@/lib/types";

const STATES: { key: WantState; label: string }[] = [
  { key: "open",       label: "OPEN" },
  { key: "awarded",    label: "AWARDED" },
  { key: "deposited",  label: "DEPOSITED" },
  { key: "delivered",  label: "DELIVERED" },
  { key: "released",   label: "RELEASED" },
];

export function EscrowStatePill({ deal }: { deal: DealRef | null }) {
  const currentIdx = deal ? STATES.findIndex((s) => s.key === deal.state) : -1;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
        Escrow lifecycle
      </div>
      <div className="flex items-center gap-1">
        {STATES.map((s, i) => {
          const done = currentIdx >= i;
          const isCurrent = currentIdx === i;
          return (
            <div key={s.key} className="flex-1 flex items-center gap-1">
              <div className="flex-1">
                <div
                  className={[
                    "h-1 rounded-full transition-colors",
                    done ? "bg-[var(--success)]" : "bg-[var(--border)]",
                  ].join(" ")}
                />
                <div
                  className={[
                    "mt-1 text-[10px] uppercase tracking-wider text-center transition-colors",
                    isCurrent ? "text-[var(--success)] font-semibold" : done ? "text-[var(--text)]" : "text-[var(--text-muted)]",
                  ].join(" ")}
                >
                  {s.label}
                </div>
              </div>
              {i < STATES.length - 1 && <div className={done ? "text-[var(--success)]" : "text-[var(--border)]"}>→</div>}
            </div>
          );
        })}
      </div>

      {deal && (
        <div className="mt-4 space-y-1 text-xs">
          <ExplorerLink label="deposit"  url={deal.explorer.deposit}  />
          <ExplorerLink label="commit"   url={deal.explorer.commit}   />
          <ExplorerLink label="release"  url={deal.explorer.release}  />
          {deal.manifestHash && (
            <div className="text-[var(--text-muted)]">
              <span className="uppercase tracking-wider">manifest hash: </span>
              <span className="font-mono text-[var(--text)]">
                {deal.manifestHash.slice(0, 16)}…{deal.manifestHash.slice(-8)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExplorerLink({ label, url }: { label: string; url?: string }) {
  if (!url) return null;
  return (
    <div>
      <span className="text-[var(--text-muted)] uppercase tracking-wider">{label}: </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[var(--accent)] hover:underline"
      >
        {url.split("/").pop()?.split("?")[0].slice(0, 20)}…
      </a>
    </div>
  );
}
