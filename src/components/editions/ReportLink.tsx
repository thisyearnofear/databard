"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { track } from "@/lib/track";

export function ReportLink({
  href,
  cta,
  className,
  children,
}: {
  href: string;
  cta: "reports" | "example" | "own_data" | "agent_tools" | "service_check";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => track("landing_cta_click", { cta, surface: "report_landing" })}
    >
      {children}
    </Link>
  );
}
