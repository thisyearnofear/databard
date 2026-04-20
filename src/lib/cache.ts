/**
 * Simple in-memory cache with TTL support.
 * For production, replace with Redis or similar.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlSeconds = 3600): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  clear(): void {
    this.store.clear();
  }

  // Cleanup expired entries periodically
  startCleanup(intervalMs = 60000): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
        }
      }
    }, intervalMs);
  }
}

export const cache = new Cache();
cache.startCleanup();
