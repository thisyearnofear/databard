"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore, type ReactNode } from "react";
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
const LOCATION_CHANGE_EVENT = "databard:location-change";

let historyEventsPatched = false;

function patchHistoryEvents() {
  if (historyEventsPatched || typeof window === "undefined") return;
  historyEventsPatched = true;

  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
      return result;
    };
  }
}

function subscribeToSearchChanges(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  patchHistoryEvents();
  window.addEventListener("popstate", callback);
  window.addEventListener(LOCATION_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(LOCATION_CHANGE_EVENT, callback);
  };
}

function currentSearch() {
  return typeof window === "undefined" ? "" : window.location.search.slice(1);
}

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
  const search = useSyncExternalStore(subscribeToSearchChanges, currentSearch, () => "");
  // Keep the provider decision synchronous with navigation. A state/effect
  // handoff briefly rendered episode pages without WalletProvider after a push.
  const solanaEnabled = needsSolanaProvider(pathname, search);

  return solanaEnabled ? <SolanaProvider>{children}</SolanaProvider> : <>{children}</>;
}
