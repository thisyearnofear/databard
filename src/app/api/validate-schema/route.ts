import { NextRequest, NextResponse } from "next/server";
import type { ConnectionConfig } from "@/lib/types";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { validateSchemaFqn, ValidationError, rateLimit } from "@/lib/validation";
import { getSessionConfig } from "@/lib/session";

/**
 * Lightweight schema pre-check — fetches metadata and returns richness
 * indicators so the client can warn users before committing to a full
 * (token-expensive) episode generation.
 */
export async function POST(req: NextRequest) {
  try {
    rateLimit(req);

    const body = await req.json();
    const { schemaFqn, source = "openmetadata" } = body;
    validateSchemaFqn(schemaFqn);

    const sessionConfig = await getSessionConfig();
    const config: ConnectionConfig = sessionConfig ?? {
      source: source as ConnectionConfig["source"],
      openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
      dbtCloud: body.dbtCloud,
      dbtLocal: body.dbtLocal,
      theGraph: body.theGraph,
      dune: body.dune,
    };

    const meta = await fetchSchemaMeta(config, schemaFqn);

    const tableCount = meta.tables.length;
    const totalTests = meta.tables.reduce((n, t) => n + t.qualityTests.length, 0);
    const totalColumns = meta.tables.reduce((n, t) => n + t.columns.length, 0);
    const lineageEdges = meta.lineage.length;
    const hasOwners = meta.tables.some((t) => !!t.owner);
    const hasDescriptions = meta.tables.some((t) => !!t.description);

    const isEmpty = tableCount === 0;
    const isThin = tableCount <= 1 && totalTests === 0 && totalColumns <= 3 && lineageEdges === 0;

    let quality: "empty" | "thin" | "ok" = "ok";
    let message: string | undefined;

    if (isEmpty) {
      quality = "empty";
      message = "This schema is empty — no tables found. Choose a different schema.";
    } else if (isThin) {
      quality = "thin";
      message = `Minimal data (${tableCount} table, ${totalColumns} columns, 0 tests). The episode will be brief.`;
    }

    return NextResponse.json({
      ok: true,
      quality,
      message,
      stats: { tableCount, totalTests, totalColumns, lineageEdges, hasOwners, hasDescriptions },
    });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
