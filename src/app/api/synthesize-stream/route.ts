import { NextRequest, NextResponse } from "next/server";
import { generateScript } from "@/lib/script-generator";
import { synthesizeSpeech, synthesizeSfx, estimateCost } from "@/lib/audio-engine";
import type { ConnectionConfig, ScriptSegment, SchemaMeta } from "@/lib/types";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { buildResearchTrail } from "@/lib/research";
import { createResearchSession } from "@/lib/research-session";
import { buildEvidenceContext, enrichResearchTrail } from "@/lib/evidence-providers";
import { analyzeSchema, diffInsights } from "@/lib/schema-analysis";
import { validateSchemaFqn, ValidationError, rateLimit, validateResearchQuestion } from "@/lib/validation";
import { getSessionConfig } from "@/lib/session";
import { getDuneTableStats } from "@/lib/dune-adapter";
import { getLatestSnapshot, saveSnapshot } from "@/lib/schema-snapshots";
import type { TableStatSummary } from "@/lib/dune-adapter";

/**
 * Build tableStats from Coral metadata so the script generator can narrate
 * actual data findings (column types, sample values, row counts).
 */
function buildCoralTableStats(meta: SchemaMeta): Record<string, TableStatSummary> | undefined {
  const table = meta.tables[0];
  if (!table || !table.rowCount) return undefined;

  const columnHighlights: TableStatSummary["columnHighlights"] = [];

  for (const col of table.columns) {
    const desc = col.description ?? "";
    const uniqueMatch = desc.match(/(\d+) unique values/);
    const samplesMatch = desc.match(/samples: (.+?)(?:;|$)/);
    const uniqueCount = uniqueMatch ? parseInt(uniqueMatch[1]) : undefined;
    const samples = samplesMatch ? samplesMatch[1].split(", ") : [];

    // Detect numeric columns from dataType
    if (col.dataType === "number" && samples.length > 0) {
      const nums = samples.map((s) => parseFloat(s)).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        columnHighlights.push({
          column: col.name,
          type: "numeric",
          min: Math.min(...nums),
          max: Math.max(...nums),
          avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        });
      }
    } else if (uniqueCount !== undefined && uniqueCount <= 20 && samples.length > 0) {
      // Categorical column with limited unique values
      columnHighlights.push({
        column: col.name,
        type: "categorical",
        topValues: samples.slice(0, 5),
      });
    }
  }

  return {
    [table.name]: {
      rowCount: table.rowCount,
      columnHighlights,
    },
  };
}

/**
 * Streaming synthesis — sends audio chunks as they're generated.
 * Flow: auth → rate limit → session config → metadata → script → audio chunks → done
 * Uses server-side session for credentials when available, falls back to request body.
 */
export async function POST(req: NextRequest) {
  try {
    // Stream synthesis must be callable from the browser after a successful
    // `/api/connect` session handshake; enforce abuse protection via rate limit.
    rateLimit(req);

    const body = await req.json();
    const { schemaFqn, source = "openmetadata", researchQuestion } = body;
    validateSchemaFqn(schemaFqn);
    const normalizedResearchQuestion = typeof researchQuestion === "string" && researchQuestion.trim()
      ? researchQuestion.trim()
      : undefined;
    if (normalizedResearchQuestion) {
      validateResearchQuestion(normalizedResearchQuestion);
    }

    // Prefer session config (credentials stored server-side), fall back to body
    const sessionConfig = await getSessionConfig();

    const signal = req.signal;
    const encoder = new TextEncoder();

    function send(controller: ReadableStreamDefaultController, data: unknown) {
      if (signal.aborted) throw new Error("Client disconnected");
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const config: ConnectionConfig = sessionConfig ?? {
            source: source as ConnectionConfig["source"],
            openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
            dbtCloud: body.dbtCloud,
            dbtLocal: body.dbtLocal,
            theGraph: body.theGraph,
            dune: body.dune,
            coral: body.coral,
          };

          // Fetch metadata and generate script
          const meta = await fetchSchemaMeta(config, schemaFqn);
          if (signal.aborted) { controller.close(); return; }

          const insights = analyzeSchema(meta);

          // Give the user a material signal before slower research and script work.
          // The audio remains a richer explanation of this same evidence.
          const primaryRisk = insights.criticalTables[0];
          const initialFindings: string[] = [];
          if (primaryRisk?.failingTests) {
            const downstream = primaryRisk.downstreamCount > 0
              ? ` affecting ${primaryRisk.downstreamCount} downstream table${primaryRisk.downstreamCount === 1 ? "" : "s"}`
              : "";
            initialFindings.push(`${primaryRisk.failingTests} failing test${primaryRisk.failingTests === 1 ? "" : "s"} on ${primaryRisk.table.name}${downstream}`);
          } else if (insights.staleTables[0]) {
            initialFindings.push(`${insights.staleTables[0].name} is stale by ${insights.staleTables[0].hoursAgo} hours`);
          } else if (insights.untestedTables.length > 0) {
            initialFindings.push(`${insights.untestedTables.length} table${insights.untestedTables.length === 1 ? " has" : "s have"} no quality tests`);
          } else if (insights.piiTables.length > 0) {
            const piiColumns = insights.piiTables.reduce((total, table) => total + table.columns.length, 0);
            initialFindings.push(`${piiColumns} PII column${piiColumns === 1 ? "" : "s"} need governance review`);
          } else {
            initialFindings.push(`Health score: ${insights.healthScore}/100`);
          }
          initialFindings.push(`${meta.tables.length} tables scanned · ${insights.totalTests} quality tests reviewed`);
          send(controller, {
            type: "initial_signal",
            healthScore: insights.healthScore,
            healthLabel: insights.healthLabel,
            findings: initialFindings,
          });

          const evidenceContext = buildEvidenceContext(config);
          const researchTrail = await enrichResearchTrail(
            buildResearchTrail(meta, insights, normalizedResearchQuestion),
            evidenceContext
          );
          const researchSession = normalizedResearchQuestion
            ? createResearchSession({
                schemaMeta: meta,
                source: config.source,
                question: normalizedResearchQuestion,
                trail: researchTrail,
                evidenceContext,
              })
            : null;
          const tableStats = source === "dune"
            ? getDuneTableStats(schemaFqn)
            : source === "coral"
              ? buildCoralTableStats(meta)
              : undefined;

          // Compute diff BEFORE generating script so executive summary can include it
          const prevSnapshot = getLatestSnapshot(schemaFqn);
          let diffIntro: ScriptSegment | null = null;
          let diffContext: { healthScoreChange: number; newFailures: string[]; resolvedFailures: string[]; summary: string } | undefined;
          if (prevSnapshot) {
            const diff = diffInsights(
              prevSnapshot.insights,
              insights,
              prevSnapshot.tableNames,
              meta.tables.map((t) => t.name),
            );
            diffContext = {
              healthScoreChange: diff.healthScoreChange,
              newFailures: diff.newFailures,
              resolvedFailures: diff.resolvedFailures,
              summary: diff.summary,
            };
            if (diff.summary !== "no changes") {
              diffIntro = {
                speaker: "Alex",
                topic: "What's changed",
                text: `Welcome back. Since our last check on ${prevSnapshot.recordedAt.slice(0, 10)}: ${diff.summary.replace(/,/g, ", and")}. ${diff.healthScoreChange < 0 ? "We'll dig into what's going on." : "Things are looking" + (diff.healthScoreChange > 0 ? " better" : " steady") + "."}`,
              };
            }
          }

          const script = await generateScript(meta, {
            researchQuestion: normalizedResearchQuestion,
            researchTrail,
            tableStats,
            source,
            format: body.outputFormat === "executive-summary" ? "executive-summary" : "podcast",
            diff: diffContext,
          });
          if (signal.aborted) { controller.close(); return; }

          // Save snapshot for next time
          saveSnapshot({
            schemaFqn,
            schemaName: meta.name,
            tableNames: meta.tables.map((t) => t.name),
            insights,
            recordedAt: new Date().toISOString(),
          });

          // Prepend diff intro if available
          const fullScript = diffIntro ? [diffIntro, ...script] : script;

          // Send metadata
          const totalTests = meta.tables.reduce((n, t) => n + t.qualityTests.length, 0);
          const failedTests = meta.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);
          const totalColumns = meta.tables.reduce((n, t) => n + t.columns.length, 0);

          send(controller, {
            type: "metadata",
            schemaFqn: meta.fqn,
            schemaName: meta.name,
            researchQuestion: normalizedResearchQuestion,
            tableCount: meta.tables.length,
            testsTotal: totalTests,
            testsFailed: failedTests,
            script: fullScript,
            schemaMeta: meta,
            researchTrail,
            researchSessionId: researchSession?.id,
          });

          // Quality gate: block empty schemas, warn on thin ones, save tokens
          const hasElevenLabsKey = !!process.env.ELEVENLABS_API_KEY;
          const isEmpty = meta.tables.length === 0;
          const isThinSchema = meta.tables.length <= 1 && totalTests === 0 && totalColumns <= 3 && meta.lineage.length === 0;

          if (isEmpty) {
            send(controller, {
              type: "schema_rejected",
              message: "This schema is empty — it has no tables. Choose a schema with data to generate a meaningful episode.",
            });
            send(controller, { type: "done" });
            controller.close();
            return;
          }

          if (isThinSchema) {
            send(controller, {
              type: "quality_warning",
              message: `This schema has minimal data (${meta.tables.length} table${meta.tables.length !== 1 ? "s" : ""}, ${totalTests} tests, ${totalColumns} columns). The generated episode may be brief.`,
            });
          }

          // Skip audio synthesis if ElevenLabs is not configured — deliver transcript only
          if (!hasElevenLabsKey) {
            send(controller, {
              type: "quality_warning",
              message: "Audio synthesis unavailable — delivering transcript only.",
            });
            send(controller, { type: "done" });
            controller.close();
            return;
          }

          // Send cost estimate before synthesizing
          const estimate = estimateCost(fullScript);
          send(controller, {
            type: "estimate",
            segments: estimate.segments,
            sfxCalls: estimate.sfxCalls,
            totalCalls: estimate.totalCalls,
          });

          // Intro jingle
          const intro = await synthesizeSfx("podcast intro jingle, upbeat tech vibes, short", 3);
          if (signal.aborted) { controller.close(); return; }
          if (intro.length > 0) send(controller, { type: "audio", data: intro.toString("base64") });

          // Synthesize segments
          for (let i = 0; i < fullScript.length; i++) {
            if (signal.aborted) { controller.close(); return; }

            const prev = i > 0 ? fullScript[i - 1].text : undefined;
            const next = i < fullScript.length - 1 ? fullScript[i + 1].text : undefined;

            if (i > 0 && fullScript[i].topic !== fullScript[i - 1].topic) {
              const transition = await synthesizeSfx("short subtle whoosh transition sound", 1);
              if (signal.aborted) { controller.close(); return; }
              if (transition.length > 0) send(controller, { type: "audio", data: transition.toString("base64") });
            }

            const audio = await synthesizeSpeech(fullScript[i], prev, next);
            if (signal.aborted) { controller.close(); return; }
            send(controller, { type: "audio", data: audio.toString("base64"), segment: i });
          }

          // Outro
          const outro = await synthesizeSfx("podcast outro jingle, mellow fade out, short", 3);
          if (signal.aborted) { controller.close(); return; }
          if (outro.length > 0) send(controller, { type: "audio", data: outro.toString("base64") });

          send(controller, { type: "done" });
          controller.close();
        } catch (e: unknown) {
          if (signal.aborted) { controller.close(); return; }
          const msg = e instanceof Error ? e.message : "Unknown error";
          try {
            send(controller, { type: "error", error: msg });
          } catch {
            // Client already gone
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.message.includes("Unauthorized") ? 401 : 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
