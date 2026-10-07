# ChatGPT plugin — intent eval set

Primary trigger: **"is my data healthy?"**

Tool under test: `health_check` on `POST /mcp` (Streamable HTTP).

Pass criteria per prompt:

1. Plugin / tool is selected when it should be (or correctly skipped).
2. Arguments are reasonable (empty/`demo:true` OK when no credentials).
3. Response completes with a score or labelled demo (no crash / empty tool error).
4. No checkout / payment flow is initiated in chat.

Record: date, ChatGPT build, pass/fail, notes (selection precision & arg accuracy).

## Direct (should call `health_check`)

| # | Prompt | Expect |
| --- | --- | --- |
| D1 | Is my data healthy? | Call `health_check` (demo OK). |
| D2 | How healthy is our sales schema? | Call; may ask for FQN / use demo. |
| D3 | Score this DataHub dataset for health. | Call; may request `datahub` block. |
| D4 | Any stale or ownerless tables I should worry about? | Call `health_check`. |
| D5 | Run a quick data health check on the demo schema. | Call with `demo: true` or `{}`. |
| D6 | What's our warehouse health score out of 100? | Call `health_check`. |

## Indirect (should still select)

| # | Prompt | Expect |
| --- | --- | --- |
| I1 | Our Looker dashboards feel wrong — is the underlying data rotting? | Call `health_check` (or ask once, then call). |
| I2 | Before the exec review, can you sanity-check the catalogue? | Call `health_check`. |
| I3 | We connected OpenMetadata last week — give me a health readout. | Call; may ask for URL/token then call. |
| I4 | Uniswap subgraph freshness — anything critical? | Call (the-graph / demo OK). |

## Negative (must NOT call, or must refuse paid/checkout)

| # | Prompt | Expect |
| --- | --- | --- |
| N1 | Buy me a narrated DataBard briefing right here. | No checkout; may mention `/pro` informationally. |
| N2 | Subscribe me to DataBard Pro in this chat. | No subscribe/checkout. |
| N3 | Pay 1 USDT via x402 for a podcast. | Point to product URL; do not take payment in-plugin. |
| N4 | Write ownership tags back into our DataHub. | Out of ChatGPT free set (`write_back` is REST-only). |
| N5 | Which OKX marketplace agent should I pay? | Out of scope for `health_check` (Probe / service_score). |

## Ambiguous / edge

| # | Prompt | Expect |
| --- | --- | --- |
| A1 | Is my data OK? | Prefer `health_check` or one clarifying question then call. |
| A2 | Healthy? | Too vague — clarify *data/catalogue* before calling, or call demo with confirmation. |
| A3 | Audit this PDF for claims. | Do **not** select DataBard (wrong product). |
| A4 | Is Postgres up? | Infra uptime ≠ catalogue health — clarify or skip. |
| A5 | Give me the briefing audio for db.sales. | Informational plans / product link; no in-chat TTS checkout. |

## Latency / reliability checks

| # | Check | Pass |
| --- | --- | --- |
| R1 | `tools/list` after `initialize` returns `health_check` with `readOnlyHint: true` | |
| R2 | `tools/call` with `{"demo":true}` returns summary + keyFindings within ~5s local | |
| R3 | Empty arguments `{}` still returns labelled demo (HTTP/MCP success) | |
| R4 | Invalid tool name returns MCP error, not server 500 | |

## Scorecard (fill when running)

| Metric | Target | Actual |
| --- | --- | --- |
| Direct selection recall (D*) | ≥ 5/6 | |
| Indirect selection recall (I*) | ≥ 3/4 | |
| Negative precision (N* no bad action) | 5/5 | |
| Arg accuracy on demo calls | ≥ 90% | |
| p95 tool latency (demo) | &lt; 5s local / &lt; 8s prod | |

Related: [CHATGPT_PLUGIN_CONNECT.md](./CHATGPT_PLUGIN_CONNECT.md), [CHATGPT_PLUGIN_STARTER_PROMPTS.md](./CHATGPT_PLUGIN_STARTER_PROMPTS.md), [CHATGPT_PLUGIN_PLAYBOOK.md](./CHATGPT_PLUGIN_PLAYBOOK.md).
