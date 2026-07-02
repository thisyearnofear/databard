/**
 * Demo fixtures — canned schemas and audio for /market/demo.
 *
 * The market flow needs a SchemaMeta to compute delta + generate a script. In "real" mode
 * we fetch it from OpenMetadata/dbt/etc.; in demo mode we load a fixture from disk so any
 * visitor can see the auction cycle end-to-end without configuring a data source.
 *
 * We also snapshot a *previous* insights fixture so the Watchdog delta calc has something
 * to diff against — otherwise the first tick trivially posts because there's no prior state.
 */
import { promises as fs } from "fs";
import path from "path";
import type { Episode, SchemaMeta } from "../types";
import { analyzeSchema, type SchemaInsights } from "../schema-analysis";
import type { SchemaSnapshot } from "../schema-snapshots";

export type DemoFixtureId = "ecommerce" | "web3";

interface Fixture {
  id: DemoFixtureId;
  label: string;
  audioFile: string;    // Under public/
  episodeFile: string;
}

const FIXTURES: Record<DemoFixtureId, Fixture> = {
  ecommerce: {
    id: "ecommerce",
    label: "Acme e-commerce warehouse",
    audioFile: "demo-episode.mp3",
    episodeFile: "sample-episode.json",
  },
  web3: {
    id: "web3",
    label: "Uniswap V3 subgraph",
    audioFile: "demo-episode-dune.mp3",
    episodeFile: "sample-episode-dune.json",
  },
};

async function readEpisode(fixture: Fixture): Promise<Episode> {
  const raw = await fs.readFile(path.join(process.cwd(), "public", fixture.episodeFile), "utf-8");
  return JSON.parse(raw) as Episode;
}

/** Get the fixture's SchemaMeta — used as the "current" state for the market. */
export async function getDemoSchema(id: DemoFixtureId): Promise<SchemaMeta> {
  const episode = await readEpisode(FIXTURES[id]);
  if (!episode.schemaMeta) throw new Error(`Fixture ${id} has no schemaMeta`);
  return episode.schemaMeta;
}

/**
 * Produce a "before" snapshot with slightly cleaner insights than the current, so the delta
 * comes out at a demo-friendly level. Specifically: fewer failing tests, no PII on `orders`.
 */
export async function getDemoPriorSnapshot(id: DemoFixtureId): Promise<SchemaSnapshot> {
  const schema = await getDemoSchema(id);

  // Clone + heal the schema slightly to simulate "before the incident"
  const before: SchemaMeta = {
    ...schema,
    tables: schema.tables.map((t) => ({
      ...t,
      qualityTests: t.qualityTests.filter((q) => q.status !== "Failed"), // no failures before
      piiColumns: [], // no PII flags before
    })),
  };
  const insights = analyzeSchema(before);

  return {
    schemaFqn: schema.fqn,
    schemaName: schema.name,
    tableNames: schema.tables.map((t) => t.name),
    insights,
    recordedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Load the canned audio (as a Buffer). Used by the mock deliver path so the market flow
 * completes without ElevenLabs credentials.
 */
export async function getDemoAudio(id: DemoFixtureId): Promise<Buffer> {
  const p = path.join(process.cwd(), "public", FIXTURES[id].audioFile);
  return fs.readFile(p);
}

/** Load the canned episode metadata (script, research trail, etc.). */
export async function getDemoEpisode(id: DemoFixtureId): Promise<Episode> {
  return readEpisode(FIXTURES[id]);
}

export function getFixture(id: DemoFixtureId): Fixture {
  return FIXTURES[id];
}

export function listFixtures(): { id: DemoFixtureId; label: string }[] {
  return Object.values(FIXTURES).map((f) => ({ id: f.id, label: f.label }));
}

/** Cached insights getter — reused so autonomous UI polling is cheap. */
let insightsCache: Partial<Record<DemoFixtureId, SchemaInsights>> = {};
export async function getDemoInsights(id: DemoFixtureId): Promise<SchemaInsights> {
  if (insightsCache[id]) return insightsCache[id]!;
  const schema = await getDemoSchema(id);
  const insights = analyzeSchema(schema);
  insightsCache[id] = insights;
  return insights;
}
