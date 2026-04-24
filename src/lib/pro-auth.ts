import { cookies } from "next/headers";
import { createHmac, randomBytes } from "crypto";
import { store, proAccounts } from "@/lib/store";

const PRO_AUTH_COOKIE = "databard_pro_auth";
const WALLET_CHALLENGE_TTL_SECONDS = 10 * 60;
const PRO_AUTH_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface ProIdentity {
  stripeCustomerId: string | null;
  email: string | null;
  walletAddress: `0x${string}` | null;
}

export interface ProEntitlements {
  stripe: boolean;
  onchain: boolean;
}

export interface ProAuthSession {
  identity: ProIdentity;
  entitlements: ProEntitlements;
  issuedAt: string;
}

interface WalletChallenge {
  nonce: string;
  address: `0x${string}`;
  statement: string;
  issuedAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function authSecret(): string {
  return process.env.DATABARD_AUTH_SECRET || process.env.NEXTAUTH_SECRET || "databard-dev-secret";
}

function signSession(session: ProAuthSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySignedSession(value: string): ProAuthSession | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  if (expected !== signature) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as ProAuthSession;
  } catch {
    return null;
  }
}

export async function getProAuthSession(): Promise<ProAuthSession | null> {
  const jar = await cookies();
  const token = jar.get(PRO_AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifySignedSession(token);
}

export async function saveProAuthSession(session: ProAuthSession): Promise<void> {
  const jar = await cookies();
  jar.set(PRO_AUTH_COOKIE, signSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PRO_AUTH_TTL_SECONDS,
    path: "/",
  });
}

export async function clearProAuthSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(PRO_AUTH_COOKIE);
}

export function makeWalletChallenge(address: `0x${string}`): { challengeId: string; message: string } {
  const challengeId = randomBytes(18).toString("base64url");
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = nowIso();
  const statement = "Sign to authenticate with DataBard Pro";

  const challenge: WalletChallenge = {
    nonce,
    address,
    statement,
    issuedAt,
  };

  store.set(`pro:wallet_challenge:${challengeId}`, challenge, WALLET_CHALLENGE_TTL_SECONDS);

  const domain = process.env.NEXT_PUBLIC_URL?.replace(/^https?:\/\//, "") || "localhost";
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    statement,
    "",
    `URI: ${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}`,
    "Version: 1",
    "Chain ID: 1",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");

  return { challengeId, message };
}

export function readWalletChallenge(challengeId: string): WalletChallenge | null {
  return store.get<WalletChallenge>(`pro:wallet_challenge:${challengeId}`);
}

export function consumeWalletChallenge(challengeId: string): void {
  store.delete(`pro:wallet_challenge:${challengeId}`);
}

export function hasStripeEntitlement(stripeCustomerId: string | null): boolean {
  if (!stripeCustomerId) return false;
  return Boolean(proAccounts.get(stripeCustomerId));
}

export function hasOnchainEntitlement(walletAddress: `0x${string}` | null): boolean {
  if (!walletAddress) return false;

  const allowlist = process.env.DATABARD_ONCHAIN_ALLOWLIST?.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean) ?? [];
  if (allowlist.includes(walletAddress.toLowerCase())) return true;

  return Boolean(store.get<{ active: boolean }>(`pro:onchain:${walletAddress.toLowerCase()}`)?.active);
}

export async function mergeAndPersistProIdentity(patch: Partial<ProIdentity>): Promise<ProAuthSession> {
  const existing = await getProAuthSession();

  const identity: ProIdentity = {
    stripeCustomerId: patch.stripeCustomerId ?? existing?.identity.stripeCustomerId ?? null,
    email: patch.email ?? existing?.identity.email ?? null,
    walletAddress: patch.walletAddress ?? existing?.identity.walletAddress ?? null,
  };

  const entitlements: ProEntitlements = {
    stripe: hasStripeEntitlement(identity.stripeCustomerId),
    onchain: hasOnchainEntitlement(identity.walletAddress),
  };

  const session: ProAuthSession = {
    identity,
    entitlements,
    issuedAt: nowIso(),
  };

  await saveProAuthSession(session);
  return session;
}

export async function requireProAccess(): Promise<{ ok: true; session: ProAuthSession } | { ok: false; reason: string }> {
  const session = await getProAuthSession();
  if (!session) return { ok: false, reason: "No Pro auth session" };
  if (!session.entitlements.stripe && !session.entitlements.onchain) {
    return { ok: false, reason: "No active entitlement" };
  }
  return { ok: true, session };
}
