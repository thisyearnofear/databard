import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupConflicts,
  parseImportCsv,
  emailColumnCandidates,
  IMPORT_CHECK_MAX_CHARS,
  IMPORT_CHECK_MAX_RECORDS,
} from "../src/lib/import-conflicts";
import { parseCsv } from "../src/lib/community-health";

const DEMO = `Name,Email,Team
Sam Kim,sam@example.test,North
Sam Kim,sam@example.test,North
Alex Dean,house@example.test,Junior
Jo Dean,house@example.test,Senior`;

test("groupConflicts: demo string — one identical group, one conflicting group", () => {
  const { rows } = parseCsv(DEMO);
  const groups = groupConflicts(rows, 1);
  assert.equal(groups.length, 2);
  const sam = groups.find((g) => g.email === "sam@example.test")!;
  assert.deepEqual(sam.indices, [0, 1]);
  assert.deepEqual(sam.differing, []);
  const house = groups.find((g) => g.email === "house@example.test")!;
  assert.deepEqual(house.indices, [2, 3]);
  assert.deepEqual(house.differing, [0, 2]); // Name and Team differ
});

test("groupConflicts: blank keys are omitted", () => {
  const rows = [
    ["A", ""],
    ["B", "   "],
    ["C", ""],
  ];
  assert.equal(groupConflicts(rows, 1).length, 0);
});

test("groupConflicts: different column picks yield different groups (purchaser vs guest)", () => {
  const { header, rows } = parseCsv(
    `Ticket,BuyerEmail,GuestEmail
VIP,pat@example.test,g1@example.test
VIP,pat@example.test,g2@example.test
GA,sam@example.test,g1@example.test`,
  );
  assert.equal(header[1], "BuyerEmail");
  const byBuyer = groupConflicts(rows, 1);
  assert.equal(byBuyer.length, 1);
  assert.equal(byBuyer[0].email, "pat@example.test");
  assert.deepEqual(byBuyer[0].indices, [0, 1]);
  const byGuest = groupConflicts(rows, 2);
  assert.equal(byGuest.length, 1);
  assert.equal(byGuest[0].email, "g1@example.test");
  assert.deepEqual(byGuest[0].indices, [0, 2]);
});

test("groupConflicts: nonadjacent rows, mixed case + surrounding space still group", () => {
  const rows = [
    ["A", "Sam@X.test", "1"],
    ["B", "other@test", "9"],
    ["C", "sam@x.test", "2"],
  ];
  const groups = groupConflicts(rows, 1);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].email, "sam@x.test");
  assert.deepEqual(groups[0].indices, [0, 2]);
  // key column is excluded from differing; name + code differ
  assert.deepEqual(groups[0].differing, [0, 2]);
});

test("groupConflicts: case-only key variants report no differing fields", () => {
  const rows = [
    ["Sam", "Sam@X.test", "1"],
    ["Sam", "sam@x.test", "1"],
  ];
  const groups = groupConflicts(rows, 1);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].email, "sam@x.test");
  assert.deepEqual(groups[0].differing, []);
});

test("groupConflicts: quoted CSV fields group correctly", () => {
  const { rows } = parseCsv(
    `name,email,note
"Dee, Ann",a@x.test,"likes ""csv"""
"Ray, Bo",a@x.test,plain`,
  );
  const groups = groupConflicts(rows, 1);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].differing, [0, 2]);
});

test("parseImportCsv: rejects blank input", () => {
  const r = parseImportCsv("   \n  ");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /nothing to check/i);
});

test("parseImportCsv: rejects inconsistent row width", () => {
  const r = parseImportCsv("a,b\n1,2\n3,4,5");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /record 2.*3 fields/i);
});

test("parseImportCsv: rejects header-only input", () => {
  const r = parseImportCsv("a,b");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /no records/i);
});

test("parseImportCsv: rejects duplicate and blank headers", () => {
  const r = parseImportCsv("a,a\n1,2");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /duplicate column header/i);
  const r2 = parseImportCsv("a,\n1,2");
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.error, /blank column name/i);
});

test("parseImportCsv: rejects unterminated quoted field", () => {
  const r = parseImportCsv('a,email\nSam,"open');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /never closes/i);
});

test("parseImportCsv: enforces column limit", () => {
  const header = Array.from({ length: 101 }, (_, i) => `c${i}`).join(",");
  const r = parseImportCsv(`${header}\n${Array.from({ length: 101 }, () => "x").join(",")}`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /columns/i);
});

test("parseImportCsv: enforces char limit without truncation", () => {
  const r = parseImportCsv("x".repeat(IMPORT_CHECK_MAX_CHARS + 1));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /limit/i);
});

test("parseImportCsv: enforces record limit without truncation", () => {
  const csv = "a,b\n" + Array.from({ length: IMPORT_CHECK_MAX_RECORDS + 1 }, (_, i) => `x${i},y${i}`).join("\n");
  const r = parseImportCsv(csv);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /limit/i);
});

test("parseImportCsv: accepts the demo string and TSV", () => {
  const r = parseImportCsv(DEMO);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.header, ["Name", "Email", "Team"]);
    assert.equal(r.rows.length, 4);
  }
  const t = parseImportCsv("a\tb\n1\t2");
  assert.ok(t.ok);
});

test("emailColumnCandidates: none, unique, ambiguous", () => {
  assert.deepEqual(emailColumnCandidates(["name", "city"]), []);
  assert.deepEqual(emailColumnCandidates(["Name", "Email", "Team"]), [1]);
  assert.deepEqual(emailColumnCandidates(["BuyerEmail", "GuestEmail"]), [0, 1]);
});
