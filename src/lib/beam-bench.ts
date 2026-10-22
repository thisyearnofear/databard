/**
 * Beam benchmark report loader — reads the harness output written by
 * scripts/beam-bench.mjs (docs/BEAM.md). The report is a frozen artifact:
 * the page renders exactly what the harness measured, nothing curated.
 */
import { promises as fs } from "fs";
import { getDataPath } from "./data-dir";

export interface BenchChecks {
  jsonValid?: boolean;
  segmentCountInRange?: boolean;
  speakersValid?: boolean;
  textSane?: boolean;
  mentionsHealthScore?: boolean;
  mentionsQuestion?: boolean;
}

export interface BenchResult {
  task: string;
  model: string;
  run: number;
  ok: boolean;
  error?: string;
  latencyMs: number;
  wallMs?: number;
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number } | null;
  finishReason?: string | null;
  checks: BenchChecks;
  stats: { segments: number; words: number; avgWords?: number };
  failMode?: string | null;
  score: number;
  outputChars?: number;
}

export interface BenchTask {
  id: string;
  fixture: string;
  format: string;
  researchQuestion: string | null;
}

export interface BenchTaskAgg {
  runs: number;
  scoreSum: number;
  ok: number;
  meanScore: number;
}

export interface BenchModelAgg {
  runs: number;
  ok: number;
  scoreSum: number;
  latencySum: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  perTask: Record<string, BenchTaskAgg>;
  passRate: number;
  meanScore: number;
  meanLatencyMs: number | null;
}

export interface BenchReport {
  generatedAt: string;
  harness: string;
  config: { runsPerTask: number; models: string[] };
  models: Record<string, { label: string; model: string; thinking: boolean }>;
  tasks: BenchTask[];
  summary: Record<string, BenchModelAgg>;
  results: BenchResult[];
}

export async function loadBeamBench(): Promise<BenchReport | null> {
  try {
    const raw = await fs.readFile(getDataPath("beam-bench.json"), "utf-8");
    return JSON.parse(raw) as BenchReport;
  } catch {
    return null;
  }
}
