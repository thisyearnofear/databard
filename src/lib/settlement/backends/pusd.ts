/**
 * Palm USD settlement backend — SPL token transfer to treasury, verified on-chain.
 *
 * Extracted from api/checkout/palmusd/verify/route.ts so the same verification code path
 * is reachable from Pro checkout AND commissioned editions. Verification is strict:
 * the tx must have succeeded, pay the configured treasury, be funded by the claiming
 * wallet, and move at least `expectedAmount` of `expectedMint` tokens — measured from
 * pre/post token balances, not the caller's word. Replay protection lives in
 * `claimPusdSignature` (src/lib/pusd.ts), which routes invoke after verification.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { proAccounts } from "../../store";
import { pusdMint, pusdRpcUrl, pusdTreasury } from "../../pusd";
import { explorerUrl, type SettlementBackend, type VerifyRequest, type VerifyResult } from "../verifier";

export const pusdBackend: SettlementBackend = {
  id: "pusd",

  async verify(req: VerifyRequest): Promise<VerifyResult> {
    const treasury = req.expectedRecipient ? new PublicKey(req.expectedRecipient) : pusdTreasury();
    if (!treasury) {
      return { status: "mismatched", detail: "PUSD payments are not configured (PALM_USD_RECIPIENT unset)" };
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
    if (!accountKeys.some((k) => k.equals(treasury))) {
      return { status: "mismatched", detail: "Transaction does not involve the treasury" };
    }

    // The claimant must be the funding wallet — the fee payer is the first
    // static account key on every Solana transaction.
    if (req.expectedPayer) {
      const feePayer = accountKeys[0];
      if (!feePayer || feePayer.toBase58() !== req.expectedPayer) {
        return { status: "mismatched", detail: "Transaction was not funded by the claiming wallet" };
      }
    }

    // Amount + mint check: net tokens gained by the treasury's ATA for the
    // expected mint, measured from pre/post token balances rather than
    // instruction shape. The `owner` field is not populated on every RPC, so
    // the token account is identified by resolving its account index.
    if (req.expectedAmount !== undefined) {
      const mintKey = req.expectedMint ? new PublicKey(req.expectedMint) : pusdMint();
      const expectedAta = await getAssociatedTokenAddress(mintKey, treasury);
      const mint = mintKey.toBase58();
      type TokenBalance = NonNullable<typeof tx.meta>["postTokenBalances"];
      const balanceOf = (list: TokenBalance) =>
        (list ?? [])
          .filter(
            (b) =>
              b.mint === mint &&
              (b.owner === treasury.toBase58() ||
                (accountKeys[b.accountIndex] && accountKeys[b.accountIndex].equals(expectedAta))),
          )
          .reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), BigInt(0));
      const gained = balanceOf(tx.meta?.postTokenBalances) - balanceOf(tx.meta?.preTokenBalances);
      if (gained < BigInt(req.expectedAmount)) {
        return {
          status: "mismatched",
          detail: `Treasury gained ${(Number(gained) / 1e6).toFixed(2)} PUSD, expected ${(req.expectedAmount / 1e6).toFixed(2)}`,
        };
      }
    }

    return {
      status: "verified",
      explorerUrl: explorerUrl("tx", req.reference),
    };
  },

  async activate(customerId: string, req: VerifyRequest): Promise<void> {
    const existing = proAccounts.get(customerId);
    const subscriptionId = `palmusd_${req.reference.slice(0, 16)}`;
    if (existing) {
      proAccounts.update(customerId, { plan: "team", stripeSubscriptionId: subscriptionId });
      return;
    }
    proAccounts.set(customerId, {
      stripeCustomerId: "",
      stripeSubscriptionId: subscriptionId,
      plan: "team",
      activatedAt: new Date().toISOString(),
      schedules: [],
      feedToken: Math.random().toString(36).substring(2, 15),
    });
  },
};
