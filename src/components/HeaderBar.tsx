"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { homeHref, isNavItemActive, WORKSPACES, workspaceFromRoute, workspaceHref } from "@/lib/product/workspaces";
import { track } from "@/lib/track";

const WalletButton = dynamic(
  () => import("./WalletButton").then((module) => ({ default: module.WalletButton })),
  { ssr: false, loading: () => null },
);

/**
 * One product shell for every non-landing route. It deliberately exposes
 * different navigation and utilities for Teams versus Protocols, while both
 * presentations still lead to the same briefing engine.
 */
function HeaderBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspace = workspaceFromRoute(pathname, searchParams.toString());

  if (pathname === "/") return null;
  const definition = WORKSPACES[workspace];

  return (
    <header className="sticky top-3 z-50 mx-auto mt-3 w-[min(100%-2rem,68rem)]">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur px-3 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
        <Link href={homeHref(workspace)} aria-label="Back to DataBard home" className="shrink-0 text-sm font-semibold tracking-tight hover:text-[var(--accent)] transition-colors">
          DataBard <span className="ml-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">Home</span>
        </Link>
        <div className="flex shrink-0 rounded-md border border-[var(--border)] p-0.5" aria-label="Workspace">
          {(["teams", "protocols"] as const).map((target) => (
            <Link
              key={target}
              href={pathname === "/protocol" ? workspaceHref("/protocol", target) : homeHref(target)}
              onClick={() => {
                if (target !== workspace) track("persona_toggle", { from: workspace, to: target === "protocols" ? "web3" : "enterprise" });
              }}
              aria-current={target === workspace ? "page" : undefined}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                target === workspace
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {target === "teams" ? "Teams" : "Protocols"}
            </Link>
          ))}
        </div>
        <nav aria-label="Product" className="hidden sm:flex items-center gap-1">
          {definition.nav.map((item) => (
            <Link
              key={item.href}
              href={workspaceHref(item.href, workspace)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isNavItemActive(item.href, pathname)
                  ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          {workspace === "protocols" && <WalletButton />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function HeaderBar() {
  return (
    <Suspense fallback={null}>
      <HeaderBarInner />
    </Suspense>
  );
}
