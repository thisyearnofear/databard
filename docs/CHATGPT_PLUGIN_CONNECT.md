# ChatGPT plugin — connect DataBard MCP

Streamable HTTP MCP endpoint (free `health_check` tool):

| Environment | URL |
| --- | --- |
| Production | `https://databard.persidian.com/mcp` |
| Local | `http://localhost:3000/mcp` |

Existing OKX A2MCP REST tools remain at `/api/mcp/*` (see README). ChatGPT should use **`/mcp`**, not the REST paths.

## What is exposed in ChatGPT

| Tool | Free? | Notes |
| --- | --- | --- |
| `health_check` | Yes | Read-only (`readOnlyHint: true`). Alias accepted on call: `is_my_data_healthy`, `databard_health_check`. |
| Briefing / x402 | No (not in this surface) | Narrated briefing stays on product URLs. Tool results may link to `/pro` as **informational** upgrade guidance. No in-plugin checkout. |

## Connect in ChatGPT

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins) → add a **custom MCP server**.
2. Server URL: `https://databard.persidian.com/mcp` (or your tunnel / local URL while developing).
3. Auth: none required for the free health check (demo path works with `{}` / `demo: true`).
4. Install / enable the plugin and try a starter prompt from [CHATGPT_PLUGIN_STARTER_PROMPTS.md](./CHATGPT_PLUGIN_STARTER_PROMPTS.md).

Domain verification and privacy policy (`/privacy`) are required for public directory submission — see [CHATGPT_PLUGIN_PLAYBOOK.md](./CHATGPT_PLUGIN_PLAYBOOK.md).

## Connect with MCP Inspector (local)

```bash
npm run dev
# other terminal:
npx @modelcontextprotocol/inspector
```

In the Inspector UI: choose **Streamable HTTP** → `http://localhost:3000/mcp` → Connect.

Smoke with curl (initialize → list → call):

```bash
# 1) initialize
curl -s http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# 2) notifications/initialized (expects HTTP 202, empty body)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3) tools/list
curl -s http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 4) tools/call — labelled demo (no credentials)
curl -s http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"health_check","arguments":{"demo":true}}}'
```

## Architecture (repo)

```
/mcp                          ← Streamable HTTP MCP (ChatGPT)
  └─ health_check             ← wraps src/lib/mcp-health-check.ts

/api/mcp/health-check         ← same runner, x402 upgrade payload (OKX A2MCP)
/api/mcp/briefing             ← paid product URL (not ChatGPT free set)
/api/mcp/tools                ← REST discovery for marketplace agents
```

## Monetization boundary

OpenAI allows plugin commerce for **physical goods** only. DataBard keeps:

- Free discovery in ChatGPT (`health_check`)
- Paid briefing / x402 on **our** product URLs (`/pro`, `/api/mcp/briefing`)
- Informational plans links only inside ChatGPT — never checkout

See playbook: [CHATGPT_PLUGIN_PLAYBOOK.md](./CHATGPT_PLUGIN_PLAYBOOK.md).
