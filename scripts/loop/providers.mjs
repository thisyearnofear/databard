/**
 * Provider fallback chain for the loop's fixer.
 *
 * Order of preference (configurable via LOOP_PROVIDER_ORDER env var):
 *   1. Venice — fast, permissive, cheap to try first
 *   2. NVIDIA NIM — deep bench of code-tuned OSS models
 *   3. Anthropic — reliable last-resort for strict-JSON patches
 *
 * Every provider exposes the same async `chat({ system, user, maxTokens })` shape and
 * returns a raw text response. Fallback triggers on HTTP error, empty response, or
 * downstream JSON-validation failure at the fixer level.
 */
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_ORDER = ["venice", "nvidia", "anthropic"];

/**
 * OpenAI-compatible chat completion. Venice and NVIDIA both speak this dialect.
 */
async function openaiCompatChat({ baseUrl, apiKey, model, system, user, maxTokens }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`empty response body: ${JSON.stringify(json).slice(0, 500)}`);
  return text;
}

const PROVIDERS = {
  venice: {
    name: "venice",
    envKey: "VENICE_API_KEY",
    defaultModel: "venice-uncensored",
    async chat(args) {
      return openaiCompatChat({
        baseUrl: "https://api.venice.ai/api/v1",
        apiKey: process.env.VENICE_API_KEY,
        model: process.env.LOOP_VENICE_MODEL ?? this.defaultModel,
        ...args,
      });
    },
  },
  nvidia: {
    name: "nvidia",
    envKey: "NVIDIA_NIM_API_KEY",
    defaultModel: "openai/gpt-oss-20b",
    async chat(args) {
      return openaiCompatChat({
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_NIM_API_KEY,
        model: process.env.LOOP_NVIDIA_MODEL ?? this.defaultModel,
        ...args,
      });
    },
  },
  anthropic: {
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-4-7",
    async chat(args) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: process.env.LOOP_ANTHROPIC_MODEL ?? this.defaultModel,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      });
      return response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    },
  },
};

/**
 * Iterate providers in order, yield { name, chat } for each one that has a key configured.
 */
export function* enabledProviders() {
  const order = (process.env.LOOP_PROVIDER_ORDER ?? DEFAULT_ORDER.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  for (const name of order) {
    const p = PROVIDERS[name];
    if (!p) continue;
    if (!process.env[p.envKey]) continue;
    yield {
      name: p.name,
      model: process.env[`LOOP_${p.name.toUpperCase()}_MODEL`] ?? p.defaultModel,
      chat: p.chat.bind(p),
    };
  }
}

/** For diagnostics — list all configured providers without invoking. */
export function listConfigured() {
  const results = [];
  for (const p of enabledProviders()) results.push(`${p.name} (${p.model})`);
  return results;
}
