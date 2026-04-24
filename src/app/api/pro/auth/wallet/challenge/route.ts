import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { makeWalletChallenge } from "@/lib/pro-auth";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { address?: string };
  const address = body.address;

  if (!address || !isAddress(address)) {
    return NextResponse.json({ ok: false, error: "Valid wallet address required" }, { status: 400 });
  }

  const { challengeId, message } = makeWalletChallenge(address);
  return NextResponse.json({ ok: true, challengeId, message });
}
