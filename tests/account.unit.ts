/**
 * Unit tests for the passwordless email auth (pro-auth) and per-account saved
 * connections (store.accounts) added for the DataHub hackathon.
 *
 * Run: npx tsx tests/account.unit.ts  (also wired into `npm run test:unit`)
 */
import { checkEmailCode, makeEmailChallenge, readEmailChallenge, consumeEmailChallenge } from "../src/lib/pro-auth";
import { accounts, type SavedConnection } from "../src/lib/store";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

function assertEqual(a: unknown, b: unknown, msg: string) {
  assert(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);
}

console.log("account.unit — checkEmailCode");
assertEqual(checkEmailCode(0, "123456", "123456").ok, true, "correct code passes");
assertEqual(checkEmailCode(0, "000000", "123456").ok, false, "wrong code fails");
assertEqual(checkEmailCode(0, " 123456 ", "123456").ok, true, "code is trimmed before compare");
assertEqual(checkEmailCode(5, "123456", "123456").ok, false, "locked after max attempts");
assertEqual(checkEmailCode(5, "123456", "123456").reason, "Too many attempts — request a new code", "locked reason");

console.log("account.unit — code generation + store");
const { challengeId, code } = makeEmailChallenge("  Test@Example.com ");
assertEqual(typeof challengeId, "string", "challengeId generated");
assert(/^\d{6}$/.test(code), "code is 6 digits");
const challenge = readEmailChallenge(challengeId);
assertEqual(challenge?.email, "test@example.com", "email normalized to lowercase+trimmed");
assertEqual(challenge?.code, code, "stored code matches returned code");
consumeEmailChallenge(challengeId);
assertEqual(readEmailChallenge(challengeId), null, "challenge removed after consume");

console.log("account.unit — saved connections (store.accounts)");
const email = "analyst@acme.com";
const first: SavedConnection = { id: "a", name: "DataHub · db.sales", source: "datahub", host: "http://localhost:8080", savedAt: new Date().toISOString() };
accounts.add(email, first);
assertEqual(accounts.list(email).length, 1, "one source saved");
accounts.add(email, { ...first, id: "b", name: "dbt Cloud", source: "dbt-cloud" });
assertEqual(accounts.list(email).length, 2, "two sources saved");
accounts.add(email, { ...first, id: "a", name: "upd", source: "datahub" });
assertEqual(accounts.list(email).length, 2, "re-adding same id dedupes");
accounts.remove(email, "a");
assertEqual(accounts.list(email).length, 1, "source removed");
assertEqual(accounts.list(email)[0]?.id, "b", "remaining source is the right one");

// Isolation: another account shouldn't see these sources
accounts.remove(email, "b");
assertEqual(accounts.list("someone@else.com").length, 0, "sources are namespaced per account");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\naccount.unit: all passed");
