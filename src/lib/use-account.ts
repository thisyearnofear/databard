"use client";

import { useState, useCallback, useEffect } from "react";

export interface AccountIdentity {
  stripeCustomerId: string | null;
  email: string | null;
  walletAddress: `0x${string}` | null;
}
export interface AccountEntitlements {
  stripe: boolean;
  onchain: boolean;
}
export interface AccountSession {
  identity: AccountIdentity;
  entitlements: AccountEntitlements;
  issuedAt: string;
}

/**
 * Reads + refreshes the unified account session via /api/account/session.
 * Shared by the header account menu and anywhere that needs to know "who am I".
 */
export function useAccount() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/account/session");
      const d = await r.json();
      setSession(d.session ?? null);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setCurrent = useCallback((s: AccountSession | null) => setSession(s), []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/account/session", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setSession(null);
  }, []);

  const signedIn = Boolean(session?.identity.email || session?.identity.walletAddress);

  return { session, loading, refresh, setCurrent, signOut, signedIn };
}
