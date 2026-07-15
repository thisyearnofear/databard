"use client";
import { useState } from "react";

/**
 * BadgePanel — shows the live SVG badge for a schema + copy-paste embed code.
 *
 * Every embedded badge is a permanent backlink to DataBard. This panel lets a
 * user grab the embed code from the dashboard, turning their health score into
 * a distribution surface (README, docs site, protocol landing page).
 */
export function BadgePanel({ schemaName }: { schemaName: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"md" | "html" | null>(null);

  const badgeUrl = `https://databard.persidian.com/api/badge/${encodeURIComponent(schemaName)}`;
  const mdCode = `![Data Health](${badgeUrl})`;
  const htmlCode = `<img src="${badgeUrl}" alt="DataBard health score for ${schemaName}" />`;

  const copy = (text: string, kind: "md" | "html") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="border-t border-[var(--border)] mt-4 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-[var(--text-muted)] cursor-pointer flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        📛 Embeddable badge
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {/* Live badge preview */}
          <div className="flex items-center gap-3">
            <img
              src={badgeUrl}
              alt={`Health badge for ${schemaName}`}
              className="h-5"
            />
            <span className="text-xs text-[var(--text-muted)]">
              Live — updates every 5 min
            </span>
          </div>
          {/* Markdown embed */}
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Markdown (README, docs)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 truncate text-[var(--text-muted)]">
                {mdCode}
              </code>
              <button
                onClick={() => copy(mdCode, "md")}
                className="text-xs px-2 py-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--accent)]/10 transition-colors shrink-0"
              >
                {copied === "md" ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
          {/* HTML embed */}
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
              HTML (website, blog)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 truncate text-[var(--text-muted)]">
                {htmlCode}
              </code>
              <button
                onClick={() => copy(htmlCode, "html")}
                className="text-xs px-2 py-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--accent)]/10 transition-colors shrink-0"
              >
                {copied === "html" ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
