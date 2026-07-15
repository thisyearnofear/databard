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
  // The landing switch is a product-mode choice, not a wallet interaction.
  // Mounting a provider around it would replace the wizard subtree mid-switch
  // and reset its local state. Wallet code belongs on actual on-chain surfaces.
  return pathname.startsWith("/episode/")
    || SOLANA_PATHS.has(pathname)
    || (pathname === "/protocol" && workspaceFromSearch(search) === "protocols");
}

export function ClientProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Path-only modes are known during SSR. The protocol dashboard is promoted
  // after hydration when its workspace is query-selected; landing mode never
  // needs a wallet provider.
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
