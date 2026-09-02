/**
 * serial() — in-process serialization that stops concurrent read-modify-write
 * ledger updates from clobbering each other. This is the bug that silently
 * dropped ~83% of events (24 navigations retained only the last 4 writes).
 * Run with: npx tsx tests/serial-queue.unit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serial } from "../src/lib/serial-queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("serial-queue", () => {
  it("loses no updates when many writers race on one key", async () => {
    const ledger: number[] = [];
    // Each writer reads the whole ledger, yields (so a naive impl interleaves),
    // then writes back its own copy — exactly the recordEvent read-modify-write.
    const writers = Array.from({ length: 50 }, (_, i) =>
      serial("race", async () => {
        const snapshot = ledger.slice();
        await tick();
        snapshot.push(i);
        ledger.length = 0;
        ledger.push(...snapshot);
      })
    );
    await Promise.all(writers);
    assert.equal(ledger.length, 50, "every concurrent write must land");
    assert.equal(new Set(ledger).size, 50, "no writer's record was clobbered");
  });

  it("keeps distinct keys independent (per-key queue, not one global lock)", async () => {
    const order: string[] = [];
    await Promise.all([
      serial("a", async () => { await tick(); order.push("a"); }),
      serial("b", async () => { order.push("b"); }),
    ]);
    // "b" has no prior work and no await, so it finishes while "a" is yielded —
    // proving key "a" does not block key "b".
    assert.deepEqual(order, ["b", "a"]);
  });

  it("does not wedge the queue after a rejection", async () => {
    await assert.rejects(() => serial("flaky", async () => { throw new Error("boom"); }), /boom/);
    const recovered = await serial("flaky", async () => "ok");
    assert.equal(recovered, "ok");
  });

  it("propagates the wrapped result and errors to the caller", async () => {
    assert.equal(await serial("val", async () => 42), 42);
    await assert.rejects(() => serial("val", async () => { throw new Error("nope"); }), /nope/);
  });
});
