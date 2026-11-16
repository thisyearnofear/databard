/* The gauge and meter painters are pure functions of (value, size, theme):
   snapshot the emitted pixel ops for two values. */
import test from "node:test";
import assert from "node:assert/strict";
import { paintGauge, paintMeter, backingSize } from "../bundle/dither.js";

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function hashOps(painter, size, frac, opts) {
  const cells = [];
  painter((x, y, css) => cells.push(`${x},${y}:${css}`), size, frac, opts);
  return { count: cells.length, hash: fnv1a(cells.join("|")) };
}

const SIZE = { width: 168, height: 96 };
const MSIZE = { width: 96, height: 8 };

test("paintGauge is deterministic and value-sensitive", () => {
  const a = hashOps(paintGauge, SIZE, 0.86, { color: "green", ticks: [50, 80] });
  const b = hashOps(paintGauge, SIZE, 0.86, { color: "green", ticks: [50, 80] });
  const c = hashOps(paintGauge, SIZE, 0.42, { color: "orange", ticks: [50, 80] });
  assert.equal(a.count, b.count);
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.match(String(a.count), /^\d+$/);
  // pinned: any geometry/logic drift changes these numbers
  assert.equal(a.count, 1544);
  assert.equal(a.hash, 274483784);
  assert.equal(c.count, 1544);
  assert.equal(c.hash, 3933123317);
});

test("paintMeter is deterministic and value-sensitive", () => {
  const a = hashOps(paintMeter, MSIZE, 1, { value: 86, color: "green" });
  const b = hashOps(paintMeter, MSIZE, 1, { value: 86, color: "green" });
  const c = hashOps(paintMeter, MSIZE, 1, { value: 42, color: "orange" });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.equal(a.count, 356);
  assert.equal(a.hash, 3170731778);
});

test("backingSize clamps to cell resolution", () => {
  assert.deepEqual(backingSize(168, 96), { cols: 84, rows: 48 });
});
