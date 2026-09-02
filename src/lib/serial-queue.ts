/**
 * In-process serialization for read-modify-write file updates.
 *
 * The JSON ledgers (events, pageviews, leads) append by reading the whole file,
 * pushing a record, and rewriting it. When two requests interleave those steps
 * they both read the same base array and the last writer wins with only its own
 * record — silently dropping the other. Under concurrent beacons this loses most
 * events (observed: 24 test navigations retained only the final 4 writes).
 *
 * Production runs a single PM2 fork instance (ecosystem.config.cjs instances:1),
 * so a per-key promise chain within the process is enough to make each update
 * atomic. If this ever moves to cluster mode, swap for file locking or a real DB.
 */
const queues = new Map<string, Promise<unknown>>();

/** Run `fn` after every previous update for `key` has settled. Returns fn's result. */
export function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  // Chain after prev regardless of whether it resolved or rejected, so one failure
  // can't wedge the queue; fn ignores the passed-through rejection reason.
  const run = prev.then(fn, fn);
  // Keep the stored tail always-resolved so the next caller's prev never rejects.
  queues.set(key, run.then(() => undefined, () => undefined));
  return run;
}
