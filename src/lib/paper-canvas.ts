/**
 * Paper Canvas integration — renders schema health dashboards
 * on a Paper.design canvas via MCP tool calls.
 *
 * Generates a visual companion to the audio episode:
 * - Health score ring
 * - Coverage bars
 * - Critical tables with risk indicators
 * - Action items as interactive cards
 * - Lineage hotspot visualization
 */
import type { Episode } from "./types";
import type { SchemaInsights, ActionItem } from "./schema-analysis";

const PAPER_MCP_URL = "http://127.0.0.1:29979/mcp";

/** Call a Paper MCP tool */
async function callPaperTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(PAPER_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`Paper MCP error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Paper tool error: ${data.error.message}`);
  return data.result;
}

/** Check if Paper Desktop is running and MCP is available */
export async function isPaperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(PAPER_MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Generate the health score ring SVG */
function healthScoreRing(score: number, label: string): string {
  const color = score >= 70 ? "#5bf58c" : score >= 40 ? "#eab308" : "#f55b5b";
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#2a2a3a" stroke-width="8"/>
        <circle cx="50" cy="50" r="45" fill="none" stroke="${color}" stroke-width="8"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 50 50)"/>
        <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
          font-size="28" font-weight="bold" fill="${color}">${score}</text>
      </svg>
      <span style="font-size:12px;color:#8888a0;font-weight:500;">${label}</span>
    </div>
  `;
}

/** Generate a coverage bar */
function coverageBar(label: string, pct: number, color: string): string {
  return `
    <div style="display:flex;flex-direction:column;gap:4px;width:100%;">
      <div style="display:flex;justify-content:space-between;font-size:11px;">
        <span style="color:#8888a0;">${label}</span>
        <span style="color:#e4e4ef;font-weight:500;">${pct}%</span>
      </div>
      <div style="height:6px;background:#2a2a3a;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;"></div>
      </div>
    </div>
  `;
}

/** Generate a critical table card */
function criticalTableCard(name: string, failing: number, downstream: number, risk: string): string {
  const riskColor = risk === "critical" ? "#f55b5b" : risk === "high" ? "#eab308" : "#7c5bf5";
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#14141f;border:1px solid #2a2a3a;border-radius:8px;border-left:3px solid ${riskColor};">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:#e4e4ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
        <div style="font-size:10px;color:#8888a0;margin-top:2px;">
          ${failing > 0 ? `${failing} failing` : "untested"}${downstream > 0 ? ` · ${downstream} downstream` : ""}
        </div>
      </div>
      <span style="font-size:9px;padding:2px 6px;border-radius:10px;background:${riskColor}20;color:${riskColor};font-weight:500;">${risk}</span>
    </div>
  `;
}

/** Generate an action item card */
function actionCard(item: ActionItem): string {
  const colors: Record<string, string> = { critical: "#f55b5b", high: "#eab308", medium: "#3b82f6", low: "#8888a0" };
  const color = colors[item.priority] ?? "#8888a0";
  return `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:#14141f;border:1px solid #2a2a3a;border-radius:8px;">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};margin-top:4px;flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:600;color:#e4e4ef;">${item.title}</div>
        <div style="font-size:10px;color:#8888a0;margin-top:2px;">${item.description.slice(0, 80)}${item.description.length > 80 ? "…" : ""}</div>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#2a2a3a;color:#8888a0;">${item.category}</span>
          <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#2a2a3a;color:#8888a0;">~${item.effort}</span>
        </div>
      </div>
    </div>
  `;
}

/** Render a full schema health dashboard on the Paper canvas */
export async function renderHealthDashboard(
  episode: Episode,
  insights: SchemaInsights,
  actionItems: ActionItem[],
): Promise<{ artboardId: string }> {
  // Create the artboard
  const artboard = await callPaperTool("create_artboard", {
    name: `DataBard: ${episode.schemaName}`,
    styles: {
      width: "1440px",
      height: "900px",
      backgroundColor: "#0a0a0f",
      padding: "40px",
      display: "flex",
      flexDirection: "column",
      gap: "24px",
    },
  }) as { nodeId: string };

  const artboardId = artboard.nodeId;

  // ── Header ──
  await callPaperTool("write_html", {
    targetNodeId: artboardId,
    mode: "insert-children",
    html: `
      <div layer-name="Header" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:24px;">🎙️</span>
          <div>
            <div style="font-size:20px;font-weight:700;color:#e4e4ef;">DataBard: ${episode.schemaName}</div>
            <div style="font-size:12px;color:#8888a0;">${episode.tableCount} tables · ${episode.qualitySummary.total} tests · Generated ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;padding:4px 10px;border-radius:6px;background:#7c5bf520;color:#7c5bf5;font-weight:500;">Health Report</span>
        </div>
      </div>
    `,
  });

  // ── Top row: Health Score + Coverage + Stats ──
  await callPaperTool("write_html", {
    targetNodeId: artboardId,
    mode: "insert-children",
    html: `
      <div layer-name="Metrics" style="display:flex;gap:24px;align-items:stretch;">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;min-width:180px;">
          ${healthScoreRing(insights.healthScore, insights.healthLabel)}
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;flex:1;padding:24px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;justify-content:center;">
          ${coverageBar("Test Coverage", insights.testCoverage, "#7c5bf5")}
          ${coverageBar("Documentation", insights.docCoverage, "#5bf58c")}
        </div>
        <div style="display:flex;gap:12px;">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 24px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;">
            <div style="font-size:28px;font-weight:700;color:${insights.failingTests > 0 ? "#f55b5b" : "#5bf58c"};">${insights.failingTests}</div>
            <div style="font-size:10px;color:#8888a0;margin-top:4px;">Failing Tests</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 24px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;">
            <div style="font-size:28px;font-weight:700;color:#e4e4ef;">${insights.untestedTables.length}</div>
            <div style="font-size:10px;color:#8888a0;margin-top:4px;">Untested</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 24px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;">
            <div style="font-size:28px;font-weight:700;color:#e4e4ef;">${insights.ownerlessTables.length}</div>
            <div style="font-size:10px;color:#8888a0;margin-top:4px;">No Owner</div>
          </div>
        </div>
      </div>
    `,
  });

  // ── Bottom row: Critical Tables + Action Items ──
  const criticalHtml = insights.criticalTables.length > 0
    ? insights.criticalTables.slice(0, 6).map((ct) =>
        criticalTableCard(ct.table.name, ct.failingTests, ct.downstreamCount, ct.risk)
      ).join("")
    : `<div style="padding:20px;text-align:center;color:#5bf58c;font-size:12px;">✓ No critical tables</div>`;

  const actionsHtml = actionItems.length > 0
    ? actionItems.slice(0, 5).map((item) => actionCard(item)).join("")
    : `<div style="padding:20px;text-align:center;color:#5bf58c;font-size:12px;">🎉 No action items needed</div>`;

  await callPaperTool("write_html", {
    targetNodeId: artboardId,
    mode: "insert-children",
    html: `
      <div layer-name="Details" style="display:flex;gap:24px;flex:1;">
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;padding:20px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;overflow:hidden;">
          <div style="font-size:13px;font-weight:600;color:#e4e4ef;margin-bottom:4px;">Critical Tables</div>
          ${criticalHtml}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;padding:20px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;overflow:hidden;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <div style="font-size:13px;font-weight:600;color:#e4e4ef;">Action Items</div>
            <span style="font-size:10px;color:#8888a0;">${actionItems.length} total</span>
          </div>
          ${actionsHtml}
        </div>
      </div>
    `,
  });

  // ── Lineage hotspots row ──
  if (insights.lineageHotspots.length > 0) {
    const hotspotsHtml = insights.lineageHotspots.map((h) => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;">
        <div style="width:${Math.min(40, 10 + h.connections * 4)}px;height:${Math.min(40, 10 + h.connections * 4)}px;border-radius:50%;background:#7c5bf520;border:2px solid #7c5bf5;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:10px;font-weight:700;color:#7c5bf5;">${h.connections}</span>
        </div>
        <span style="font-size:11px;color:#e4e4ef;font-weight:500;">${h.name}</span>
      </div>
    `).join("");

    await callPaperTool("write_html", {
      targetNodeId: artboardId,
      mode: "insert-children",
      html: `
        <div layer-name="Lineage" style="display:flex;align-items:center;gap:12px;padding:16px 20px;background:#14141f;border:1px solid #2a2a3a;border-radius:12px;">
          <div style="font-size:12px;font-weight:600;color:#8888a0;white-space:nowrap;">Lineage Hotspots</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${hotspotsHtml}
          </div>
        </div>
      `,
    });
  }

  // Mark as done
  await callPaperTool("finish_working_on_nodes", {});

  return { artboardId };
}
