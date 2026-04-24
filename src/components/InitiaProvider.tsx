"use client";

/**
 * InitiaProvider — lazy loads the Initia wallet stack on the client only.
 * This avoids SSR/build-time side effects from the wallet connector.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { mainnet } from "wagmi/chains";

type InitiaModule = {
  InterwovenKitProvider: ComponentType<PropsWithChildren<{ defaultChainId?: string }>>;
  initiaPrivyWalletConnector: unknown;
  injectStyles?: (styles: unknown) => void;
  TESTNET?: { id: number };
  MAINNET?: { id: number };
};

const DATABARD_CHAIN_ID = process.env.NEXT_PUBLIC_INITIA_CHAIN_ID ?? "initiation-2";
const queryClient = new QueryClient();

function logWalletProvider(event: string, details?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[wallet-provider]", {
    event,
    ...(details ?? {}),
    ts: new Date().toISOString(),
  });
}

const InitiaWalletReadyContext = createContext(false);

export function useInitiaWalletReady(): boolean {
  return useContext(InitiaWalletReadyContext);
}

export function InitiaProvider({ children }: PropsWithChildren) {
  const [initiaModule, setInitiaModule] = useState<InitiaModule | null>(null);
  const missingConnectorLogged = useRef(false);

  useEffect(() => {
    let cancelled = false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@initia/interwovenkit-react") as InitiaModule;
      if (!cancelled) {
        setInitiaModule(mod);
        logWalletProvider("module_loaded", {
          hasConnector: Boolean(mod.initiaPrivyWalletConnector),
          hasProvider: Boolean(mod.InterwovenKitProvider),
        });
        if (mod.injectStyles) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            mod.injectStyles(require("@initia/interwovenkit-react/styles.js"));
            logWalletProvider("styles_injected");
          } catch {
            // styles are optional
            logWalletProvider("styles_injection_failed");
          }
        }
      }
    } catch (error) {
      if (!cancelled) setInitiaModule(null);
      logWalletProvider("module_load_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const wagmiConfig = useMemo(() => {
    if (!initiaModule?.initiaPrivyWalletConnector) {
      if (!missingConnectorLogged.current) {
        logWalletProvider("missing_connector");
        missingConnectorLogged.current = true;
      }
      return null;
    }

    missingConnectorLogged.current = false;

    return createConfig({
      connectors: [initiaModule.initiaPrivyWalletConnector as never],
      chains: [mainnet],
      transports: { [mainnet.id]: http() },
    });
  }, [initiaModule]);

  const InterwovenKitProvider = initiaModule?.InterwovenKitProvider;
  const walletReady = Boolean(InterwovenKitProvider && wagmiConfig);

  useEffect(() => {
    if (!walletReady) return;
    logWalletProvider("provider_ready", { defaultChainId: DATABARD_CHAIN_ID });
  }, [walletReady]);

  return (
    <InitiaWalletReadyContext.Provider value={walletReady}>
      {walletReady && InterwovenKitProvider && wagmiConfig ? (
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <InterwovenKitProvider defaultChainId={DATABARD_CHAIN_ID}>{children}</InterwovenKitProvider>
          </WagmiProvider>
        </QueryClientProvider>
      ) : (
        children
      )}
    </InitiaWalletReadyContext.Provider>
  );
}
