import { NextResponse } from "next/server";
import { clearProAuthSession, getProAuthSession } from "@/lib/pro-auth";

/**
 * GET  /api/account/session  -> current unified account session (or null)
 * DELETE /api/account/session -> sign out
 */
export async function GET() {
  const session = await getProAuthSession();
  return NextResponse.json({ ok: true, session });
}

export async function DELETE() {
  await clearProAuthSession();
  return NextResponse.json({ ok: true });
}
