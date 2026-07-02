# Provider fix-rate benchmark

**Generated:** 2026-07-02T22:38:29.513Z
**Repeats:** 1
**Bug suite:** digest-margin, persona-fit-cascade-quality, buyer-fit-weight

Novel eval methodology: pit each LLM provider against the same synthetic-but-realistic bug
suite, using our real fixer prompt + strict-JSON contract, and score by *whether the patch
would compile and move the invariant in the right direction* — not just whether the model
returned syntactically-valid JSON.

The bug suite is drawn from real bug patterns we've hit in DataBard's marketplace:
economic-invariant errors (Digest margin), buyer scoring errors (persona-fit weights),
and market-parameter tuning (fit-vs-price weight). Each is a common failure mode for
autonomous-agent economies.

## Findings

- **Highest fix rate:** `nvidia` at 67% (2/3).
- **Provider outage in this run:** `venice` returned errors on every call (network / rate-limit / TLS reset). This is exactly why the loop's provider chain is a fallback, not a single-provider commitment. On any real run, the loop cycles to the next provider automatically — total pipeline never blocks on one provider's downtime.
- **Latency vs. quality trade-off:** models that pass more invariants often think longer. This is a real cost dimension for interactive loops — a p50 > 10s pushes the loop from "real-time" to "batch". Adjust `LOOP_PROVIDER_ORDER` accordingly for your context.


## Verdict definitions

| Verdict | Meaning |
|---|---|
| `hit` | Patch applies AND moves the invariant in the right direction |
| `wrong-direction` | Patch applies but tuning goes the wrong way |
| `hallucinated-anchor` | Model invented an `old_string` that isn't in the file |
| `wrong-file` | Model tried to edit the wrong file |
| `invalid-json` | Model output didn't parse as our schema |
| `error` | HTTP error, timeout, or empty response |

## Summary

| Provider | Model | Hits | Rate | p50 latency |
|---|---|---|---|---|
| venice | `venice-uncensored` | 0/3 | 0% | 18ms |
| nvidia | `openai/gpt-oss-20b` | 2/3 | 67% | 5817ms |

## Per-bug detail

| Provider | Bug | Repeat | Verdict | Latency | Reasoning / Error |
|---|---|---|---|---|---|
| venice | digest-margin | 1 | **error** | 53ms | fetch failed |
| venice | persona-fit-cascade-quality | 1 | **error** | 18ms | fetch failed |
| venice | buyer-fit-weight | 1 | **error** | 18ms | fetch failed |
| nvidia | digest-margin | 1 | **wrong-direction** | 18221ms | "Increase margin factor in DIGEST pricing to guarantee parent price exceeds sum o" |
| nvidia | persona-fit-cascade-quality | 1 | **hit** | 5817ms | "Increase cascade's fit weight for quality to ensure it wins quality briefs." |
| nvidia | buyer-fit-weight | 1 | **hit** | 4378ms | "Updated scoreBid to weight fit 68% and price 32% per spec, fixing low fit weight" |

## Reproduction

```bash
node scripts/loop/bench.mjs
node scripts/loop/bench.mjs --repeats 3   # for statistical significance
node scripts/loop/bench.mjs --out custom.md
```

The bench does *not* modify any repo file — it only feeds provider-generated patches
through the validator to score them. See `BUGS` in `scripts/loop/bench.mjs` for the
suite; adding a new bug means declaring its marker, break, and expected-direction check.
