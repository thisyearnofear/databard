/**
 * Server-side session management.
 * Stores connection config server-side, returns httpOnly cookie.
 * Credentials never persist in the browser.
 */
import { cookies } from "next/headers";
import { sessions } from "./store";
import type { ConnectionConfig } from "./types";

const SESSION_COOKIE = "databard_session";
const SESSION_TTL = 3600; // 1 hour

interface SessionData {
  config: ConnectionConfig;
  schemas: string[];
  createdAt: number;
}

/** Generate a cryptographically random session ID */
function generateId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

/** Create a new session, store config server-side, set cookie */
export async function createSession(config: ConnectionConfig, schemas: string[]): Promise<string> {
  const id = generateId();
  const data: SessionData = { config, schemas, createdAt: Date.now() };
  sessions.set(id, data, SESSION_TTL);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_TTL,
    path: "/",
  });

  return id;
}

/** Retrieve session data from cookie */
export async function getSession(): Promise<SessionData | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return sessions.get<SessionData>(id);
}

/** Get just the connection config from the current session */
export async function getSessionConfig(): Promise<ConnectionConfig | null> {
  const session = await getSession();
  return session?.config ?? null;
}

/** Destroy the current session */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    sessions.delete(id);
    jar.delete(SESSION_COOKIE);
  }
}
