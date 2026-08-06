import { NextRequest, NextResponse } from "next/server";
import { getProAuthSession } from "@/lib/pro-auth";
import { accounts, type SavedConnection } from "@/lib/store";
import { randomUUID } from "crypto";

/**
 * Saved data sources for the signed-in account.
 * GET    -> list the account's saved connections
 * POST   -> { name, source, host? } add one (sanitised — no secrets)
 * DELETE -> { id } remove one
 */
export async function GET() {
  const session = await getProAuthSession();
  const email = session?.identity.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, sources: accounts.list(email) });
}

export async function POST(req: NextRequest) {
  const session = await getProAuthSession();
  const email = session?.identity.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
  }
  let body: { name?: string; source?: string; host?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? body.source ?? "Data source").trim().slice(0, 80);
  const source = String(body.source ?? "openmetadata").trim().slice(0, 40);
  const host = body.host ? String(body.host).trim().slice(0, 200) : undefined;
  if (!name || !source) {
    return NextResponse.json({ ok: false, error: "name and source required" }, { status: 400 });
  }
  const conn: SavedConnection = { id: randomUUID(), name, source, host, savedAt: new Date().toISOString() };
  const sources = accounts.add(email, conn);
  return NextResponse.json({ ok: true, source: conn, sources });
}

export async function DELETE(req: NextRequest) {
  const session = await getProAuthSession();
  const email = session?.identity.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
  }
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  const sources = accounts.remove(email, body.id);
  return NextResponse.json({ ok: true, sources });
}
