import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { synthesizeEpisode } from "@/lib/audio-engine";
import { buildResearchTrail } from "@/lib/research";
import { appendResearchBranch, getResearchSession } from "@/lib/research-session";
import { enrichResearchTrail } from "@/lib/evidence-providers";
import { analyzeSchema } from "@/lib/schema-analysis";
import { generateScript } from "@/lib/script-generator";
import { shares } from "@/lib/store";
import { guardMutation, validateResearchQuestion, ValidationError } from "@/lib/validation";
import type { Episode } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    guardMutation(req);

    const body = await req.json();
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const parentBranchId = typeof body.parentBranchId === "string" ? body.parentBranchId.trim() : undefined;

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
    }
    validateResearchQuestion(question);

    const session = getResearchSession(sessionId);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Research session not found" }, { status: 404 });
    }

    const meta = session.schemaMeta;
    const insights = analyzeSchema(meta);
    const researchTrail = await enrichResearchTrail(buildResearchTrail(meta, insights, question), session.evidenceContext);
    const script = await generateScript(meta, { researchQuestion: question, researchTrail });
    const audioBuffers = await synthesizeEpisode(script);
    const combined = Buffer.concat(audioBuffers);
    const totalTests = meta.tables.reduce((count, table) => count + table.qualityTests.length, 0);
    const failedTests = meta.tables.reduce((count, table) => count + table.qualityTests.filter((test) => test.status === "Failed").length, 0);
    const episodeId = randomUUID();

    const episode: Episode & { audioBase64: string } = {
      schemaFqn: meta.fqn,
      schemaName: meta.name,
      researchQuestion: question,
      researchTrail,
      researchSessionId: session.id,
      tableCount: meta.tables.length,
      qualitySummary: { passed: totalTests - failedTests, failed: failedTests, total: totalTests },
      script,
      schemaMeta: meta,
      generatedAt: new Date().toISOString(),
      audioBase64: combined.toString("base64"),
    };

    shares.set(episodeId, episode, 86400 * 7);
    const sessionUpdate = appendResearchBranch({
      sessionId: session.id,
      question,
      trail: researchTrail,
      episodeId,
      parentBranchId,
    });

    return NextResponse.json({ ok: true, episode, session: sessionUpdate ?? session, sessionId: session.id, episodeId });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.message.includes("Unauthorized") ? 401 : 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
