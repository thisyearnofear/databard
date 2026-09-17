#!/usr/bin/env node
/**
 * Refresh the committed Superteam Earn snapshot (offline fallback for
 * /superteam when the live listings API is unreachable).
 *
 * Usage: node scripts/snapshot-earn.mjs
 * Writes: src/lib/superteam-earn.snapshot.json (trimmed fields only)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const URL = "https://superteam.fun/api/listings?take=2000&status=all";
const OUT = path.join(process.cwd(), "src/lib/superteam-earn.snapshot.json");

const res = await fetch(URL, { headers: { accept: "application/json" } });
if (!res.ok) throw new Error(`Earn API ${res.status}`);
const data = await res.json();
if (!Array.isArray(data)) throw new Error("non-array body");

const listings = data.map((l) => ({
  id: l.id,
  title: l.title,
  slug: l.slug,
  rewardAmount: l.rewardAmount ?? null,
  token: l.token ?? null,
  deadline: l.deadline ?? null,
  type: l.type,
  status: l.status,
  isFeatured: !!l.isFeatured,
  agentAccess: l.agentAccess ?? null,
  _count: { Submission: l._count?.Submission ?? 0 },
  sponsor: { name: l.sponsor?.name ?? "Unknown" },
}));

await writeFile(
  OUT,
  JSON.stringify({ snapshotAsOf: new Date().toISOString(), listings }),
  "utf-8",
);
console.log(`wrote ${listings.length} listings -> ${OUT}`);
