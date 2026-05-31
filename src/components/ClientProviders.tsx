"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Dynamic import: SolanaProvider pulls in @solana/web3.js, wallet adapters,
// and 400+ transitive packages. Wrapping with dynamic({ ssr: false }) keeps
// them out of the server bundle, cutting build memory significantly.
const SolanaProvider = dynamic(
  () => import("@/components/SolanaProvider").then((m) => ({ default: m.SolanaProvider })),
  { ssr: false }
);

export function ClientProviders({ children }: { children: ReactNode }) {
  return <SolanaProvider>{children}</SolanaProvider>;
}
