// databard/active-task — the single checkpoint that survives a closed
// window. Same envelope pattern as doorknock/anna/bundle/recovery.js.

import { storageGet, storageSet } from "./session.js";

export const ACTIVE_TASK_KEY = "databard/active-task";
export const LAST_READING_KEY = "readings/last";
export const READING_PREFIX = "readings/";

const CHECKPOINT_VERSION = 1;
const TONES = ["straight", "roast"];
const PURPOSES = ["sponsor", "send", "invite", "handover", "cleanup"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const num = (v) => Number.isFinite(v);

/** The checkpoint carries the report payload ONLY — never CSV rows, never
 *  column samples (those hold member emails). validatePayload mirrors the
 *  shape reportPayload() in reading.js produces. */
export function validPayload(p) {
  if (!isObj(p)) return false;
  if (!num(p.score) || !str(p.label, 20) || !num(p.rowCount) || !num(p.columnCount)) return false;
  if (!str(p.verdict, 200)) return false;
  if (!Array.isArray(p.checks) || !p.checks.every((c) => isObj(c) && str(c.name, 200)
      && ["pass", "partial", "fail"].includes(c.state) && typeof c.detail === "string")) return false;
  if (!Array.isArray(p.columns) || !p.columns.every((c) => isObj(c) && str(c.name, 200)
      && typeof c.kind === "string" && num(c.completeness) && num(c.distinct))) return false;
  if (!Array.isArray(p.findings) || !p.findings.every((f) => typeof f === "string")) return false;
  if (!Array.isArray(p.actions) || !p.actions.every((a) => typeof a === "string")) return false;
  if (JSON.stringify(p).includes("samples")) return false; // belt-and-braces
  return true;
}

export function validateCheckpoint(raw) {
  try {
    return validateShape(raw);
  } catch {
    // a poisoned value (e.g. a Proxy that throws on read) is corrupt, not fatal
    return { corrupt: "unreadable value" };
  }
}

function validateShape(raw) {
  if (!isObj(raw)) return { corrupt: "not an object" };
  if (raw.v !== CHECKPOINT_VERSION) return { corrupt: `version ${raw.v}` };
  if (!str(raw.id, 128)) return { corrupt: "bad id" };
  if (raw.stage !== "reading") return { corrupt: `bad stage ${raw.stage}` };
  if (!TONES.includes(raw.tone)) return { corrupt: "bad tone" };
  if (!PURPOSES.includes(raw.purpose)) return { corrupt: "bad purpose" };
  if (!validPayload(raw.payload)) return { corrupt: "bad payload" };
  return { checkpoint: raw };
}

export async function readActiveTask(anna) {
  const raw = await storageGet(anna, ACTIVE_TASK_KEY);
  if (raw == null) return { status: "none" };
  const v = validateCheckpoint(raw);
  return v.checkpoint
    ? { status: "valid", checkpoint: v.checkpoint }
    : { status: "corrupt" };
}

export async function writeCheckpoint(anna, checkpoint) {
  return storageSet(anna, ACTIVE_TASK_KEY, checkpoint);
}

export async function clearCheckpoint(anna) {
  return storageSet(anna, ACTIVE_TASK_KEY, null);
}

export async function saveReading(anna, record) {
  const key = `${READING_PREFIX}${record.at}`;
  await storageSet(anna, key, record);
  await storageSet(anna, LAST_READING_KEY, { key });
  return key;
}

export async function readLastReading(anna) {
  const pointer = await storageGet(anna, LAST_READING_KEY);
  const key = isObj(pointer) && str(pointer.key, 200) ? pointer.key : null;
  if (!key) return null;
  const record = await storageGet(anna, key);
  return isObj(record) ? record : null;
}
