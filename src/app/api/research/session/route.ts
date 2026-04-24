import { NextRequest, NextResponse } from "next/server";
import { getResearchSession } from "@/lib/research-session";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("id");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing id parameter" }, { status: 400 });
  }

  const session = getResearchSession(sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Research session not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, session });
}
