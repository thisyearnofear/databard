import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");

interface Lead {
  email: string;
  source: string;
  createdAt: string;
  ip: string | null;
}

async function ensureFile() {
  const dir = path.dirname(LEADS_FILE);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(LEADS_FILE);
  } catch {
    await fs.writeFile(LEADS_FILE, "[]", "utf-8");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, source = "sandbox" } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: "Invalid email format" }, { status: 400 });
    }

    await ensureFile();

    const raw = await fs.readFile(LEADS_FILE, "utf-8");
    const leads: Lead[] = JSON.parse(raw);

    // Deduplicate by email
    if (leads.some((l) => l.email.toLowerCase() === email.toLowerCase())) {
      return NextResponse.json({ ok: true, message: "Already registered" });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;

    leads.push({ email, source: String(source), createdAt: new Date().toISOString(), ip });
    await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
