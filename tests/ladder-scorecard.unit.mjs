import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isoWeek,
  countRungs,
  scoreLadder,
  PROOF_THRESHOLD,
  PROOF_WEEKS,
} from "../scripts/ladder-scorecard.mjs";

const at = (iso) => ({ createdAt: iso });
const ev = (type, iso, meta) => ({ type, createdAt: iso, ...(meta ? { meta } : {}) });

test("isoWeek buckets to ISO Monday, incl. year boundaries", () => {
  // 2026-10-05 is a Monday → W41; 2026-10-04 Sunday is W40.
  assert.equal(isoWeek("2026-10-05T00:00:01Z").key, "2026-W41");
  assert.equal(isoWeek("2026-10-04T23:59:59Z").key, "2026-W40");
  // Jan 1 2026 is a Thursday → ISO W01 of 2026.
  assert.equal(isoWeek("2026-01-01T12:00:00Z").key, "2026-W01");
  assert.equal(isoWeek("not-a-date"), null);
});

test("countRungs: shares count regardless of attribution", () => {
  const weeks = countRungs(
    [ev("clip_share", "2026-10-06T10:00:00Z"), ev("edition_share_copy", "2026-10-06T11:00:00Z"), ev("page_view", "2026-10-06T12:00:00Z")],
    [],
  );
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].share, 2);
});

test("countRungs: episode landings count without src; other pages need src=share", () => {
  const events = [
    ev("shared_episode_open", "2026-10-06T10:00:00Z"), // self-identifying
    ev("league_page_view", "2026-10-06T10:05:00Z", { src: "direct" }), // not share-attributed
  ];
  const views = [
    { path: "/league", src: "share", createdAt: "2026-10-06T10:10:00Z" },
    { path: "/episode/abc", src: "share", createdAt: "2026-10-06T10:11:00Z" }, // excluded — shared_episode_open already counts it
    { path: "/", src: "direct", createdAt: "2026-10-06T10:12:00Z" },
    { path: "/earn/jupiter", createdAt: "2026-10-06T10:13:00Z" }, // no src
  ];
  const [w] = countRungs(events, views);
  assert.equal(w.land, 2); // episode open + tagged league pageview
});

test("countRungs: activation/pay require src=share (except shared_episode_cta_click)", () => {
  const events = [
    ev("shared_episode_cta_click", "2026-10-06T10:00:00Z"),
    ev("generate_complete", "2026-10-06T10:05:00Z", { src: "share" }),
    ev("generate_complete", "2026-10-06T10:06:00Z", { src: "t.co" }), // organic — not share loop
    ev("edition_published", "2026-10-06T10:10:00Z", { src: "share" }),
    ev("edition_published", "2026-10-06T10:11:00Z"), // organic pay — not share loop
  ];
  const [w] = countRungs(events, []);
  assert.equal(w.activate, 2);
  assert.equal(w.pay, 1);
});

test("scoreLadder: rung proven needs ≥5 next-rung events in 3 complete weeks", () => {
  // Three complete weeks ending 2026-10-11; "now" mid-W42.
  const mk = (weekStart, share, land, activate, pay) => ({
    week: weekStart,
    monday: new Date(`${weekStart}T00:00:00Z`).getTime(),
    share,
    land,
    activate,
    pay,
  });
  const weeks = [
    mk("2026-09-21", 30, 6, 4, 0),
    mk("2026-09-28", 30, 6, 6, 0),
    mk("2026-10-05", 30, 6, 5, 0),
    mk("2026-10-12", 30, 1, 0, 0), // in-progress week — excluded from proof
  ];
  const now = new Date("2026-10-14T12:00:00Z").getTime(); // Wednesday of W42
  const r = scoreLadder(weeks, now);
  assert.equal(r.enoughHistory, true);
  assert.equal(r.proven[1], true); // land ≥5 all three weeks
  assert.equal(r.proven[2], false); // activate 4,6,5 — one week under
  assert.equal(r.proven[3], false);
  assert.equal(r.firstUnproven, 2);
});

test("scoreLadder: insufficient history → nothing proven, firstUnproven reported", () => {
  const weeks = [
    { week: "2026-W42", monday: new Date("2026-10-12T00:00:00Z").getTime(), share: 9, land: 9, activate: 9, pay: 9 },
  ];
  const now = new Date("2026-10-14T12:00:00Z").getTime(); // same week — zero complete weeks
  const r = scoreLadder(weeks, now);
  assert.equal(r.enoughHistory, false);
  assert.equal(r.firstUnproven, 1);
});

test("scoreLadder: fully proven ladder", () => {
  const mk = (iso) => ({ week: iso, monday: new Date(`${iso}T00:00:00Z`).getTime(), share: 20, land: 9, activate: 7, pay: PROOF_THRESHOLD });
  const weeks = [mk("2026-09-21"), mk("2026-09-28"), mk("2026-10-05")];
  const r = scoreLadder(weeks, new Date("2026-10-14T12:00:00Z").getTime());
  assert.deepEqual(r.proven, { 1: true, 2: true, 3: true, 4: true });
  assert.equal(r.firstUnproven, null);
  assert.equal(PROOF_WEEKS, 3);
});
