export type CheckoutMethod = "sol" | "usdc" | "pusd";

export interface PendingCheckout {
  version: 1;
  walletAddress: string;
  purpose: "edition" | "pro";
  editionId?: string;
  slug?: string;
  method: CheckoutMethod;
  quoteId?: string;
  txSignature: string;
  amountLabel: string;
  createdAt: string;
}

export function checkoutStorageKey(purpose: "edition" | "pro", reference: string): string {
  return `databard:pending-checkout:${purpose}:${reference}`;
}

export function signatureToBase58(bytes: Uint8Array): string {
  if (bytes.length !== 64) throw new Error("Missing wallet signature");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`);
  let signature = "";
  while (value > BigInt(0)) {
    signature = alphabet[Number(value % BigInt(58))] + signature;
    value /= BigInt(58);
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    signature = "1" + signature;
  }
  return signature;
}

const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const METHODS: CheckoutMethod[] = ["sol", "usdc", "pusd"];
const PURPOSES: PendingCheckout["purpose"][] = ["edition", "pro"];

export const CORRUPT_PENDING_MESSAGE =
  "Saved payment details could not be read. Check your wallet before paying again.";

function isPendingCheckout(value: unknown): value is PendingCheckout {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p.version !== 1) return false;
  if (typeof p.walletAddress !== "string" || p.walletAddress.length === 0) return false;
  if (!PURPOSES.includes(p.purpose as PendingCheckout["purpose"])) return false;
  if (!METHODS.includes(p.method as CheckoutMethod)) return false;
  if (typeof p.txSignature !== "string" || !BASE58_SIGNATURE.test(p.txSignature)) return false;
  if (typeof p.amountLabel !== "string" || typeof p.createdAt !== "string") return false;
  if (!Number.isFinite(Date.parse(p.createdAt as string))) return false;
  if (p.method === "sol" && (typeof p.quoteId !== "string" || p.quoteId.length === 0)) return false;
  if (p.purpose === "edition") {
    if (typeof p.editionId !== "string" || p.editionId.length === 0) return false;
    if (typeof p.slug !== "string" || p.slug.length === 0) return false;
  }
  return true;
}

function expectedKey(p: PendingCheckout): string {
  return checkoutStorageKey(
    p.purpose,
    p.purpose === "edition" ? p.slug! : p.walletAddress,
  );
}

export function readPendingCheckout(
  storage: Pick<Storage, "getItem">,
  key: string,
): PendingCheckout | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    throw new Error(CORRUPT_PENDING_MESSAGE);
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPendingCheckout(parsed) || expectedKey(parsed) !== key) throw new Error("bad shape");
    return parsed;
  } catch {
    throw new Error(CORRUPT_PENDING_MESSAGE);
  }
}

export function savePendingCheckout(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  pending: PendingCheckout,
): void {
  if (!isPendingCheckout(pending) || expectedKey(pending) !== key) {
    throw new Error(CORRUPT_PENDING_MESSAGE);
  }
  const existing = readPendingCheckout(storage, key);
  if (existing && existing.txSignature !== pending.txSignature) {
    throw new Error("A different payment is already pending for this purchase — not overwriting it.");
  }
  const serialized = JSON.stringify(pending);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) {
    throw new Error("Could not record the payment reference — payment not sent.");
  }
}

export function clearPendingCheckout(
  storage: Pick<Storage, "removeItem">,
  key: string,
): void {
  storage.removeItem(key);
}

export function verifyCheckoutRequest(pending: PendingCheckout): {
  url: string;
  body: Record<string, string | undefined>;
} {
  return {
    url: "/api/checkout/palmusd/verify",
    body: {
      walletAddress: pending.walletAddress,
      txSignature: pending.txSignature,
      purpose: pending.purpose,
      editionId: pending.editionId,
      method: pending.method,
      quoteId: pending.quoteId,
    },
  };
}

export async function recoverCheckout(
  pending: PendingCheckout,
  request: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const { url, body } = verifyCheckoutRequest(pending);
  const res = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Payment not confirmed yet. Check its status before paying again.");
  }
  return data;
}

export async function submitRecoverableCheckout(
  pending: PendingCheckout,
  deps: {
    save: (pending: PendingCheckout) => void;
    submit: () => Promise<unknown>;
    verify: (pending: PendingCheckout) => Promise<void>;
  },
): Promise<void> {
  deps.save(pending);
  try {
    await deps.submit();
  } catch {
  }
  await deps.verify(pending);
}
