import { NextRequest, NextResponse } from "next/server";
import { analyzeSchema, generateActionItems } from "@/lib/schema-analysis";
import { buildDashboardHtml } from "@/lib/paper-canvas";
import type { Episode } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { episode } = (await req.json()) as { episode: Episode };

    if (!episode?.schemaMeta) {
      return NextResponse.json({ ok: false, error: "No schema metadata on episode" }, { status: 400 });
    }

    const insights = analyzeSchema(episode.schemaMeta);
    const actionItems = generateActionItems(insights);
    const html = buildDashboardHtml(episode, insights, actionItems);

    // Lazy-load Puppeteer so it doesn't affect cold-start for other routes
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1440, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdf = await page.pdf({
        width: "1440px",
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      return new NextResponse(Buffer.from(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="databard-${episode.schemaName}-report.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[canvas/export]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
