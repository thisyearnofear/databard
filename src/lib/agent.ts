/**
 * AI Agent — browser automation for investigating and resolving data issues.
 * Abstracts multiple providers (TinyFish, Browser Use, agent-browser) behind
 * a single interface for goal-based web tasks.
 *
 * Used by: /api/investigate (research action items), /api/synthesize (TTS fallback)
 */
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type AgentProvider = "tinyfish" | "browser-use" | "agent-browser" | "none";

interface AgentResult {
  success: boolean;
  content: string;
  source?: string;
  provider: AgentProvider;
}

/** Check which agent providers are available */
export async function getAvailableAgents(): Promise<Record<AgentProvider, boolean>> {
  const results: Record<AgentProvider, boolean> = {
    tinyfish: !!process.env.TINYFISH_API_KEY,
    "browser-use": !!process.env.BROWSER_USE_API_KEY,
    "agent-browser": false,
    none: true,
  };

  try {
    await execAsync("agent-browser --version");
    results["agent-browser"] = true;
  } catch { /* not installed */ }

  return results;
}

/** Get the best available agent provider */
export async function getBestAgent(): Promise<AgentProvider> {
  const agents = await getAvailableAgents();
  if (agents.tinyfish) return "tinyfish";
  if (agents["browser-use"]) return "browser-use";
  if (agents["agent-browser"]) return "agent-browser";
  return "none";
}

/** Execute a goal-based web task using the best available agent */
export async function executeGoal(goal: string, url?: string): Promise<AgentResult> {
  const provider = await getBestAgent();

  if (provider === "none") {
    return { success: false, content: "No AI agent available. Configure TINYFISH_API_KEY or BROWSER_USE_API_KEY to enable investigation.", provider };
  }

  if (provider === "tinyfish") return tinyfishGoal(goal, url);
  if (provider === "browser-use") return browserUseGoal(goal, url);
  if (provider === "agent-browser") return agentBrowserGoal(goal, url);

  return { success: false, content: "Unknown provider", provider };
}

async function tinyfishGoal(goal: string, url?: string): Promise<AgentResult> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) return { success: false, content: "TINYFISH_API_KEY not set", provider: "tinyfish" };

  const response = await fetch("https://agent.tinyfish.ai/v1/automation/run", {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url || "https://www.google.com",
      goal,
      browser_profile: "lite",
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, content: `TinyFish error (${response.status}): ${text}`, provider: "tinyfish" };
  }

  const result = await response.json();

  if (result.status === "FAILED") {
    return { success: false, content: result.error?.message || "Automation failed", provider: "tinyfish" };
  }

  // Extract text content from result
  const content = typeof result.result === "string"
    ? result.result
    : result.result?.text || result.result?.content || JSON.stringify(result.result);

  return { success: true, content, source: url, provider: "tinyfish" };
}

async function browserUseGoal(goal: string, url?: string): Promise<AgentResult> {
  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) return { success: false, content: "BROWSER_USE_API_KEY not set", provider: "browser-use" };

  const sessionRes = await fetch("https://api.browser-use.com/v1/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: url || "https://www.google.com", timeout: 60000 }),
    signal: AbortSignal.timeout(60000),
  });

  if (!sessionRes.ok) {
    return { success: false, content: `Browser Use error: ${sessionRes.statusText}`, provider: "browser-use" };
  }

  const { sessionId } = await sessionRes.json();

  try {
    const evalRes = await fetch(`https://api.browser-use.com/v1/sessions/${sessionId}/execute`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "evaluate", script: `document.body.innerText` }),
    });
    const result = await evalRes.json();
    return { success: true, content: result.value || "No content extracted", source: url, provider: "browser-use" };
  } finally {
    fetch(`https://api.browser-use.com/v1/sessions/${sessionId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  }
}

async function agentBrowserGoal(goal: string, url?: string): Promise<AgentResult> {
  try {
    if (url) await execAsync(`agent-browser open ${url}`);
    await execAsync("agent-browser wait 3000");
    const { stdout } = await execAsync(`agent-browser eval "document.body.innerText.slice(0, 2000)"`);
    return { success: true, content: stdout.trim(), source: url, provider: "agent-browser" };
  } catch (e) {
    return { success: false, content: e instanceof Error ? e.message : "Agent browser failed", provider: "agent-browser" };
  }
}

/** Human-readable provider info */
export const AGENT_INFO: Record<AgentProvider, { name: string; description: string; setup: string }> = {
  tinyfish: { name: "TinyFish AI", description: "Cloud AI agent — investigates issues using natural language goals", setup: "Set TINYFISH_API_KEY in your environment" },
  "browser-use": { name: "Browser Use", description: "Cloud browser automation — navigates docs and tools programmatically", setup: "Set BROWSER_USE_API_KEY in your environment" },
  "agent-browser": { name: "Agent Browser", description: "Local browser agent — fast, free, runs on your machine", setup: "npm install -g agent-browser && agent-browser install" },
  none: { name: "None", description: "No agent configured — action items are informational only", setup: "Configure any agent provider to enable investigation" },
};
