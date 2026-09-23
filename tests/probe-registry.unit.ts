import {
  diffForChain,
  chunkBatches,
  indexHashOf,
  STATUS_TO_CODE,
  type RegistryRow,
} from "../src/lib/probe-registry";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const row = (serviceId: string, score: number, status: RegistryRow["status"], ours = false): RegistryRow => ({
  serviceId,
  score,
  status,
  ours,
});

// First run: all non-ours rows, ours excluded
{
  const rows = [row("1", 90, "healthy"), row("2", 30, "broken"), row("3", 100, "healthy", true)];
  const changed = diffForChain(rows, null);
  assert(changed.length === 2 && !changed.some((r) => r.ours), "first run: all non-ours");
}

// No changes → nothing published
{
  const rows = [row("1", 90, "healthy"), row("2", 30, "broken")];
  const prev = [
    { serviceId: "1", score: 90, status: "healthy" },
    { serviceId: "2", score: 30, status: "broken" },
  ];
  assert(diffForChain(rows, prev).length === 0, "unchanged → empty diff");
}

// Score change and status change both detected; ours skipped even when new
{
  const rows = [row("1", 91, "healthy"), row("2", 55, "degraded"), row("9", 50, "degraded", true)];
  const prev = [
    { serviceId: "1", score: 90, status: "healthy" },
    { serviceId: "2", score: 30, status: "broken" },
  ];
  const changed = diffForChain(rows, prev);
  assert(changed.length === 2 && changed[0].serviceId === "1" && changed[1].serviceId === "2", "changed rows only");
}

// New service id (not in prev) is published
{
  const changed = diffForChain([row("7", 80, "healthy")], []);
  assert(changed.length === 1, "new service published");
}

// Chunking: ≤60 per batch, fields aligned
{
  const rows = Array.from({ length: 130 }, (_, i) => row(String(1000 + i), 80, "healthy"));
  const batches = chunkBatches(rows);
  assert(batches.length === 3, `130 rows → 3 batches (got ${batches.length})`);
  assert(batches[0].serviceIds.length === 60 && batches[1].serviceIds.length === 60 && batches[2].serviceIds.length === 10, "batch sizes 60/60/10");
  assert(batches[0].serviceIds[0] === BigInt(1000) && batches[2].serviceIds[9] === BigInt(1129), "serviceIds as bigint in order");
  assert(batches[0].statuses.every((s) => s === STATUS_TO_CODE.healthy), "status codes mapped");
}

// Status mapping covers every verdict
{
  const rows = [
    row("1", 90, "healthy"),
    row("2", 60, "degraded"),
    row("3", 40, "broken"),
    row("4", 0, "unreachable"),
  ];
  const [b] = chunkBatches(rows);
  assert(JSON.stringify(b.statuses) === "[1,2,3,4]", `status order (got ${b.statuses})`);
  assert(b.scores.every((s) => Number.isInteger(s) && s >= 0 && s <= 100), "scores are uint8-range ints");
}

// indexHash is deterministic + 32-byte hex
{
  const h = indexHashOf({ a: 1 });
  assert(/^0x[0-9a-f]{64}$/.test(h), "indexHash is bytes32 hex");
  assert(indexHashOf({ a: 1 }) === h, "indexHash deterministic");
  assert(indexHashOf({ a: 2 }) !== h, "indexHash differs on input");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
