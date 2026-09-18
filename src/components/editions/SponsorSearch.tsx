"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DitherAvatar } from "@/components/dither-kit";

interface SponsorRow {
  name: string;
  slug: string;
  listings: number;
  usdRewards: number;
  submissions: number;
}

interface SponsorSearchProps {
  sponsors: SponsorRow[];
  initialQuery?: string;
}

const PAGE = 20;

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function rowHref(row: SponsorRow): string {
  return row.name === "Superteam UK" ? "/superteam" : `/earn/${row.slug}`;
}

function queryFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

export function SponsorSearch({ sponsors, initialQuery = "" }: SponsorSearchProps) {
  const [query, setQuery] = useState(() => queryFromLocation() || initialQuery);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    const onPop = () => {
      setQuery(queryFromLocation());
      setShown(PAGE);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((next: string) => {
    setQuery(next);
    setShown(PAGE);
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("q", next); else params.delete("q");
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, []);

  const q = query.trim().toLocaleLowerCase();
  const matches = q ? sponsors.filter((s) => s.name.toLocaleLowerCase().includes(q)) : sponsors;
  const visible = matches.slice(0, shown);

  return (
    <div>
      <label htmlFor="sponsor-search" className="block text-xs font-medium text-[var(--text-muted)]">
        Organization name
      </label>
      <input
        id="sponsor-search"
        type="search"
        value={query}
        onChange={(e) => update(e.target.value)}
        placeholder="Search Superteam, Jupiter, …"
        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      <p role="status" className="mt-3 font-mono text-xs text-[var(--text-muted)]">
        {matches.length} {matches.length === 1 ? "organization" : "organizations"}
        {q ? ` matching “${query.trim()}”` : ""}
      </p>

      {matches.length === 0 ? (
        <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-sm leading-relaxed text-[var(--text-muted)]">
          <p>
            No organizations found. Try another name or{" "}
            <Link href="/superteam" className="text-[var(--accent)] hover:underline">
              explore the example report
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={() => update("")}
            className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            Clear search
          </button>
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {visible.map((row) => (
            <li key={row.name}>
              <Link
                href={rowHref(row)}
                aria-label={`Preview ${row.name} report`}
                className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 no-underline hover:border-[var(--accent)]/50 transition-colors"
              >
                <DitherAvatar name={row.name} size={26} className="rounded-md shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {row.listings} listings · {row.submissions.toLocaleString("en-US")} submissions
                  </p>
                </div>
                <span className="hidden font-mono text-sm tabular-nums shrink-0 min-[420px]:inline">
                  {fmtUsd(row.usdRewards)}
                </span>
                <span className="shrink-0 text-xs font-medium text-[var(--accent)] whitespace-nowrap">
                  Preview report →
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {matches.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-4 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
        >
          Show more organizations
        </button>
      )}
    </div>
  );
}
