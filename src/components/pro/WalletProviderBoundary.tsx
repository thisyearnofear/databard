"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface WalletProviderBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface WalletProviderBoundaryState {
  hasError: boolean;
}

function logWalletBoundary(event: string, details?: Record<string, unknown>) {
  console.error("[wallet-boundary]", {
    event,
    ...(details ?? {}),
    ts: new Date().toISOString(),
  });
}

export class WalletProviderBoundary extends Component<WalletProviderBoundaryProps, WalletProviderBoundaryState> {
  state: WalletProviderBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WalletProviderBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logWalletBoundary("wallet_provider_crash", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
