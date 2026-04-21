import { NextResponse } from "next/server";
import { getAvailableAgents, getBestAgent, AGENT_INFO } from "@/lib/agent";

/**
 * Check AI agent capabilities — which providers are available
 * for investigating and resolving data quality issues.
 */
export async function GET() {
  try {
    const agents = await getAvailableAgents();
    const best = await getBestAgent();

    const available = Object.entries(agents)
      .filter(([name, ok]) => ok && name !== "none")
      .map(([name]) => ({ id: name, ...AGENT_INFO[name as keyof typeof AGENT_INFO] }));

    return NextResponse.json({
      ok: true,
      agents,
      available,
      activeProvider: best,
      canInvestigate: best !== "none" || !!process.env.OPENAI_API_KEY,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
