import { NextRequest, NextResponse } from "next/server";
import { mergeAndPersistProIdentity } from "@/lib/pro-auth";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { customerId?: string; email?: string };
  const { customerId, email } = body;

  if (!customerId && !email) {
    return NextResponse.json({ ok: false, error: "customerId or email is required" }, { status: 400 });
  }

  const session = await mergeAndPersistProIdentity({
    stripeCustomerId: customerId ?? null,
    email: email ?? null,
  });

  return NextResponse.json({ ok: true, session });
}
