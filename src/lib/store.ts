/**
 * Unified store — namespaced, typed, file-backed persistence.
 * Replaces the raw Cache class with session-aware semantics.
 * Single source of truth for all server-side state.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";

const STORE_DIR = join(process.cwd(), ".databard", "cache");

interface StoreEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

class Store {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.ensureDir();
    this.startCleanup();
  }

  private ensureDir() {
    try {
      if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
    } catch { /* filesystem not available */ }
  }

  private keyToFile(key: string): string {
    return join(STORE_DIR, Buffer.from(key).toString("base64url") + ".json");
  }

  set<T>(key: string, data: T, ttlSeconds = 3600): void {
    try {
      this.ensureDir();
      const entry: StoreEntry<T> = {
        data,
        expiresAt: Date.now() + ttlSeconds * 1000,
        createdAt: Date.now(),
      };
      writeFileSync(this.keyToFile(key), JSON.stringify(entry));
    } catch (e) {
      console.warn("[Store] Write failed:", e);
    }
  }

  get<T>(key: string): T | null {
    try {
      const file = this.keyToFile(key);
      if (!existsSync(file)) return null;
      const entry: StoreEntry<T> = JSON.parse(readFileSync(file, "utf-8"));
      if (Date.now() > entry.expiresAt) {
        unlinkSync(file);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  /** Get entry with metadata (createdAt, expiresAt) */
  getMeta<T>(key: string): { data: T; createdAt: number; expiresAt: number } | null {
    try {
      const file = this.keyToFile(key);
      if (!existsSync(file)) return null;
      const entry: StoreEntry<T> = JSON.parse(readFileSync(file, "utf-8"));
      if (Date.now() > entry.expiresAt) {
        unlinkSync(file);
        return null;
      }
      return { data: entry.data, createdAt: entry.createdAt, expiresAt: entry.expiresAt };
    } catch {
      return null;
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    try {
      const file = this.keyToFile(key);
      if (existsSync(file)) unlinkSync(file);
    } catch { /* ignore */ }
  }

  /** List all keys matching a prefix */
  keys(prefix: string): string[] {
    try {
      if (!existsSync(STORE_DIR)) return [];
      const results: string[] = [];
      for (const f of readdirSync(STORE_DIR)) {
        try {
          const key = Buffer.from(f.replace(".json", ""), "base64url").toString();
          if (key.startsWith(prefix)) {
            const entry: StoreEntry<unknown> = JSON.parse(readFileSync(join(STORE_DIR, f), "utf-8"));
            if (Date.now() <= entry.expiresAt) results.push(key);
          }
        } catch { /* skip corrupt */ }
      }
      return results;
    } catch {
      return [];
    }
  }

  clear(): void {
    try {
      if (!existsSync(STORE_DIR)) return;
      for (const f of readdirSync(STORE_DIR)) unlinkSync(join(STORE_DIR, f));
    } catch { /* ignore */ }
  }

  private startCleanup(intervalMs = 60000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      try {
        if (!existsSync(STORE_DIR)) return;
        const now = Date.now();
        for (const f of readdirSync(STORE_DIR)) {
          const path = join(STORE_DIR, f);
          try {
            const entry: StoreEntry<unknown> = JSON.parse(readFileSync(path, "utf-8"));
            if (now > entry.expiresAt) unlinkSync(path);
          } catch { try { unlinkSync(path); } catch { /* ignore */ } }
        }
      } catch { /* ignore */ }
    }, intervalMs);
  }
}

/** Singleton store instance */
export const store = new Store();

// ── Namespaced accessors (single source of truth for key patterns) ──

export const sessions = {
  set: (id: string, data: unknown, ttl = 3600) => store.set(`session:${id}`, data, ttl),
  get: <T>(id: string) => store.get<T>(`session:${id}`),
  delete: (id: string) => store.delete(`session:${id}`),
};

export const shares = {
  set: (id: string, data: unknown, ttl = 86400) => store.set(`share:${id}`, data, ttl),
  get: <T>(id: string) => store.get<T>(`share:${id}`),
  getMeta: <T>(id: string) => store.getMeta<T>(`share:${id}`),
  keys: () => store.keys("share:"),
};

export const audioCache = {
  set: (key: string, data: string, ttl = 86400) => store.set(`audio:${key}`, data, ttl),
  get: (key: string) => store.get<string>(`audio:${key}`),
};

export const metaCache = {
  set: (key: string, data: unknown, ttl = 600) => store.set(`meta:${key}`, data, ttl),
  get: <T>(key: string) => store.get<T>(`meta:${key}`),
};

export const scriptCache = {
  set: (key: string, data: unknown, ttl = 3600) => store.set(`script:${key}`, data, ttl),
  get: <T>(key: string) => store.get<T>(`script:${key}`),
};

export const feedStore = {
  append: (entry: { id: string; schemaName: string; generatedAt: string; tableCount: number; testsFailed: number; testsTotal: number }) => {
    const list = store.get<typeof entry[]>("feed:episodes") ?? [];
    list.push(entry);
    // Keep last 100 episodes
    const trimmed = list.slice(-100);
    store.set("feed:episodes", trimmed, 86400 * 365);
  },
  list: () => store.get<{ id: string; schemaName: string; generatedAt: string; tableCount: number; testsFailed: number; testsTotal: number }[]>("feed:episodes") ?? [],
};
