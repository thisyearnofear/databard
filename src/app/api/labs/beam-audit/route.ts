import { NextRequest } from "next/server";
import { analyzeSchema } from "@/lib/schema-analysis";
import { rateLimit, GENERATE_RATE_LIMIT } from "@/lib/rate-limit";
import {
  auditCacheKey,
  getCachedAudit,
  isBeamAuditConfigured,
  loadFixtureSchema,
  narrateWithBeam,
  parseDdlWithBeam,
  setCachedAudit,
  takeQuota,
  type BeamAuditEvent,
  type BeamAuditFormat,
  type BeamAuditRequest,
  type Usage,
} from "@/lib/beam-audit";
import type { SchemaMeta } from "@/lib/types";

export const runtime = "nodejs";

function ip(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => {})) as Partial<BeamAuditRequest> | undefined;
  const source = body?.source === "custom" || body?.source === "web3" || body?.source === "ecommerce" ? body.source : "web3";
  const format: BeamAuditFormat = body?.format === "executive-summary" ? "executive-summary" : "podcast";
  const ddl = typeof body?.ddl === "string" ? body.ddl.slice(0, 12_000) : "";
  const question = typeof body?.question === "string" ? body.question.slice(0, 240) : "";
  const request: BeamAuditRequest = { source, ddl, question, format };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: BeamAuditEvent) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(ev)}\n\n`);
        } catch {
          /* closed */
        }
      };
      const fail = (message: string) => {
        send({ type: "error", message });
        controller.close();
      };

      try {
        if (!isBeamAuditConfigured()) {
          return fail("This deployment has no REFLECTION_API_KEY — the Beam lab is offline here. The benchmark report stays live.");
        }

        const key = auditCacheKey(request);
        const cached = getCachedAudit(key);
        if (cached) {
          send({ type: "stage", stage: "parse", state: "done", note: "cached" });
          send({ type: "schema", schema: cached.schema });
          send({ type: "stage", stage: "score", state: "done", note: "cached" });
          send({ type: "insights", insights: cached.insights, schemaName: cached.schemaName, tableCount: cached.schema.tables.length });
          send({ type: "stage", stage: "narrate", state: "done", note: "cached" });
          if (cached.segments) send({ type: "segments", segments: cached.segments });
          else if (cached.shapeFailureRaw) send({ type: "shapeFailure", raw: cached.shapeFailureRaw });
          send({ type: "stats", usage: cached.usage, elapsedMs: cached.elapsedMs, cached: true, reasoningChars: cached.reasoningChars });
          controller.close();
          return;
        }

        const rl = rateLimit(ip(req), GENERATE_RATE_LIMIT);
        if (!rl.allowed) return fail("Too many requests — wait a minute and try again.");
        const q = takeQuota(ip(req));
        if (!q.ok) {
          send({ type: "quota", message: q.reason ?? "Daily allowance exhausted." });
          controller.close();
          return;
        }

        const t0 = Date.now();
        let usage: Usage | null = null;
        let reasoningChars = 0;

        // Throttled relay for streamed deltas (~7/sec keeps the UI live without event spam)
        const throttled = (type: "reasoning" | "content") => {
          let buf = "";
          let last = 0;
          return (delta: string) => {
            buf += delta;
            const now = Date.now();
            if (delta && now - last > 140) {
              send({ type, delta: buf });
              buf = "";
              last = now;
            }
          };
        };
        const relay = {
          reasoning: throttled("reasoning"),
          content: throttled("content"),
        };

        // ---- Stage 1: parse ----
        send({ type: "stage", stage: "parse", state: "start" });
        let schema: SchemaMeta;
        let schemaName: string;
        if (source === "custom") {
          if (!ddl.trim()) return fail("Paste some DDL first — or pick a featured dataset.");
          try {
            const parsed = await parseDdlWithBeam(ddl, {
              onReasoning: relay.reasoning,
              onContent: relay.content,
            }, req.signal);
            schema = parsed.schema;
            schemaName = schema.name || "your schema";
            usage = parsed.result.usage;
            reasoningChars += parsed.result.reasoningChars;
          } catch (e) {
            return fail(`Stage 1 failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
          const fx = await loadFixtureSchema(source);
          schema = fx.schema;
          schemaName = fx.label;
        }
        send({ type: "stage", stage: "parse", state: "done", note: `${schema.tables.length} tables` });
        send({ type: "schema", schema });

        // ---- Stage 2: score (deterministic) ----
        send({ type: "stage", stage: "score", state: "start" });
        const insights = analyzeSchema(schema);
        send({ type: "stage", stage: "score", state: "done", note: `${insights.healthScore}/100` });
        send({ type: "insights", insights, schemaName, tableCount: schema.tables.length });

        // ---- Stage 3: narrate ----
        send({ type: "stage", stage: "narrate", state: "start" });
        let segments = null;
        let shapeFailureRaw: string | undefined;
        for (let attempt = 1; attempt <= 2 && !segments; attempt++) {
          if (attempt === 2) send({ type: "stage", stage: "narrate", state: "start", note: "shape failure — one honest retry" });
          try {
            const narrated = await narrateWithBeam(schema, insights, format, question || undefined, {
              onReasoning: relay.reasoning,
              onContent: relay.content,
            }, req.signal);
            segments = narrated.segments;
            shapeFailureRaw = narrated.shapeFailureRaw;
            usage = narrated.result.usage ?? usage;
            reasoningChars += narrated.result.reasoningChars;
          } catch (e) {
            return fail(`Stage 3 failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        send({ type: "stage", stage: "narrate", state: "done" });
        if (segments) send({ type: "segments", segments });
        else send({ type: "shapeFailure", raw: shapeFailureRaw ?? "" });

        const elapsedMs = Date.now() - t0;
        // Only clean runs are cached — a shape failure should be retryable, not replayed forever.
        if (segments) {
          setCachedAudit(key, { schema, schemaName, insights, segments, shapeFailureRaw, usage, elapsedMs, reasoningChars });
        }
        send({ type: "stats", usage, elapsedMs, cached: false, reasoningChars });
        controller.close();
      } catch (e) {
        fail(e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
