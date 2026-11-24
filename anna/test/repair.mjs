// repair.js — in-window cleaning: trim, empty rows, email normalisation,
// dedupe, and a change log that never carries a cell value.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  planRepair,
  normaliseEmail,
  emailColumnIndex,
  toCsv,
  csvCell,
} from "../bundle/repair.js";
import { parseCsv, SAMPLES } from "../bundle/community-health.js";

const header = ["name", "email", "city"];
const rows = [
  [" Ada Lovelace ", " Ada@Example.org ", " London "],
  ["Grace Hopper", "mailto:grace@example.org", "Arlington"],
  ["Ada Lovelace", "ada@example.org", "London"],
  ["", "", ""],
  ["Katherine Johnson", "<katherine@example.org>", "White Sulphur Springs"],
];

test("normalises case, mailto: and angle brackets", () => {
  assert.equal(normaliseEmail(" Ada@Example.org "), "ada@example.org");
  assert.equal(normaliseEmail("mailto:GRACE@EXAMPLE.ORG"), "grace@example.org");
  assert.equal(normaliseEmail("<k@example.org>"), "k@example.org");
  assert.equal(normaliseEmail(""), "");
});

test("finds the email column by common header spellings", () => {
  assert.equal(emailColumnIndex(["Name", "E-Mail", "City"]), 1);
  assert.equal(emailColumnIndex(["name", "email address"]), 1);
  assert.equal(emailColumnIndex(["name", "city"]), -1);
});

test("trims every cell and reports how many changed", () => {
  const out = planRepair(header, [[" Ada ", " a@b.co ", " London "]]);
  assert.deepEqual(out.rows[0], ["Ada", "a@b.co", "London"]);
  const trim = out.changes.find((c) => c.kind === "trim");
  assert.equal(trim.count, 3);
});

test("drops rows that are empty across every column", () => {
  const out = planRepair(header, rows);
  assert.equal(out.emptyDropped, 1);
  assert.equal(out.rows.length, 3);
  assert.ok(out.changes.some((c) => c.kind === "empty" && c.count === 1));
});

test("normalises the email column and leaves invalid addresses in place", () => {
  const out = planRepair(header, rows);
  const emails = out.rows.map((r) => r[1]);
  assert.ok(emails.includes("ada@example.org"));
  assert.ok(emails.includes("grace@example.org"));
  assert.ok(emails.includes("katherine@example.org"));

  const bad = planRepair(header, [["Bad", "not-an-email", "X"]]);
  assert.equal(bad.rows.length, 1);
  assert.ok(bad.changes.some((c) => c.kind === "invalid-email" && c.count === 1));
});

test("dedupes by normalised email and keeps the first occurrence", () => {
  const out = planRepair(header, rows);
  assert.equal(out.duplicateCount, 1);
  assert.equal(out.rows.length, 3);
  assert.equal(out.rows[0][0], "Ada Lovelace");
  assert.equal(out.rows[0][2], "London");
  assert.ok(out.changes.some((c) => c.kind === "duplicate" && c.count === 1));
});

test("dedupes by whole row when the sheet has no email column", () => {
  const out = planRepair(["name", "city"], [
    ["Ada", "London"],
    ["ada", "london"], // same after normalisation
    ["Grace", "Arlington"],
  ]);
  assert.equal(out.duplicateCount, 1);
  assert.equal(out.rows.length, 2);
});

test("pads ragged rows to the header width", () => {
  const out = planRepair(header, [["Ada", "a@b.co"]]);
  assert.deepEqual(out.rows[0], ["Ada", "a@b.co", ""]);
});

test("a clean sheet reports no changes", () => {
  const out = planRepair(header, [["Ada", "ada@example.org", "London"]]);
  assert.equal(out.changed, false);
  assert.equal(out.changes.length, 0);
  assert.match(out.summary, /Nothing to repair/);
});

test("a note about malformed addresses is not counted as a fix", () => {
  const out = planRepair(header, [["Ada", "not-an-email", "London"]]);
  assert.equal(out.changed, false);
  assert.equal(out.changes.length, 1);
  assert.equal(out.changes[0].kind, "invalid-email");
  assert.match(out.summary, /No automatic fix/);
  assert.match(out.changes[0].text, /does not look like an email/);
});

test("the note agrees with the count", () => {
  const out = planRepair(header, [
    ["Ada", "not-an-email", "London"],
    ["Grace", "also-bad@", "Arlington"],
  ]);
  assert.match(out.changes[0].text, /Left 2 addresses .* that still do not look/);
});

test("the change log never carries a cell value", () => {
  const out = planRepair(header, rows);
  const log = JSON.stringify(out.changes);
  assert.ok(out.changes.length > 0);
  assert.ok(!log.includes("@"), "change log leaked an email");
  for (const name of ["Ada", "Grace", "Katherine", "London", "Arlington"]) {
    assert.ok(!log.includes(name), `change log leaked ${name}`);
  }
});

test("csv output quotes separators and round-trips through parseCsv", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  const out = planRepair(["name", "note"], [['Ada, Jr.', 'said "hi"']]);
  const back = parseCsv(out.csv);
  assert.deepEqual(back.header, ["name", "note"]);
  assert.deepEqual(back.rows, [["Ada, Jr.", 'said "hi"']]);
});

test("the shipped samples survive a repair pass without losing members", () => {
  for (const sample of SAMPLES) {
    const parsed = parseCsv(sample.csv);
    const out = planRepair(parsed.header, parsed.rows);
    assert.ok(out.rows.length > 0, `${sample.key} lost every row`);
    assert.ok(out.rows.length <= parsed.rows.length, `${sample.key} grew`);
    const back = parseCsv(out.csv);
    assert.equal(back.header.length, parsed.header.length);
    assert.equal(back.rows.length, out.rows.length);
  }
});
