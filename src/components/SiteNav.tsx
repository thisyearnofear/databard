"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/protocol", icon: "📊", label: "Dashboard" },
  { href: "/market", icon: "🛒", label: "Market" },
  { href: "/leaderboard", icon: "🏆", label: "Leaderboard" },
  { href: "/verify", icon: "⛓️", label: "Verify" },
  { href: "/history", icon: "📼", label: "History" },
];

/** Desktop: compact horizontal pill, icon + label inline, meant to sit
 * inside HeaderBar alongside the wallet button and theme toggle. */
function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Site"
      className="hidden sm:flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-1.5 h-8"
    >
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          title={l.label}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            pathname === l.href
              ? "text-[var(--accent)] font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {/* Labels collapse to icons on mid-size viewports so the header row
              never collides with the centered persona toggle. */}
          {l.icon} <span className="hidden min-[1400px]:inline">{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Mobile: a full-width native-style bottom tab bar. Icon-over-label per tab,
 * an accent background pill (not text color — emoji ignore CSS `color`, which
 * silently broke the previous active-state indicator on mobile) marks the
 * current tab, and Home is included so the bar is a complete destination set —
 * previously the only way back was a small text link, not thumb-reachable. */
function MobileTabBar({ pathname }: { pathname: string }) {
  const tabs = [{ href: "/", icon: "🏠", label: "Home" }, ...LINKS];
  return (
    <nav
      aria-label="Site"
      className="sm:hidden fixed z-50 bottom-0 left-0 right-0 flex items-stretch justify-around bg-[var(--surface)] border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]"
          >
            <span
              className={`w-11 h-7 flex items-center justify-center rounded-full text-base transition-colors ${
                active ? "bg-[var(--accent)]/15" : ""
              }`}
            >
              {t.icon}
            </span>
            <span className={`text-[10px] leading-none ${active ? "text-[var(--accent)] font-medium" : "text-[var(--text-muted)]"}`}>
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  return (
    <>
      <DesktopNav pathname={pathname} />
      <MobileTabBar pathname={pathname} />
    </>
  );
}
