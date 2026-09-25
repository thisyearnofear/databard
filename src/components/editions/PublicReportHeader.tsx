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

  const items = [
    { href: "/earn", label: "Reports", active: pathname === "/earn" || pathname.startsWith("/earn/"), extra: "" },
    { href: "/agents", label: "Agent services", active: pathname === "/agents" || pathname.startsWith("/probe"), extra: "" },
    { href: "/superteam", label: "Example", active: pathname.startsWith("/superteam"), extra: "" },
    { href: "/#divisions", label: "Your own data", active: false, extra: "hidden md:inline-flex" },
  ];

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
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`${linkClass(item.active)}${item.extra ? ` ${item.extra}` : ""}`}
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
