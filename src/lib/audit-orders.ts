/**
 * Paid audit ledger — append-only JSON, same pattern as events.ts.
 * One row per completed Checkout Session for the health_* SKU ladder.
 * The report-delivery pipeline reads `status: "paid"` rows; an admin/runner
 * marks them "delivered" once the report is sent.
 */
import { promises as fs } from "fs";
import path from "path";
import { getDataPath } from "./data-dir";
import { serial } from "./serial-queue";

const ORDERS_FILE = getDataPath("audit-orders.json");
const MAX_ORDERS = 2_000;

export type AuditOrderStatus = "paid" | "delivered" | "refunded";

export interface AuditOrder {
  /** Stripe Checkout Session id — idempotency key. */
  sessionId: string;
  /** snapshot | plus | operator */
  sku: string;
  /** metadata.plan — health_snapshot | health_plus | health_operator */
  plan: string;
  email: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  status: AuditOrderStatus;
  paidAt: string;
  deliveredAt?: string;
}

async function readAll(): Promise<AuditOrder[]> {
  try {
    await fs.mkdir(path.dirname(ORDERS_FILE), { recursive: true });
    try { await fs.access(ORDERS_FILE); } catch { await fs.writeFile(ORDERS_FILE, "[]", "utf-8"); }
    const parsed = JSON.parse(await fs.readFile(ORDERS_FILE, "utf-8"));
    return Array.isArray(parsed) ? (parsed as AuditOrder[]) : [];
  } catch {
    return [];
  }
}

/** Record a paid audit. Idempotent on sessionId — safe to call from webhook retries. */
export async function recordAuditOrder(order: Omit<AuditOrder, "status">): Promise<void> {
  await serial("audit-orders", async () => {
    const all = await readAll();
    if (all.some((o) => o.sessionId === order.sessionId)) return;
    all.push({ ...order, status: "paid" });
    await fs.writeFile(ORDERS_FILE, JSON.stringify(all.slice(-MAX_ORDERS)), "utf-8");
  });
}

export async function listAuditOrders(status?: AuditOrderStatus): Promise<AuditOrder[]> {
  const all = await serial("audit-orders", readAll);
  return status ? all.filter((o) => o.status === status) : all;
}

export async function markAuditDelivered(sessionId: string): Promise<boolean> {
  return serial("audit-orders", async () => {
    const all = await readAll();
    const order = all.find((o) => o.sessionId === sessionId);
    if (!order) return false;
    order.status = "delivered";
    order.deliveredAt = new Date().toISOString();
    await fs.writeFile(ORDERS_FILE, JSON.stringify(all), "utf-8");
    return true;
  });
}
