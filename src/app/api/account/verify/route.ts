import { NextRequest, NextResponse } from "next/server";
import { verifyEmailCode } from "@/lib/pro-auth";

/**
 * POST /api/account/verify  { challengeId, code }
 * Verifies the emailed code and persists the unified account session cookie.
 */
export async function POST(req: NextRequest) {
  let body: { challengeId?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { challengeId, code } = body;
  if (!challengeId || typeof code !== "string") {
    return NextResponse.json({ ok: false, error: "challengeId and code required" }, { status: 400 });
  }

  const result = await verifyEmailCode(challengeId, code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 401 });
  }
  return NextResponse.json({ ok: true, session: result.session });
}
