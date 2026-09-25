"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DitherAvatar } from "@/components/dither-kit";

export function PublicReportHeader() {
  const pathname = usePathname();
  const linkClass = (active: boolean) =>
    `inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:px-3 ${
      active ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
    }`;

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 sm:px-5">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          aria-label="DataBard home"
        >
          <DitherAvatar name="DataBard" size={22} animate={false} />
          <span className="font-display text-sm font-bold tracking-tight text-[var(--text)]">
            DataBard
          </span>
        </Link>
        <nav aria-label="Reports navigation" className="flex items-center gap-1">
          <Link href="/earn" aria-current={pathname === "/earn" || pathname.startsWith("/earn/") ? "page" : undefined} className={linkClass(pathname === "/earn" || pathname.startsWith("/earn/"))}>
            Reports
          </Link>
          <Link href="/agents" aria-current={pathname === "/agents" || pathname === "/probe" ? "page" : undefined} className={linkClass(pathname === "/agents" || pathname === "/probe")}>
            Agent services
          </Link>
          <Link href="/superteam" aria-current={pathname === "/superteam" ? "page" : undefined} className={`hidden min-h-11 items-center whitespace-nowrap rounded-md px-3 text-xs font-medium sm:inline-flex ${pathname === "/superteam" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
            Example
          </Link>
          <Link href="/#divisions" className="hidden min-h-11 items-center whitespace-nowrap rounded-md px-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:px-3 md:inline-flex">
            Your own data
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
