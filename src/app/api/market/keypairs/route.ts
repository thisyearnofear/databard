/**
 * GET /api/market/keypairs — dev / admin: list the server-side keypairs the demo uses.
 *
 * Not authenticated (demo/devnet only). Returns the Watchdog buyer pubkey and every internal
 * persona seller's pubkey so an operator can `solana transfer` SOL to seed them before the demo.
 */
import { NextResponse } from "next/server";
import { getWatchdogKeypair } from "@/lib/settlement/backends/escrow";
import { getSellerActor } from "@/lib/market/sellers";
import { getConsumerKeypair, getDigestBuyerKeypair } from "@/lib/market/reseller";
import { PERSONAS } from "@/lib/voice-config";

export async function GET() {
  const buyers = {
    watchdog: getWatchdogKeypair().publicKey.toBase58(),
    consumer: getConsumerKeypair().publicKey.toBase58(),
    digestBuyer: getDigestBuyerKeypair().publicKey.toBase58(),
  };
  const sellers = PERSONAS.map((p) => {
    const actor = getSellerActor(p.id);
    return {
      personaId: p.id,
      name: p.name,
      kind: p.kind,
      bidsOn: p.bidsOn,
      publicKey: actor.publicKey,
      costFloorLamports: p.costFloorLamports,
    };
  });
  return NextResponse.json({
    ok: true,
    buyers,
    sellers,
  });
}
