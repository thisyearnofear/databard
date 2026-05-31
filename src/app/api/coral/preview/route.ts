import { NextRequest, NextResponse } from "next/server";
import { runCoralQuery } from "@/lib/coral-adapter";
import { extractSources, trackCoralUsage } from "@/lib/coral-graduation";

const MAX_QUERY_LEN = 8_000;
const PREVIEW_ROW_LIMIT = 25;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ ok: false, error: "Query required" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LEN) {
    return NextResponse.json(
      { ok: false, error: `Query too long (${query.length} chars, max ${MAX_QUERY_LEN})` },
      { status: 400 }
    );
  }

  try {
    const results = await runCoralQuery(query);

    // Fire-and-forget usage tracking — feeds the graduation pipeline
    trackCoralUsage(query).catch(() => {});

    const sources = extractSources(query);

    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({
        ok: true,
        columns: [],
        rows: [],
        rowCount: 0,
        sources,
        message: "Query returned no results",
      });
    }

    const sample = results.slice(0, PREVIEW_ROW_LIMIT);
    const columns = Object.keys(sample[0]).map((col) => {
      const values = results.map((r) => r[col]).filter((v) => v != null);
      const types = new Set(values.map((v) => typeof v));
      let dataType = "string";
      if (types.size === 1) {
        if (types.has("number")) dataType = "number";
        else if (types.has("boolean")) dataType = "boolean";
      } else if (types.size === 2 && types.has("number") && types.has("string")) {
        dataType = "number";
      }
      return {
        name: col,
        dataType,
        nullCount: results.length - values.length,
        sampleValues: values.slice(0, 3),
      };
    });

    return NextResponse.json({
      ok: true,
      columns,
      rows: sample,
      rowCount: results.length,
      sources,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: `Coral query failed: ${msg}` },
      { status: 500 }
    );
  }
}
