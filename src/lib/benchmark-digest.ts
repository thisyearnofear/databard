/**
 * Weekly benchmark digest ("one metric vs your category, every Monday").
 * Reads leads.json for monday:benchmark:<category> signups, pulls one
 * category stat via Tavily per unique category, sends the micro-verdict.
 */
import { promises as fs } from "fs";
import path from "path";
import { getDataPath } from "./data-dir";
import { sendBenchmarkEmail } from "./notifications";

const LEADS_FILE = getDataPath("leads.json");
const PREFIX = "monday:benchmark:";

interface Lead { email: string; source: string }

async function benchmarkSubscribers(): Promise<{ category: string; emails: string[] }[]> {
  let leads: Lead[] = [];
  try {
    leads = JSON.parse(await fs.readFile(LEADS_FILE, "utf-8"));
  } catch { /* no file */ }
  const byCat = new Map<string, string[]>();
  for (const l of leads) {
    if (!l.source?.startsWith(PREFIX)) continue;
    const cat = l.source.slice(PREFIX.length);
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(l.email);
  }
  return [...byCat.entries()].map(([category, emails]) => ({ category, emails: [...new Set(emails)] }));
}

async function fetchStat(category: string): Promise<{ metric: string; claim: string; source: string } | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: `${category} ecommerce benchmark statistic conversion review rate 2026`,
        max_results: 1,
        search_depth: "basic",
        include_answer: true,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { answer?: string; results?: { title?: string; url?: string }[] };
    const r = d.results?.[0];
    if (!r?.url) return null;
    return { metric: r.title ?? `${category} benchmark`, claim: (d.answer ?? "").slice(0, 300), source: r.url };
  } catch { return null; }
}

export async function sendWeeklyBenchmarks(): Promise<{ sent: number; skipped: number; categories: number }> {
  const groups = await benchmarkSubscribers();
  let sent = 0;
  let skipped = 0;
  for (const { category, emails } of groups) {
    const stat = await fetchStat(category);
    for (const email of emails) {
      if (!stat) { skipped++; continue; }
      const res = await sendBenchmarkEmail({ email, category, ...stat });
      res.sent ? sent++ : skipped++;
    }
  }
  return { sent, skipped, categories: groups.length };
}
