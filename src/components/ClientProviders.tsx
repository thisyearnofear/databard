"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { workspaceFromSearch } from "@/lib/product/workspaces";

// Dynamic import: SolanaProvider pulls in @solana/web3.js, wallet adapters,
// and 400+ transitive packages. Wrapping with dynamic({ ssr: false }) keeps
// them out of the server bundle, cutting build memory significantly.
const SolanaProvider = dynamic(
  () => import("@/components/SolanaProvider").then((m) => ({ default: m.SolanaProvider })),
  { ssr: false }
);

const SOLANA_PATHS = new Set(["/onchain", "/verify", "/leaderboard", "/history"]);

function needsSolanaProvider(pathname: string, search = ""): boolean {
  // Shared episode pages still offer ownership verification. The Enterprise
  // landing, dashboard, and standard wizard do not pay for wallet hydration.
  return pathname.startsWith("/episode/") || SOLANA_PATHS.has(pathname) || workspaceFromSearch(search) === "protocols";
}

export function ClientProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Path-only modes are known during SSR. Query-selected Protocols mode is
  // promoted after hydration so landing HTML remains deterministic.
  const [solanaEnabled, setSolanaEnabled] = useState(() => needsSolanaProvider(pathname));

  useEffect(() => {
    const sync = () => setSolanaEnabled(needsSolanaProvider(pathname, window.location.search));
    sync();
    window.addEventListener("databard:workspacechange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("databard:workspacechange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [pathname]);

  return solanaEnabled ? <SolanaProvider>{children}</SolanaProvider> : <>{children}</>;
}
