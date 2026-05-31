import { NextResponse } from "next/server";
import { getTrackedSources, GRADUATION_THRESHOLD } from "@/lib/coral-graduation";

export async function GET() {
  try {
    const sources = await getTrackedSources();
    return NextResponse.json({
      ok: true,
      sources,
      graduationThreshold: GRADUATION_THRESHOLD,
    });
  } catch {
    return NextResponse.json({ ok: true, sources: [], graduationThreshold: GRADUATION_THRESHOLD });
  }
}
