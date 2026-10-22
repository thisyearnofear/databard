import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, analyzeCommunityData, SAMPLE_CSV, SAMPLES, verdictFor } from "../src/lib/community-health";

test("parseCsv: basic comma split", () => {
  const { header, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6");
  assert.deepEqual(header, ["a", "b", "c"]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ["1", "2", "3"]);
});

test("parseCsv: quoted fields with commas and escaped quotes", () => {
  const { rows } = parseCsv('name,notes\n"O\'Neill, Jr","said ""hi"", left"');
  assert.deepEqual(rows[0], ["O'Neill, Jr", 'said "hi", left']);
});

test("parseCsv: semicolon + tab autodetect", () => {
  assert.deepEqual(parseCsv("a;b\n1;2").header, ["a", "b"]);
  assert.deepEqual(parseCsv("a\tb\n1\t2").rows[0], ["1", "2"]);
});

test("parseCsv: skips empty lines and blank rows", () => {
  const { rows } = parseCsv("a,b\n1,2\n\n,\n3,4\n");
  assert.equal(rows.length, 2);
});

test("analyze: kind inference (email/date/number/url/text)", () => {
  const csv = "email,joined,age,site,note\na@b.co,2026-01-02,30,https://x.com,hi\nc@d.co,2026-02-03,25,https://y.com,ho";
  const { header, rows } = parseCsv(csv);
  const r = analyzeCommunityData(header, rows);
  const kinds = Object.fromEntries(r.columns.map((c) => [c.name, c.kind]));
  assert.deepEqual(kinds, { email: "email", joined: "date", age: "number", site: "url", note: "text" });
});

test("analyze: duplicates + malformed email are caught", () => {
  const csv = "name,email\nA,a@x.com\nB,a@x.com\nC,not-an-email";
  const { header, rows } = parseCsv(csv);
  const r = analyzeCommunityData(header, rows);
  const dup = r.checks.find((c) => c.id === "duplicates");
  assert.equal(dup?.state, "partial");
  assert.match(dup?.detail ?? "", /1 duplicate/);
  const contact = r.checks.find((c) => c.id === "contactable");
  assert.notEqual(contact?.state, "pass");
});

test("analyze: staleness penalty when newest date is old", () => {
  const old = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
  const { header, rows } = parseCsv(`name,joined\nA,${old}`);
  const r = analyzeCommunityData(header, rows);
  const fresh = r.checks.find((c) => c.id === "freshness");
  assert.equal(fresh?.state, "fail");
});

test("analyze: no identity column deducts and advises", () => {
  const { header, rows } = parseCsv("city,vibe\nLondon,great\nLeeds,fine");
  const r = analyzeCommunityData(header, rows);
  assert.equal(r.checks.find((c) => c.id === "identity")?.state, "fail");
  assert.ok(r.score <= 80);
  assert.ok(r.actions.some((a) => /email/i.test(a)));
});

test("analyze: score clamps into 0-100 and label bands", () => {
  const { header, rows } = parseCsv(SAMPLE_CSV);
  const r = analyzeCommunityData(header, rows);
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(["healthy", "at-risk", "critical"].includes(r.label));
  assert.ok(r.checks.length >= 4);
});

test("analyze: thin data is flagged, not scored as healthy", () => {
  const r = analyzeCommunityData(["a"], [["1"]]);
  assert.equal(r.checks.find((c) => c.id === "volume")?.state, "fail");
  assert.ok(r.score <= 70);
});

test("verdict: leaky data wins over a high score", () => {
  const { header, rows } = parseCsv(SAMPLE_CSV); // 86/100 but has a dupe
  const r = analyzeCommunityData(header, rows);
  assert.equal(verdictFor(r).title, "Alive, but leaking");
});

test("verdict: stale list named even at mid score", () => {
  const stale = SAMPLES.find((s) => s.key === "stale")!;
  const { header, rows } = parseCsv(stale.csv);
  const r = analyzeCommunityData(header, rows);
  assert.equal(verdictFor(r).title, "This list has quietly stopped");
});

test("verdict: clean list gets the tended verdict", () => {
  const clean = SAMPLES.find((s) => s.key === "healthy")!;
  const { header, rows } = parseCsv(clean.csv);
  const r = analyzeCommunityData(header, rows);
  assert.equal(r.score, 100);
  assert.equal(verdictFor(r).title, "A list someone tends to");
});
