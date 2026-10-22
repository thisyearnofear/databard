# BEAM.md — Beam × Hugging Face $20k competition (deadline Mon Nov 2)

Reflection + HF are giving away $20,000 to anyone building with
`reflection/Beam-1.0-501B-A23B` (501B MoE, 23B active, Apache-2.0, 1M context,
tagged reasoning/code/tool-use). Categories: demo, dataset, benchmark, RL
environment. Entry = comment your link on the model's repo page by **Monday
Nov 2**. Winners choose cash or credits. The contest advertises $25 of HF
credits per entrant — **we are saving those for the actual submission run.**

## Our entry: Option A + B (see docs/STRATEGY.md north star)

**A. Benchmark — "Beam as a data analyst" (primary).** Run Beam through
DataBard's real synthesis workload — schema → health score, findings,
episode-script JSON — graded by the same parsers the production pipeline uses
(valid JSON, schema conformance, score consistency), compared against the
current production model. Publish as a shareable report page at
`/benchmarks/beam`. Beam is sold on tool-use/agentic quality, and DataBard's
A2MCP endpoints are exactly that workload — the angle writes itself.

**Demo — `/labs/beam-audit` (interactive, built Oct 22).** Three stages, all
live: (1) Beam parses pasted DDL into a strict SchemaMeta via agentic
structured output; (2) the deterministic production rubric scores it; (3)
Beam narrates a two-host analysis with its raw `reasoning_content` streamed
into a visible "Beam's thoughts" panel. SSE route `/api/labs/beam-audit`,
quota guard (280/day global, 8/IP, resets 00:00 UTC with Reflection), cache,
one honest retry on shape failure, never caches failures. Featured datasets
get their pre-recorded production audio briefings.

**HF doorway — static Space (free).** Gradio Spaces now require HF Pro
($9/mo) — discovered at upload time (402 on cpu-basic) — so the tested
Gradio build stays in `space/` as the local/roadshow version, and
`space-static/` ships as a static HF Space at
`https://huggingface.co/spaces/Papajams/beam-data-audit` (served from
`https://papajams-beam-data-audit.static.hf.space`) linking demo + benchmark
+ dataset. $0.

**B. Dataset (bonus link in the same comment).** Publish the Probe verdicts /
marketplace service-quality index as `Papajams/agent-service-quality` on HF.
Cheap to assemble from `data/probe-verdicts.json` + the marketplace index.

Option C (RL env around `probe-scorer`) is parked — too heavy for the deadline.

## Beam access routes (all wired in `src/lib/llm-providers.ts`)

All three are OpenAI-compatible and OFF the default fallback chain — opt in
with `LOOP_PROVIDER_ORDER=<names>`.

| Provider name | Env key | Base URL | Default model | Cost |
|---|---|---|---|---|
| `reflection` | `REFLECTION_API_KEY` | `https://api.reflection.ai/openai/v1` (`REFLECTION_BASE_URL` override) | `Beam-1.0-501B-A23B` (`LOOP_REFLECTION_MODEL`) | **Free daily allowance** (beta plan): 10M input + 1M output + 500M total tokens, 20k requests/day, 60 req/min; resets 00:00 UTC — OUR PRIMARY ROUTE |
| `openrouter` | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `reflection/beam-1.0-501b-a23b` (`LOOP_OPENROUTER_MODEL`) | $0.25/M in, $1/M out — key stored but account has $0 credits; do not top up (spend cap) |
| `hf` | `HF_API_KEY` + `HF_INFERENCE_PROVIDER` (default `together`; router also serves `cerebras`, `novita`) | `https://router.huggingface.co/<provider>/v1` | `reflection/Beam-1.0-501B-A23B` (`LOOP_HF_MODEL`) | Spend the claimed $25 HF credits — save for the submission |

Notes from research (Oct 2026):
- **Beam is a thinking model** — reasoning tokens count against `max_tokens`
  (`reasoning_content` field + `reasoning_tokens` in usage). The Beam providers
  in `llm-providers.ts` inflate the budget via `beamBudget()` (4×, floor 512,
  cap 16k). Keep this in mind when reading latency/usage numbers in the bench.
- Live-verified Oct 2026: `reflection` provider → PONG in ~1s, free.
- **Reflection's free daily allowance is our primary route** — no spend,
  generous limits for a benchmark (20k req/day). Rate-limit our harness to
  stay under 60 req/min.
- Featherless (we hold a key) does **not** list Beam yet — re-check before the
  deadline, it would be the cheapest route.
- No HF token on this machine yet; claim via the link in the contest tweet,
  then set `HF_API_KEY`.
- Local GGUF is not viable (`unsloth/Beam-1.0-501B-A23B-GGUF` quants are
  hundreds of GB even at Q4 for a 501B model).
- Reflection's docs site (developers.reflection.ai) is JS-rendered; the API
  base URL + key pattern above were pulled from its rendered quickstart text.
  `/v1/models` returns 401 without a key, confirming the endpoint is live.

## Budget math (rough)

Benchmark ≈ 60–100 synthesis calls × ~2k in / ~1.5k out tokens. Entirely
inside Reflection's free daily allowance (10M input / 1M output per day), so
the benchmark costs **$0**. The $25 of claimed HF credits stay untouched —
reserved for anything Reflection's allowance can't cover. OpenRouter key
exists but the account has no credits and we do not plan to add any.

## Checklist

- [x] Reflection platform account + API key (free daily allowance) → `.env`
- [x] OpenRouter key stored (no credits; backup only)
- [x] **Interactive demo `/labs/beam-audit`** (Oct 22): SSE route
      `/api/labs/beam-audit` + `src/lib/beam-audit.ts`; verified locally —
      fixture podcast run clean (16.5s), custom-DDL run parses PII/lineage
      and scores 55, exec-summary reproduces the shape-failure card by
      design. Labs index card + sitemap entries added.
- [x] **Static HF Space doorway** `Papajams/beam-data-audit` (free tier;
      served at papajams-beam-data-audit.static.hf.space). Gradio hosting
      402'd — Pro-only now — so the tested Gradio app lives on in `space/`
      for local/roadshow use; `space-static/` is what ships to HF.
- [x] Prod env: `REFLECTION_API_KEY` appended to `/opt/databard/.env`
      (md5 integrity-verified; no .bak left behind). Required for the live
      demo in prod.
- [x] Deployed + verified in prod (Oct 22): page/bench/labs all 200; SSE
      fixture run returned clean segments in 11.6s (2347 reasoning tokens).
- [ ] Claim $25 HF credits (link in contest tweet) — optional now; all
      entry artifacts are live without them
- [x] Dry-run smoke: `reflection` provider returns PONG (free allowance)
- [x] `scripts/beam-bench.mjs` built (6 tasks × exact production prompts, graded
      like the pipeline; run with `npx tsx scripts/beam-bench.mjs`)
- [x] `/benchmarks/beam` report page + `src/lib/beam-bench.ts` loader, sitemap entry
- [x] **First full run (Oct 2026, data/beam-bench.json):** Beam mean score 65%
      (7.7s avg, 19k of 26k out-tokens were reasoning; 4/12 runs emitted a
      single JSON object instead of the required array — all in the
      executive-summary format, `failMode: object-not-array`). Production
      llama-3.3-70b: 98% at 52s avg. Beam is ~7× faster but loses shape
      discipline on the short-format task; that IS the honest story the page
      publishes.
- [x] Exporter done (`scripts/export-agent-service-quality.mjs`); dataset
      **UPLOADED** to `Papajams/agent-service-quality` (Oct 22 — no `databard`
      HF org exists; account is `Papajams`). Re-upload any time via the
      printed `hf upload` command (`HF_DATASET_ID` overrides the repo name).
- [x] **Deployed Oct 22** — `./scripts/deploy.sh` (build needed `rm -rf .next`
      first: next/font/google cache corruption) + artifact copied:
      `scp data/beam-bench.json snel-bot:/opt/databard/data/beam-bench.json`.
      Verified: `https://databard.persidian.com/benchmarks/beam` → HTTP 200
      with the real 65%/98% numbers.
- [x] Dataset export assembled from PROD data (pulled to /tmp/prod-data):
      3 verdicts (12 rows) + 153 scored index rows + 153 listings →
      uploaded to `Papajams/agent-service-quality`. Note: the exporter
      script is NOT in the release tarball — run it locally against
      scp'd prod data, or add it to prepare-standalone.mjs if it should
      live on the box.
- [ ] **Comment the links on `reflection/Beam-1.0-501B-A23B` repo page
      before Mon Nov 2** — paste-ready text below. Links: HF Space doorway,
      live demo, benchmark, dataset.
- [ ] Record any weirdness for the comment (refusal rate was 0; reasoning
      dominance noted on the page)

## Paste-ready comment for the model repo page

Post at https://huggingface.co/reflection/Beam-1.0-501B-A23B (Community →
discussions, or comment under the contest announcement thread). All links
below are live (verified Oct 22).

> **We built three things with Beam: a live demo, a graded benchmark, and a dataset**
>
> We run DataBard, an AI data analyst that turns schema metadata into
> narrated health reports — and we're an Agent Service Provider on OKX.AI,
> so agentic tool-use workloads are our day job.
>
> 1. **Live demo:** https://huggingface.co/spaces/Papajams/beam-data-audit →
>    https://databard.persidian.com/labs/beam-audit — paste your DDL; Beam
>    parses it into a schema (agentic structured output), our deterministic
>    production rubric scores it, and Beam narrates a two-host analysis with
>    its raw reasoning stream visible throughout. Runs on your free daily
>    allowance; when it's exhausted, it says so.
> 2. **Benchmark:** https://databard.persidian.com/benchmarks/beam — the
>    exact production synthesis prompts, 24 graded runs: Beam 65% mean check
>    score at 7.7s avg vs our production Llama-3.3-70B at 98% / 52s. The
>    interesting failure: on executive-summary format Beam returned a single
>    JSON object instead of the required array — valid JSON, wrong shape —
>    while long-form podcast scripts were flawless. 73% of its output tokens
>    were reasoning (we had to inflate max_tokens or content came back empty
>    — worth knowing behind an OpenAI-compatible router).
> 3. **Dataset:** https://huggingface.co/datasets/Papajams/agent-service-quality
>    — measured quality scores for 150+ pay-per-call agent services (x402
>    gates, latency, delivery), the workload context we benchmarked against.
>
> The harness reruns for free against the daily allowance, so the benchmark
> is a measured artifact, not a one-off screenshot. Code: scripts/beam-bench.mjs.
