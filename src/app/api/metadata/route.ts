import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/openmetadata";

export async function POST(req: NextRequest) {
  const { url, token, schemaFqn } = await req.json();
  try {
    const meta = await fetchSchemaMeta({ url, token }, schemaFqn);
    return NextResponse.json({ ok: true, meta });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg });
  }
}
