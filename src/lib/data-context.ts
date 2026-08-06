"use client";

import { useSyncExternalStore } from "react";

/**
 * Data-context store.
 *
 * Answers the single most confusing question in the product: "whose data am I
 * looking at right now?" — demo / sample (hosted catalog) / my connected data.
 *
 * This is a tiny client-side pub/sub so the wizard (which reads this value) and
 * the global header (which renders it) stay in sync without touching each other.
 * Persisted to localStorage so the indicator survives navigation between the
 * wizard and the dashboard (/protocol etc).
 */

export type DataContextKind = "demo" | "sample" | "connected";

export interface DataContext {
  kind: DataContextKind;
  /** Short human label shown in the chip: "Demo", "Sample data", "dbt Cloud". */
  label: string;
  /** Secondary detail line: host, account, mode. Optional. */
  detail?: string;
  /** DataBard source key, when connected. */
  source?: string;
  /** True when a canned demo episode/dashboard is being viewed. */
  demo?: boolean;
}

const KEY = "databard:context";
const EVENT = "databard:context-change";

let cached: DataContext | null | undefined;

function readFromStorage(): DataContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DataContext) : null;
  } catch {
    return null;
  }
}

export function getDataContext(): DataContext | null {
  if (cached === undefined) cached = readFromStorage();
  return cached;
}

export function setDataContext(ctx: DataContext | null): void {
  cached = ctx;
  if (typeof window === "undefined") return;
  try {
    if (ctx) localStorage.setItem(KEY, JSON.stringify(ctx));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — fine, in-session only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeDataContext(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    cached = undefined;
    cb();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** React hook: returns the current data context, re-rendering on change. */
export function useDataContext(): DataContext | null {
  return useSyncExternalStore(subscribeDataContext, getDataContext, () => null);
}
