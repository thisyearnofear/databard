/**
 * Native SOL settlement backend — direct lamport transfer to treasury.
 *
 * Same contract as the SPL (PUSD/USDC) backend: the tx must have succeeded,
 * pay the configured treasury, and be funded by the claiming wallet. The amount
 * check measures the treasury's lamport balance delta (pre/post `meta.balances`)
 * against a server-locked quote — the caller never names the price.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { pusdRpcUrl, pusdTreasury } from "../../pusd";
import { explorerUrl, type SettlementBackend, type VerifyRequest, type VerifyResult } from "../verifier";
import { activatePro } from "./pusd";

export const solBackend: SettlementBackend = {
  id: "sol",

  async verify(req: VerifyRequest): Promise<VerifyResult> {
    const treasury = req.expectedRecipient ? new PublicKey(req.expectedRecipient) : pusdTreasury();
    if (!treasury) {
      return { status: "mismatched", detail: "Payments are not configured (PALM_USD_RECIPIENT unset)" };
    }

    const connection = new Connection(pusdRpcUrl(), "confirmed");
    const tx = await connection.getTransaction(req.reference, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { status: "not-found", detail: "Transaction not found on-chain" };
    }
    if (tx.meta?.err) {
      return { status: "mismatched", detail: `On-chain error: ${JSON.stringify(tx.meta.err)}` };
    }

    const accountKeys = tx.transaction.message.getAccountKeys().keySegments().flat();

    // The claimant must be the funding wallet — the fee payer is the first
    // static account key on every Solana transaction.
    if (req.expectedPayer) {
      const feePayer = accountKeys[0];
      if (!feePayer || feePayer.toBase58() !== req.expectedPayer) {
        return { status: "mismatched", detail: "Transaction was not funded by the claiming wallet" };
      }
    }

    // Amount check: net lamports gained by the treasury, measured from
    // pre/post balances rather than instruction shape.
    if (req.expectedAmount !== undefined) {
      const tIdx = accountKeys.findIndex((k) => k.equals(treasury));
      if (tIdx === -1) {
        return { status: "mismatched", detail: "Transaction does not pay the treasury" };
      }
      const gained =
        BigInt(tx.meta?.postBalances?.[tIdx] ?? 0) - BigInt(tx.meta?.preBalances?.[tIdx] ?? 0);
      if (gained < BigInt(req.expectedAmount)) {
        return {
          status: "mismatched",
          detail: `Treasury gained ${(Number(gained) / 1e9).toFixed(4)} SOL, expected ${(req.expectedAmount / 1e9).toFixed(4)}`,
        };
      }
    }

    return {
      status: "verified",
      explorerUrl: explorerUrl("tx", req.reference),
    };
  },

  async activate(customerId: string, req: VerifyRequest): Promise<void> {
    await activatePro(customerId, req.reference);
  },
};
