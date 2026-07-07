"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/protocol", icon: "📊", label: "Dashboard" },
  { href: "/leaderboard", icon: "🏆", label: "Leaderboard" },
  { href: "/history", icon: "📼", label: "History" },
];

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            pathname === l.href
              ? "text-[var(--accent)] font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {l.icon}
          <span className="hidden sm:inline"> {l.label}</span>
        </Link>
      ))}
    </>
  );
}

/**
 * Slim global nav. Desktop: a plain in-flow pill meant to sit inside
 * HeaderBar alongside the wallet button and theme toggle. Mobile: a separate
 * thumb-reachable pill floating at the bottom (nav links are the one thing
 * worth a second, dedicated placement on small screens).
 */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Site"
        className="hidden sm:flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-1.5 h-8"
      >
        <NavLinks pathname={pathname} />
      </nav>
      <nav
        aria-label="Site"
        className="sm:hidden fixed z-50 flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-1.5 h-8 bottom-4 left-1/2 -translate-x-1/2 shadow-lg"
      >
        <NavLinks pathname={pathname} />
      </nav>
    </>
  );
}
