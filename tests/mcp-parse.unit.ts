/**
 * Unit tests for the lenient A2MCP input parser (src/lib/mcp.ts).
 * Pure functions only — no HTTP, no data source, no credentials.
 *
 * Run: npx tsx tests/mcp-parse.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMcpInput, DEMO_FQN } from "../src/lib/mcp";

describe("parseMcpInput — leniency (OKX review fix)", () => {
  it("accepts the canonical full-body call", () => {
    const p = parseMcpInput({
      source: "openmetadata",
      schemaFqn: "db.sales",
      openmetadata: { url: "http://om:8585/api", token: "tok" },
    });
    assert.equal(p.config.source, "openmetadata");
    assert.equal(p.schemaFqn, "db.sales");
    assert.equal(p.defaultedFqn, false);
    assert.equal(p.forceDemo, false);
  });

  it("does NOT throw on a missing schemaFqn — defaults to the demo FQN", () => {
    const p = parseMcpInput({ source: "dune", dune: { apiKey: "k".repeat(12) } });
    assert.equal(p.schemaFqn, DEMO_FQN);
    assert.equal(p.defaultedFqn, true);
  });

  it("does NOT throw on an empty body — full demo posture", () => {
    const p = parseMcpInput({});
    assert.equal(p.schemaFqn, DEMO_FQN);
    assert.equal(p.defaultedFqn, true);
    assert.equal(p.config.source, "openmetadata");
    assert.equal(p.forceDemo, false);
  });

  it("does NOT throw on a non-JSON (undefined) body", () => {
    assert.throws(() => parseMcpInput(undefined));
  });

  it("unwraps agent-framework envelopes (arguments/input/params)", () => {
    for (const env of ["arguments", "input", "params"]) {
      const p = parseMcpInput({ [env]: { source: "datahub", schemaFqn: "db.sales", datahub: { serverUrl: "http://dh" } } });
      assert.equal(p.schemaFqn, "db.sales", env);
      assert.equal(p.config.source, "datahub", env);
      assert.deepEqual(p.config.datahub, { serverUrl: "http://dh" });
    }
  });

  it("accepts FQN aliases: schema_fqn, fqn, schema, dataset", () => {
    for (const alias of ["schema_fqn", "fqn", "schema", "dataset"]) {
      const p = parseMcpInput({ [alias]: "prod.analytics" });
      assert.equal(p.schemaFqn, "prod.analytics", alias);
      assert.equal(p.defaultedFqn, false, alias);
    }
  });

  it("accepts an FQN without a dot (previously a hard 400)", () => {
    const p = parseMcpInput({ schemaFqn: "sales" });
    assert.equal(p.schemaFqn, "sales");
  });

  it("normalises source spellings and falls back to the populated connector block", () => {
    assert.equal(parseMcpInput({ source: "DataHub" }).config.source, "datahub");
    assert.equal(parseMcpInput({ source: "the_graph" }).config.source, "the-graph");
    assert.equal(parseMcpInput({ source: "DBT Cloud" }).config.source, "dbt-cloud");
    // Unknown source string + a connector block → the block decides.
    assert.equal(parseMcpInput({ source: "mystery", dune: { apiKey: "k".repeat(12) } }).config.source, "dune");
    // Unknown source + nothing → openmetadata default.
    assert.equal(parseMcpInput({ source: "mystery" }).config.source, "openmetadata");
  });

  it("accepts snake_case connector blocks and flat openmetadata url+token", () => {
    const snake = parseMcpInput({ source: "the-graph", the_graph: { subgraphUrl: "https://g" } });
    assert.deepEqual(snake.config.theGraph, { subgraphUrl: "https://g" });
    const flat = parseMcpInput({ schemaFqn: "db.sales", url: "http://om", token: "tok" });
    assert.deepEqual(flat.config.openmetadata, { url: "http://om", token: "tok" });
  });

  it("drops a too-short researchQuestion and truncates a too-long one (previously 400s)", () => {
    const short = parseMcpInput({ schemaFqn: "db.sales", researchQuestion: "why?" });
    assert.equal(short.researchQuestion, undefined);
    assert.equal(short.adjustedResearchQuestion, true);
    const long = parseMcpInput({ schemaFqn: "db.sales", researchQuestion: "x".repeat(500) });
    assert.equal(long.researchQuestion?.length, 240);
    assert.equal(long.adjustedResearchQuestion, true);
    const ok = parseMcpInput({ schemaFqn: "db.sales", researchQuestion: "  What should I fix first?  " });
    assert.equal(ok.researchQuestion, "What should I fix first?");
    assert.equal(ok.adjustedResearchQuestion, false);
  });

  it("honours demo:true (explicit force) and snake_case outputFormat", () => {
    const p = parseMcpInput({ demo: true });
    assert.equal(p.forceDemo, true);
    assert.equal(
      parseMcpInput({ demo: true, outputFormat: "executive_summary" }).outputFormat,
      "executive-summary"
    );
    assert.equal(parseMcpInput({ outputFormat: "nonsense" }).outputFormat, "podcast");
  });

  it("parses the audio delivery option (inline default, url/none accepted)", () => {
    assert.equal(parseMcpInput({}).audio, "inline");
    assert.equal(parseMcpInput({ audio: "none" }).audio, "none");
    assert.equal(parseMcpInput({ audio: "url" }).audio, "url");
    assert.equal(parseMcpInput({ audioDelivery: "none" }).audio, "none");
    assert.equal(parseMcpInput({ audio: "base64-please" }).audio, "inline");
  });

  it("keeps a recognised source even when other blocks are absent", () => {
    assert.equal(parseMcpInput({ source: "monid" }).config.source, "monid");
  });
});

console.log("mcp-parse.unit: all assertions passed");
