import { NextRequest, NextResponse } from "next/server";
import { listResearchSessions } from "@/lib/research-session";

export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get("prefix") ?? "";
  const sessions = listResearchSessions(prefix);
  return NextResponse.json({ ok: true, sessions });
}
