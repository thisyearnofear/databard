"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { isNavItemActive, WORKSPACES, workspaceFromPathname, workspaceFromSearch, type Workspace } from "@/lib/product/workspaces";

const WalletButton = dynamic(
  () => import("./WalletButton").then((module) => ({ default: module.WalletButton })),
  { ssr: false, loading: () => null },
);

/**
 * One product shell for every non-landing route. It deliberately exposes
 * different navigation and utilities for Teams versus Protocols, while both
 * presentations still lead to the same briefing engine.
 */
export function HeaderBar() {
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<Workspace>(() => workspaceFromPathname(pathname));

  useEffect(() => {
    setWorkspace(workspaceFromSearch(window.location.search));
  }, [pathname]);

  if (pathname === "/") return null;
  const definition = WORKSPACES[workspace];

  return (
    <header className="sticky top-3 z-50 mx-auto mt-3 w-[min(100%-2rem,68rem)]">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur px-3 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
        <Link href={`/?workspace=${workspace}`} className="shrink-0 text-sm font-semibold tracking-tight hover:text-[var(--accent)] transition-colors">
          DataBard <span className="ml-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">{definition.shortLabel}</span>
        </Link>
        <nav aria-label="Product" className="hidden sm:flex items-center gap-1">
          {definition.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
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
