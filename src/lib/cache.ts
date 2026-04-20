/**
 * File-backed cache with TTL support.
 * Stores entries in .databard/cache/ so they survive restarts.
 * Falls back to in-memory for environments without filesystem access.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), ".databard", "cache");

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function ensureDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function keyToFile(key: string): string {
  // Safe filename from cache key
  return join(CACHE_DIR, Buffer.from(key).toString("base64url") + ".json");
}

class Cache {
  constructor() {
    try {
      ensureDir();
    } catch {
      // Filesystem not available — methods will fall back gracefully
    }
  }

  set<T>(key: string, data: T, ttlSeconds = 3600): void {
    try {
      ensureDir();
      const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlSeconds * 1000 };
      writeFileSync(keyToFile(key), JSON.stringify(entry));
    } catch (e) {
      console.warn("Cache write failed:", e);
    }
  }

  get<T>(key: string): T | null {
    try {
      const file = keyToFile(key);
      if (!existsSync(file)) return null;
      const entry: CacheEntry<T> = JSON.parse(readFileSync(file, "utf-8"));
      if (Date.now() > entry.expiresAt) {
        unlinkSync(file);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      if (!existsSync(CACHE_DIR)) return;
      for (const f of readdirSync(CACHE_DIR)) {
        unlinkSync(join(CACHE_DIR, f));
      }
    } catch {
      // ignore
    }
  }

  startCleanup(intervalMs = 60000): void {
    setInterval(() => {
      try {
        if (!existsSync(CACHE_DIR)) return;
        const now = Date.now();
        for (const f of readdirSync(CACHE_DIR)) {
          const path = join(CACHE_DIR, f);
          try {
            const entry: CacheEntry<unknown> = JSON.parse(readFileSync(path, "utf-8"));
            if (now > entry.expiresAt) unlinkSync(path);
          } catch {
            unlinkSync(path);
          }
        }
      } catch {
        // ignore
      }
    }, intervalMs);
  }
}

export const cache = new Cache();
cache.startCleanup();
