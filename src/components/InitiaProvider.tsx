"use client";

/**
 * InitiaProvider — lazy loads the Initia wallet stack on the client only.
 * This avoids SSR/build-time side effects from the wallet connector.
 */
import { useEffect, useMemo, useState, type ComponentType, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";

type InitiaModule = {
  InterwovenKitProvider: ComponentType<PropsWithChildren<{ defaultChainId?: string }>>;
  initiaPrivyWalletConnector: unknown;
  injectStyles?: (styles: unknown) => void;
  TESTNET?: { id: number };
  MAINNET?: { id: number };
};

const DATABARD_CHAIN_ID = process.env.NEXT_PUBLIC_INITIA_CHAIN_ID ?? "initiation-2";
const queryClient = new QueryClient();

export function InitiaProvider({ children }: PropsWithChildren) {
  const [initiaModule, setInitiaModule] = useState<InitiaModule | null>(null);

  useEffect(() => {
    let cancelled = false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@initia/interwovenkit-react") as InitiaModule;
      if (!cancelled) {
        setInitiaModule(mod);
        if (mod.injectStyles) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            mod.injectStyles(require("@initia/interwovenkit-react/styles.js"));
          } catch {
            // styles are optional
          }
        }
      }
    } catch {
      if (!cancelled) setInitiaModule(null);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const wagmiConfig = useMemo(() => {
    if (!initiaModule?.initiaPrivyWalletConnector) return null;
    const chain = initiaModule.TESTNET ?? initiaModule.MAINNET;
    if (!chain) return null;

    return createConfig({
      connectors: [initiaModule.initiaPrivyWalletConnector as never],
      chains: [chain as never],
      transports: { [chain.id]: http() },
    });
  }, [initiaModule]);

  if (!initiaModule?.InterwovenKitProvider || !wagmiConfig) {
    return <>{children}</>;
  }

  const { InterwovenKitProvider } = initiaModule;

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <InterwovenKitProvider defaultChainId={DATABARD_CHAIN_ID}>{children}</InterwovenKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
