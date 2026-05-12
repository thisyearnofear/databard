/**
 * POST /api/checkout/palmusd
 * Creates a Palm USD payment transaction for DataBard Pro.
 * Returns an unsigned transaction for the client to sign with their Solana wallet.
 *
 * Body: { walletAddress }
 * Returns: { ok, unsignedTxBase64, amount, recipient } or { ok: false, error }
 *
 * Palm USD is a Solana stablecoin. The Pro subscription is $29/mo = 29 PUSD.
 * After the client signs and submits, they call /api/checkout/palmusd/verify
 * to confirm payment and activate Pro.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Transaction,
  PublicKey,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? `https://api.${NETWORK}.solana.com`;
const PRO_PRICE_PUSD = 29; // $29/mo

function getConfig() {
  const mint = new PublicKey(
    process.env.NEXT_PUBLIC_PALM_USD_MINT ?? "CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s",
  );
  const recipient = new PublicKey(
    process.env.PALM_USD_RECIPIENT ?? "11111111111111111111111111111111",
  );
  return { mint, recipient };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json({ ok: false, error: "walletAddress required" }, { status: 400 });
    }

    const { mint: PALM_USD_MINT, recipient: RECIPIENT_WALLET } = getConfig();
    const connection = new Connection(RPC_URL, "confirmed");
    const payer = new PublicKey(walletAddress);

    // Get or create associated token accounts
    const payerAta = await getAssociatedTokenAddress(PALM_USD_MINT, payer);
    const recipientAta = await getAssociatedTokenAddress(PALM_USD_MINT, RECIPIENT_WALLET);

    // Check payer has enough PUSD
    try {
      const payerAccount = await getAccount(connection, payerAta);
      const balance = Number(payerAccount.amount) / 1e6; // PUSD has 6 decimals
      if (balance < PRO_PRICE_PUSD) {
        return NextResponse.json(
          { ok: false, error: `Insufficient PUSD balance. Need ${PRO_PRICE_PUSD}, have ${balance.toFixed(2)}` },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "No Palm USD token account found. You need PUSD tokens to subscribe." },
        { status: 400 },
      );
    }

    // Build transfer transaction
    const amount = BigInt(PRO_PRICE_PUSD * 1e6); // 6 decimals
    const transferIx = createTransferInstruction(
      payerAta,
      recipientAta,
      payer,
      amount,
    );

    const tx = new Transaction().add(transferIx);
    tx.feePayer = payer;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

    return NextResponse.json({
      ok: true,
      unsignedTxBase64: Buffer.from(serialized).toString("base64"),
      amount: PRO_PRICE_PUSD,
      token: "PUSD",
      recipient: RECIPIENT_WALLET.toBase58(),
      network: NETWORK,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
