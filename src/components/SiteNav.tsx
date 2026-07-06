"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/protocol", icon: "📊", label: "Dashboard" },
  { href: "/leaderboard", icon: "🏆", label: "Leaderboard" },
  { href: "/history", icon: "📼", label: "History" },
];

/** Slim global nav pill — sits beside the theme toggle on every page. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Site"
      className="fixed z-50 flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-1.5 h-8 bottom-4 left-1/2 -translate-x-1/2 shadow-lg sm:bottom-auto sm:left-auto sm:translate-x-0 sm:shadow-none sm:top-4 sm:right-14"
    >
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
    </nav>
  );
}
