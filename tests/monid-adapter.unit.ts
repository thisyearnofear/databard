/**
 * Deterministic unit tests for the Monid adapter's pure mapping layer.
 * No CLI, no network, no key — fixtures stand in for `monid run -j` output.
 * Run with: tsx tests/monid-adapter.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveMonidFqn,
  normalizeCost,
  extractRows,
  inferColumns,
  parseMonidRun,
  buildMonidSchema,
  buildRunArgs,
  monidErrorMessage,
  MonidCliError,
} from "../src/lib/monid-adapter";
import type { MonidRunResult } from "../src/lib/monid-adapter";
import type { MonidConnection } from "../src/lib/types";

const conn: MonidConnection = { provider: "apify", endpoint: "/apidojo/tweet-scraper" };

function run(over: Partial<MonidRunResult> = {}): MonidRunResult {
  return { rows: [], raw: null, ...over };
}

describe("deriveMonidFqn", () => {
  it("slugs the endpoint into a stable FQN", () => {
    assert.equal(deriveMonidFqn(conn), "monid.apify.apidojo-tweet-scraper");
  });

  it("collapses non-alphanumerics and strips edge dashes", () => {
    assert.equal(
      deriveMonidFqn({ provider: "x", endpoint: "//A__B//C//" }),
      "monid.x.a-b-c"
    );
  });

  it("falls back to 'run' when the endpoint slugs to empty", () => {
    assert.equal(deriveMonidFqn({ provider: "x", endpoint: "/" }), "monid.x.run");
    assert.equal(deriveMonidFqn({ provider: "x", endpoint: "" }), "monid.x.run");
  });
});

describe("normalizeCost", () => {
  it("reads a numeric cost at the top level", () => {
    assert.equal(normalizeCost({ cost: 0.0021 }), 0.0021);
  });

  it("parses currency- and bare-string costs", () => {
    assert.equal(normalizeCost({ cost: "$0.0021" }), 0.0021);
    assert.equal(normalizeCost({ cost: "0.5" }), 0.5);
  });

  it("finds cost under common holders and key aliases", () => {
    assert.equal(normalizeCost({ data: { cost_usd: "0.25" } }), 0.25);
    assert.equal(normalizeCost({ usage: { totalCost: 3 } }), 3);
    assert.equal(normalizeCost({ run: { price: "1.00" } }), 1);
  });

  it("reads a nested cost object", () => {
    assert.equal(normalizeCost({ cost: { usd: 0.01 } }), 0.01);
    assert.equal(normalizeCost({ cost: { amount: "2.50" } }), 2.5);
  });

  it("returns undefined when there is no usable cost", () => {
    assert.equal(normalizeCost(null), undefined);
    assert.equal(normalizeCost({}), undefined);
    assert.equal(normalizeCost("5"), undefined);
    assert.equal(normalizeCost({ cost: "abc" }), undefined);
  });
});

describe("extractRows", () => {
  it("reads a named row container", () => {
    assert.deepEqual(extractRows({ rows: [{ a: 1 }, { a: 2 }] }), [{ a: 1 }, { a: 2 }]);
    assert.deepEqual(extractRows({ data: { records: [{ x: 1 }] } }), [{ x: 1 }]);
  });

  it("reads a top-level array", () => {
    assert.deepEqual(extractRows([{ a: 1 }, { b: 2 }]), [{ a: 1 }, { b: 2 }]);
  });

  it("zips array-of-arrays against a header", () => {
    assert.deepEqual(
      extractRows({ columns: ["a", "b"], rows: [[1, 2], [3, 4]] }),
      [{ a: 1, b: 2 }, { a: 3, b: 4 }]
    );
  });

  it("finds a nested array of objects with no container key", () => {
    assert.deepEqual(
      extractRows({ payload: { list: [{ id: 1 }, { id: 2 }] } }),
      [{ id: 1 }, { id: 2 }]
    );
  });

  it("wraps a single flat scalar object as one row", () => {
    assert.deepEqual(extractRows({ price: 42, symbol: "BTC" }), [{ price: 42, symbol: "BTC" }]);
  });

  it("returns [] for non-tabular / unmappable payloads", () => {
    assert.deepEqual(extractRows(null), []);
    assert.deepEqual(extractRows("nope"), []);
    assert.deepEqual(extractRows(42), []);
    assert.deepEqual(extractRows({ rows: [] }), []);
    assert.deepEqual(extractRows({ a: { b: { c: 1 } } }), []);
  });

  it("caps the sample at 500 rows", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ i }));
    assert.equal(extractRows({ rows: many }).length, 500);
  });
});

describe("inferColumns", () => {
  it("returns [] for no rows", () => {
    assert.deepEqual(inferColumns([]), []);
  });

  it("infers scalar types and a data-aware description", () => {
    const cols = inferColumns([{ a: 1, b: "x", c: true }, { a: 2, b: "y", c: false }]);
    assert.deepEqual(cols.map((c) => c.name), ["a", "b", "c"]);
    assert.equal(cols.find((c) => c.name === "a")?.dataType, "number");
    assert.equal(cols.find((c) => c.name === "b")?.dataType, "string");
    assert.equal(cols.find((c) => c.name === "c")?.dataType, "boolean");
    assert.ok(cols.find((c) => c.name === "a")?.description?.includes("samples:"));
  });

  it("sniffs timestamps by name and ISO value", () => {
    const cols = inferColumns([{ created_at: "2026-08-01T00:00:00.000Z" }]);
    assert.equal(cols[0].dataType, "timestamp");
  });

  it("counts nulls across rows", () => {
    const cols = inferColumns([{ a: 1 }, { a: null }]);
    assert.equal(cols[0].dataType, "number");
    assert.ok(cols[0].description?.includes("1 nulls"));
  });
});

describe("parseMonidRun", () => {
  it("strips a log preamble and extracts the normalized fields", () => {
    const stdout = 'Resolving endpoint…\n{"runId":"r1","status":"COMPLETED","cost":0.01,"data":{"rows":[{"a":1}]}}';
    const parsed = parseMonidRun(stdout);
    assert.equal(parsed.runId, "r1");
    assert.equal(parsed.status, "COMPLETED");
    assert.equal(parsed.costUsd, 0.01);
    assert.deepEqual(parsed.rows, [{ a: 1 }]);
  });

  it("reads nested hints", () => {
    const parsed = parseMonidRun('{"data":{"hints":"throttled"}}');
    assert.equal(parsed.hints, "throttled");
  });

  it("throws a parse MonidCliError on non-JSON output", () => {
    assert.throws(() => parseMonidRun("command not found"), (e: unknown) => {
      assert.ok(e instanceof MonidCliError);
      assert.equal(e.kind, "parse");
      return true;
    });
  });
});

describe("buildMonidSchema", () => {
  it("maps a populated run to one cost-bearing table", () => {
    const meta = buildMonidSchema(conn, run({
      rows: [{ a: 1 }, { a: 2 }],
      costUsd: 0.0021,
      runId: "r1",
      status: "COMPLETED",
      raw: { cost: 0.0021 },
    }));
    assert.equal(meta.fqn, "monid.apify.apidojo-tweet-scraper");
    assert.equal(meta.tables.length, 1);
    const t = meta.tables[0];
    assert.equal(t.fqn, "monid.apify.apidojo-tweet-scraper.result");
    assert.equal(t.name, "apify/apidojo/tweet-scraper");
    assert.equal(t.rowCount, 2);
    assert.deepEqual(t.qualityTests.find((q) => q.name === "run_succeeded")?.status, "Success");
    assert.deepEqual(t.qualityTests.find((q) => q.name === "run_has_rows")?.status, "Success");
    assert.ok(t.description?.includes("Measured cost: $0.0021"));
    assert.ok(t.description?.includes("2 row(s)"));
    assert.deepEqual(t.tags, ["monid", "metered", "apify"]);
  });

  it("prefers a reported total row count over the sample size", () => {
    const meta = buildMonidSchema(conn, run({ rows: [{ a: 1 }], raw: { metadata: { row_count: 999 } } }));
    assert.equal(meta.tables[0].rowCount, 999);
  });

  it("derives freshness from the newest timestamp column", () => {
    const meta = buildMonidSchema(conn, run({
      rows: [{ created_at: "2026-08-01T00:00:00.000Z" }, { created_at: "2026-08-03T00:00:00.000Z" }],
      raw: {},
    }));
    assert.equal(meta.tables[0].freshness, "2026-08-03T00:00:00.000Z");
  });

  it("flags an empty run and keeps the cost receipt", () => {
    const meta = buildMonidSchema(conn, run({ rows: [], costUsd: 0.001, raw: {} }));
    const t = meta.tables[0];
    assert.equal(t.rowCount, 0);
    assert.deepEqual(t.qualityTests.find((q) => q.name === "run_has_rows")?.status, "Failed");
    assert.ok(t.description?.includes("no analyzable rows"));
    assert.ok(t.description?.includes("Measured cost: $0.001"));
  });

  it("degrades honestly on an execNote without throwing", () => {
    const meta = buildMonidSchema(conn, run({ rows: [], raw: null }), "The Monid run timed out.");
    const t = meta.tables[0];
    assert.deepEqual(t.qualityTests.find((q) => q.name === "run_succeeded")?.status, "Failed");
    assert.ok(t.description?.includes("did not complete"));
    assert.ok(t.description?.includes("The Monid run timed out."));
    assert.ok(t.description?.includes("Measured cost: unavailable."));
    assert.equal(t.columns.length, 0);
  });
});

describe("buildRunArgs", () => {
  it("emits the CLI 0.1.7 flag shapes (verified against `monid run --help`)", () => {
    assert.deepEqual(
      buildRunArgs({ provider: "apify", endpoint: "/apidojo/tweet-scraper" }),
      ["run", "-p", "apify", "-e", "/apidojo/tweet-scraper", "-j", "--wait"],
    );
  });

  it("sends the body as one -i JSON string", () => {
    const args = buildRunArgs({ provider: "p", endpoint: "e", inputs: { limit: 5 } });
    assert.deepEqual(args.slice(-2), ["-i", JSON.stringify({ limit: 5 })]);
  });

  it("sends query and path params as single JSON strings, not k=v pairs", () => {
    const args = buildRunArgs({
      provider: "p",
      endpoint: "e",
      query: { symbol: "BTC", days: "30" },
      path: { version: "v1" },
    });
    assert.ok(args.includes("--query"));
    assert.deepEqual(args[args.indexOf("--query") + 1], JSON.stringify({ symbol: "BTC", days: "30" }));
    assert.ok(args.includes("--path"));
    assert.deepEqual(args[args.indexOf("--path") + 1], JSON.stringify({ version: "v1" }));
    assert.ok(!args.some((a) => a.includes("=")), "no k=v fragments should appear");
  });

  it("omits --wait when wait is false", () => {
    const args = buildRunArgs({ provider: "p", endpoint: "e", wait: false });
    assert.ok(!args.includes("--wait"));
  });
});

describe("monidErrorMessage", () => {
  it("gives actionable setup messages", () => {
    assert.ok(monidErrorMessage("not-installed").includes("isn't installed"));
    assert.ok(monidErrorMessage("no-key").includes("No Monid API key"));
    assert.ok(monidErrorMessage("balance").includes("balance"));
  });

  it("interpolates a detail for bad-request / exec", () => {
    assert.ok(monidErrorMessage("bad-request", "provider and endpoint are required").includes("provider and endpoint are required"));
    assert.equal(monidErrorMessage("exec"), "Monid run failed.");
  });
});

describe("MonidCliError.hard", () => {
  it("is hard for setup / auth / payment / bad-request", () => {
    for (const kind of ["not-installed", "no-key", "auth", "balance", "bad-request"] as const) {
      assert.equal(new MonidCliError(kind, "m").hard, true, `${kind} should be hard`);
    }
  });

  it("is soft for transient / empty / parse failures", () => {
    for (const kind of ["timeout", "rate-limit", "exec", "empty", "parse"] as const) {
      assert.equal(new MonidCliError(kind, "m").hard, false, `${kind} should be soft`);
    }
  });

  it("carries an optional measured cost", () => {
    assert.equal(new MonidCliError("exec", "m", 0.5).costUsd, 0.5);
  });
});
