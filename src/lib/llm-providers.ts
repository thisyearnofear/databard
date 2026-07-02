/**
 * LLM provider fallback chain for the app runtime.
 *
 * Mirrors scripts/loop/providers.mjs but as TypeScript for Next.js app imports. The two files
 * intentionally speak the same env vars + fallback order so operators only configure one set
 * of keys.
 *
 * Order (configurable via LOOP_PROVIDER_ORDER):
 *   1. Venice — fastest, tried first
 *   2. NVIDIA NIM — OSS model fallback
 *   3. Anthropic — last-resort
 *
 * All providers expose the same async shape:
 *   chat({ system, user, maxTokens }) => Promise<string>
 *
 * `chatFallback` walks the chain and returns the first non-error response.
 */
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_ORDER = ["venice", "nvidia", "anthropic"];

export interface ChatInput {
  system: string;
  user: string;
  maxTokens: number;
}

interface ProviderConfig {
  name: string;
  envKey: string;
  defaultModel: string;
  chat: (input: ChatInput) => Promise<string>;
}

async function openaiCompatChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: ChatInput,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("empty response");
  return text;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  venice: {
    name: "venice",
    envKey: "VENICE_API_KEY",
    defaultModel: process.env.LOOP_VENICE_MODEL ?? "venice-uncensored",
    async chat(input) {
      return openaiCompatChat(
        "https://api.venice.ai/api/v1",
        process.env.VENICE_API_KEY!,
        this.defaultModel,
        input,
      );
    },
  },
  nvidia: {
    name: "nvidia",
    envKey: "NVIDIA_NIM_API_KEY",
    defaultModel: process.env.LOOP_NVIDIA_MODEL ?? "openai/gpt-oss-20b",
    async chat(input) {
      return openaiCompatChat(
        "https://integrate.api.nvidia.com/v1",
        process.env.NVIDIA_NIM_API_KEY!,
        this.defaultModel,
        input,
      );
    },
  },
  anthropic: {
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: process.env.LOOP_ANTHROPIC_MODEL ?? "claude-opus-4-7",
    async chat(input) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: this.defaultModel,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      });
      return response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    },
  },
};

function orderedEnabled(): ProviderConfig[] {
  const order = (process.env.LOOP_PROVIDER_ORDER ?? DEFAULT_ORDER.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const out: ProviderConfig[] = [];
  for (const name of order) {
    const p = PROVIDERS[name];
    if (!p) continue;
    if (!process.env[p.envKey]) continue;
    out.push(p);
  }
  return out;
}

export function isLlmConfigured(): boolean {
  return orderedEnabled().length > 0;
}

/** Walk the provider chain; return the first successful response along with the winning name. */
export async function chatFallback(
  input: ChatInput,
): Promise<{ text: string; provider: string } | null> {
  const providers = orderedEnabled();
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const text = await p.chat(input);
      if (text && text.trim().length > 0) return { text: text.trim(), provider: p.name };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${p.name}: ${msg.slice(0, 200)}`);
    }
  }
  if (errors.length > 0) console.warn("[llm-providers] all providers failed:", errors.join(" | "));
  return null;
}
