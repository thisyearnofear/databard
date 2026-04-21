"use client";

/**
 * InitiaProvider — wraps InterwovenKitProvider for Initia wallet connection.
 * Loaded lazily so it doesn't affect users who don't use the Pro/wallet flow.
 */
import { ReactNode } from "react";

// Dynamic import guard: InterwovenKit may not be installed in all environments.
// The Pro page uses this provider only when the wallet feature is enabled.
let InterwovenKitProvider: React.ComponentType<{ children: ReactNode; chainId?: string }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@initia/interwovenkit-react");
  InterwovenKitProvider = mod.InterwovenKitProvider ?? mod.default?.InterwovenKitProvider ?? null;
  if (mod.injectStyles) {
    try { mod.injectStyles(require("@initia/interwovenkit-react/styles.js")); } catch { /* styles optional */ }
  }
} catch { /* package not installed — wallet features gracefully disabled */ }

/** DataBard testnet chain ID — update once appchain is deployed */
const DATABARD_CHAIN_ID = process.env.NEXT_PUBLIC_INITIA_CHAIN_ID ?? "initiation-2";

export function InitiaProvider({ children }: { children: ReactNode }) {
  if (!InterwovenKitProvider) {
    // Graceful fallback: render children without wallet context
    return <>{children}</>;
  }
  return (
    <InterwovenKitProvider chainId={DATABARD_CHAIN_ID}>
      {children}
    </InterwovenKitProvider>
  );
}
