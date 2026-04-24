import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { consumeWalletChallenge, mergeAndPersistProIdentity, readWalletChallenge } from "@/lib/pro-auth";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { challengeId?: string; address?: string; signature?: string };
  const { challengeId, address, signature } = body;

  if (!challengeId || !address || !signature || !isAddress(address)) {
    return NextResponse.json({ ok: false, error: "challengeId, address, and signature required" }, { status: 400 });
  }

  const challenge = readWalletChallenge(challengeId);
  if (!challenge) {
    return NextResponse.json({ ok: false, error: "Challenge expired" }, { status: 400 });
  }

  if (challenge.address.toLowerCase() !== address.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "Address mismatch" }, { status: 400 });
  }

  const domain = process.env.NEXT_PUBLIC_URL?.replace(/^https?:\/\//, "") || "localhost";
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    challenge.address,
    "",
    challenge.statement,
    "",
    `URI: ${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}`,
    "Version: 1",
    "Chain ID: 1",
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
  ].join("\n");

  const valid = await verifyMessage({
    address: challenge.address,
    message,
    signature: signature as `0x${string}`,
  });

  consumeWalletChallenge(challengeId);

  if (!valid) {
    return NextResponse.json({ ok: false, error: "Signature verification failed" }, { status: 401 });
  }

  const session = await mergeAndPersistProIdentity({ walletAddress: challenge.address });
  return NextResponse.json({ ok: true, session });
}
