import { NextResponse } from "next/server";
import { getSessionConfig } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/actions/connection — expose only the current session's source type
 * (never credentials) so the UI can show DataHub-specific actions.
 */
export async function GET() {
  try {
    const config = await getSessionConfig();
    return NextResponse.json({
      ok: true,
      connected: Boolean(config),
      source: config?.source ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
