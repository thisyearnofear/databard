import { NextRequest, NextResponse } from "next/server";
import { makeEmailChallenge, normalizeEmail } from "@/lib/pro-auth";
import { sendLoginCodeEmail } from "@/lib/notifications";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/account/code  { email }
 * Requests a 6-digit passwordless sign-in code.
 * Delivered via Resend/SMTP/webhook; in non-production the code is also echoed
 * back in `devCode` so a demo/lab can complete sign-in without an inbox.
 */
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const email = normalizeEmail(body.email ?? "");
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email" }, { status: 400 });
  }

  const { challengeId, code } = makeEmailChallenge(email);
  const delivery = await sendLoginCodeEmail(email, code);

  const response: Record<string, unknown> = { ok: true, challengeId, sent: delivery.method };
  // Development/lab convenience only — never expose the code in production.
  if (process.env.NODE_ENV !== "production") {
    response.devCode = code;
  }
  return NextResponse.json(response);
}
