/**
 * Paper Canvas integration — renders multi-slide schema health dashboards
 * on a Paper.design canvas via MCP tool calls.
 *
 * Generates 3 slides as a visual companion to the audio episode:
 * 1. Overview — health score, coverage bars, key stats
 * 2. Critical Tables & Actions — risk-ranked tables + prioritized action items
 * 3. Lineage & Ownership — data flow visualization + team accountability
 *
 * Design system: Space Grotesk (display), Inter (body), JetBrains Mono (data)
 * Palette: terminal mood — deep black, phosphor green, DataBard purple accent
 */
import type { Episode } from "./types";
import type { SchemaInsights, ActionItem } from "./schema-analysis";

const PAPER_MCP_URL = "http://127.0.0.1:29979/mcp";

// ── Design tokens ──
const C = {
  bg: "#08080C", surface: "#12121A", card: "#1E1E2A", border: "#2a2a3a",
  text: "#E4E4EF", muted: "#8888A0", dim: "#555570",
  accent: "#7C5BF5", success: "#5BF58C", danger: "#F55B5B", warn: "#eab308", info: "#3b82f6",
} as const;

const ARTBOARD_STYLES = {
  backgroundColor: C.bg, display: "flex", flexDirection: "column",
  fontFamily: "Inter", gap: "32px", height: "fit-content",
  padding: "48px 56px", width: "1440px",
} as const;

/** Call a Paper MCP tool */
async function call(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(PAPER_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }),
  });
  if (!res.ok) throw new Error(`Paper MCP error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Paper tool error: ${data.error.message}`);
  return data.result;
}

async function html(targetNodeId: string, content: string) {
  await call("write_html", { targetNodeId, mode: "insert-children", html: content });
}

/** Check if Paper Desktop is running */
export async function isPaperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(PAPER_MCP_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch { return false; }
}

// ── Helpers ──

function riskColor(risk: string): string {
  return risk === "critical" ? C.danger : risk === "high" ? C.warn : C.accent;
}

function priorityColor(p: string): string {
  return p === "critical" ? C.danger : p === "high" ? C.warn : p === "medium" ? C.info : C.muted;
}

function scoreColor(score: number): string {
  return score >= 70 ? C.success : score >= 40 ? C.warn : C.danger;
}

// ── Slide 1: Overview ──

async function renderOverview(episode: Episode, insights: SchemaInsights): Promise<string> {
  const { nodeId } = await call("create_artboard", { name: `DataBard — Overview`, styles: ARTBOARD_STYLES }) as { nodeId: string };
  const sc = scoreColor(insights.healthScore);
  const circ = 2 * Math.PI * 42;
  const offset = circ - (insights.healthScore / 100) * circ;
  const testedCount = episode.tableCount - insights.untestedTables.length;
  const undocCount = insights.undocumentedTables.length;

  // Header
  await html(nodeId, `
    <div layer-name="Header" style="display:flex;align-items:baseline;justify-content:space-between;">
      <div style="display:flex;align-items:baseline;gap:12px;">
        <span style="font-family:'Space Grotesk';font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">DataBard</span>
        <span style="font-family:'JetBrains Mono';font-size:12px;color:${C.muted};">${episode.schemaName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="font-family:'JetBrains Mono';font-size:11px;color:${C.muted};">${episode.tableCount} tables · ${episode.qualitySummary.total} tests</span>
        <span style="font-family:'JetBrains Mono';font-size:11px;color:${C.dim};">${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </div>
  `);

  // Hero score
  const summaryText = [
    insights.failingTests > 0 ? `${insights.failingTests} failing tests across ${insights.criticalTables.filter(c => c.failingTests > 0).length} critical tables with downstream dependents.` : "",
    `${insights.docCoverage}% documentation coverage.`,
    insights.untestedTables.length > 0 ? `${insights.untestedTables.length} tables have no quality tests configured.` : "",
  ].filter(Boolean).join(" ");

  await html(nodeId, `
    <div layer-name="Hero Score" style="display:flex;align-items:center;gap:48px;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <svg width="180" height="180" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="${C.card}" stroke-width="6"/>
          <circle cx="50" cy="50" r="42" fill="none" stroke="${sc}" stroke-width="6" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 50 50)"/>
          <text x="50" y="46" text-anchor="middle" dominant-baseline="central" font-family="Space Grotesk" font-size="32" font-weight="700" fill="${sc}">${insights.healthScore}</text>
          <text x="50" y="64" text-anchor="middle" font-family="Inter" font-size="8" fill="${C.muted}">of 100</text>
        </svg>
        <span style="font-family:'JetBrains Mono';font-size:11px;font-weight:500;color:${sc};letter-spacing:0.08em;text-transform:uppercase;">${insights.healthLabel}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:24px;flex:1;">
        <div style="font-family:'Space Grotesk';font-size:40px;font-weight:700;color:${C.text};letter-spacing:-0.03em;line-height:1.1;">Schema health${insights.healthLabel === "healthy" ? "<br/>looking good" : insights.healthLabel === "at-risk" ? "<br/>needs attention" : "<br/>critical issues"}</div>
        <div style="font-family:'Inter';font-size:14px;color:${C.muted};line-height:1.6;max-width:480px;">${summaryText}</div>
      </div>
    </div>
  `);

  // Coverage bars
  await html(nodeId, `
    <div layer-name="Coverage" style="display:flex;gap:20px;">
      <div style="flex:1;display:flex;flex-direction:column;gap:16px;padding:28px;background:${C.surface};border-radius:12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-family:'Inter';font-size:12px;font-weight:500;color:${C.muted};">Test Coverage</span>
          <span style="font-family:'JetBrains Mono';font-size:24px;font-weight:700;color:${C.accent};">${insights.testCoverage}%</span>
        </div>
        <div style="height:4px;background:${C.card};border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${insights.testCoverage}%;background:${C.accent};border-radius:2px;"></div>
        </div>
        <span style="font-family:'Inter';font-size:11px;color:${C.dim};">${testedCount} of ${episode.tableCount} tables have tests</span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:16px;padding:28px;background:${C.surface};border-radius:12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-family:'Inter';font-size:12px;font-weight:500;color:${C.muted};">Documentation</span>
          <span style="font-family:'JetBrains Mono';font-size:24px;font-weight:700;color:${C.success};">${insights.docCoverage}%</span>
        </div>
        <div style="height:4px;background:${C.card};border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${insights.docCoverage}%;background:${C.success};border-radius:2px;"></div>
        </div>
        <span style="font-family:'Inter';font-size:11px;color:${C.dim};">${undocCount} tables missing descriptions</span>
      </div>
    </div>
  `);

  // Stats row
  const stats = [
    { value: insights.failingTests, label: "Failing Tests", sub: `across ${insights.criticalTables.filter(c => c.failingTests > 0).length} tables`, color: insights.failingTests > 0 ? C.danger : C.success },
    { value: insights.untestedTables.length, label: "Untested Tables", sub: "no quality checks", color: C.text },
    { value: insights.ownerlessTables.length, label: "No Owner", sub: "unassigned tables", color: C.text },
    { value: insights.passingTests, label: "Passing Tests", sub: "all green", color: C.success },
  ];

  await html(nodeId, `
    <div layer-name="Stats" style="display:flex;gap:20px;">
      ${stats.map(s => `
        <div style="flex:1;padding:24px 28px;background:${C.surface};border-radius:12px;display:flex;align-items:baseline;gap:12px;">
          <span style="font-family:'JetBrains Mono';font-size:36px;font-weight:700;color:${s.color};">${s.value}</span>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span style="font-family:'Inter';font-size:13px;font-weight:500;color:${C.text};">${s.label}</span>
            <span style="font-family:'Inter';font-size:11px;color:${C.dim};">${s.sub}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `);

  return nodeId;
}

// ── Slide 2: Critical Tables & Actions ──

async function renderCriticalAndActions(episode: Episode, insights: SchemaInsights, actionItems: ActionItem[]): Promise<string> {
  const { nodeId } = await call("create_artboard", { name: `DataBard — Critical Tables & Actions`, styles: ARTBOARD_STYLES }) as { nodeId: string };

  // Critical tables header
  await html(nodeId, `
    <div layer-name="Critical Header" style="display:flex;align-items:baseline;justify-content:space-between;">
      <div style="display:flex;align-items:baseline;gap:12px;">
        <span style="font-family:'Space Grotesk';font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Critical Tables</span>
        <span style="font-family:'JetBrains Mono';font-size:12px;color:${C.danger};">${insights.criticalTables.length} at risk</span>
      </div>
      <span style="font-family:'JetBrains Mono';font-size:11px;color:${C.dim};">sorted by cascading risk</span>
    </div>
  `);

  // Table column headers
  await html(nodeId, `
    <div layer-name="Table Header" style="display:flex;padding:0 28px 12px;gap:16px;">
      <span style="width:140px;font-family:'JetBrains Mono';font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Table</span>
      <span style="width:80px;font-family:'JetBrains Mono';font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Risk</span>
      <span style="width:100px;font-family:'JetBrains Mono';font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Failing</span>
      <span style="width:100px;font-family:'JetBrains Mono';font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Downstream</span>
      <span style="flex:1;font-family:'JetBrains Mono';font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;">Impact</span>
    </div>
  `);

  // Table rows
  for (const ct of insights.criticalTables.slice(0, 5)) {
    const rc = riskColor(ct.risk);
    const failText = ct.failingTests > 0 ? `${ct.failingTests} test${ct.failingTests > 1 ? "s" : ""}` : "untested";
    const downText = ct.downstreamCount > 0 ? `${ct.downstreamCount} table${ct.downstreamCount > 1 ? "s" : ""}` : "—";
    const impact = ct.failingTests > 0 && ct.downstreamCount > 0
      ? `Failures cascade to ${ct.downstreamCount} downstream dependents`
      : ct.failingTests === 0 ? "No tests configured — silent failures possible" : "Test failures need investigation";

    await html(nodeId, `
      <div layer-name="Row: ${ct.table.name}" style="display:flex;align-items:center;padding:16px 28px;gap:16px;background:${C.surface};border-radius:10px;border-left:3px solid ${rc};">
        <span style="width:140px;font-family:'JetBrains Mono';font-size:13px;font-weight:600;color:${C.text};flex-shrink:0;">${ct.table.name}</span>
        <span style="width:80px;font-family:'JetBrains Mono';font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;background:${rc}18;color:${rc};flex-shrink:0;text-align:center;">${ct.risk}</span>
        <span style="width:100px;font-family:'JetBrains Mono';font-size:13px;color:${ct.failingTests > 0 ? rc : C.muted};flex-shrink:0;">${failText}</span>
        <span style="width:100px;font-family:'JetBrains Mono';font-size:13px;color:${C.text};flex-shrink:0;">${downText}</span>
        <span style="flex:1;font-family:'Inter';font-size:12px;color:${C.muted};">${impact}</span>
      </div>
    `);
  }

  // Divider
  await html(nodeId, `<div layer-name="Divider" style="height:1px;background:${C.card};"></div>`);

  // Actions header
  await html(nodeId, `
    <div layer-name="Actions Header" style="display:flex;align-items:baseline;justify-content:space-between;">
      <div style="display:flex;align-items:baseline;gap:12px;">
        <span style="font-family:'Space Grotesk';font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Action Items</span>
        <span style="font-family:'JetBrains Mono';font-size:12px;color:${C.accent};">${actionItems.length} items</span>
      </div>
      <span style="font-family:'JetBrains Mono';font-size:11px;color:${C.dim};">sorted by priority</span>
    </div>
  `);

  // Action items
  for (const item of actionItems.slice(0, 5)) {
    const pc = priorityColor(item.priority);
    await html(nodeId, `
      <div layer-name="Action: ${item.title.slice(0, 30)}" style="display:flex;align-items:flex-start;gap:16px;padding:20px 28px;background:${C.surface};border-radius:10px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${pc};margin-top:5px;flex-shrink:0;"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
          <span style="font-family:'Inter';font-size:14px;font-weight:600;color:${C.text};">${item.title}</span>
          <span style="font-family:'Inter';font-size:12px;color:${C.muted};line-height:1.5;">${item.description}</span>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <span style="font-family:'JetBrains Mono';font-size:10px;padding:3px 8px;border-radius:4px;background:${pc}18;color:${pc};">${item.priority}</span>
          <span style="font-family:'JetBrains Mono';font-size:10px;padding:3px 8px;border-radius:4px;background:${C.card};color:${C.muted};">~${item.effort}</span>
        </div>
      </div>
    `);
  }

  return nodeId;
}

// ── Slide 3: Lineage & Ownership ──

async function renderLineageAndOwnership(episode: Episode, insights: SchemaInsights): Promise<string> {
  const { nodeId } = await call("create_artboard", { name: `DataBard — Lineage & Ownership`, styles: ARTBOARD_STYLES }) as { nodeId: string };

  // Lineage header
  const totalConnections = episode.schemaMeta?.lineage.length ?? 0;
  await html(nodeId, `
    <div layer-name="Lineage Header" style="display:flex;align-items:baseline;justify-content:space-between;">
      <span style="font-family:'Space Grotesk';font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Data Lineage</span>
      <span style="font-family:'JetBrains Mono';font-size:11px;color:${C.dim};">${totalConnections} connections across ${episode.tableCount} tables</span>
    </div>
  `);

  // Lineage map — group tables by layer (sources → core → downstream → analytics)
  if (insights.lineageHotspots.length > 0 && episode.schemaMeta) {
    const tables = episode.schemaMeta.tables;
    const lineage = episode.schemaMeta.lineage;

    // Classify tables into layers based on lineage position
    const hasUpstream = new Set(lineage.map(e => e.toTable.split(".").pop()!));
    const hasDownstream = new Set(lineage.map(e => e.fromTable.split(".").pop()!));

    const sources = tables.filter(t => !hasUpstream.has(t.name) && hasDownstream.has(t.name)).map(t => t.name);
    const sinks = tables.filter(t => hasUpstream.has(t.name) && !hasDownstream.has(t.name)).map(t => t.name);
    const middle = tables.filter(t => hasUpstream.has(t.name) && hasDownstream.has(t.name)).map(t => t.name);
    const isolated = tables.filter(t => !hasUpstream.has(t.name) && !hasDownstream.has(t.name)).map(t => t.name);

    const criticalNames = new Set(insights.criticalTables.map(c => c.table.name));

    function tableNode(name: string): string {
      const isCritical = criticalNames.has(name);
      const ct = insights.criticalTables.find(c => c.table.name === name);
      const rc = ct ? riskColor(ct.risk) : C.border;
      const bg = isCritical ? `${rc}12` : C.card;
      const border = isCritical ? `${rc}40` : C.border;
      const textColor = isCritical ? rc : (sources.includes(name) || isolated.includes(name) ? C.muted : C.text);
      const weight = isCritical ? "600" : "400";
      return `<div style="padding:12px 20px;background:${bg};border-radius:8px;border:1px solid ${border};"><span style="font-family:'JetBrains Mono';font-size:12px;font-weight:${weight};color:${textColor};">${name}</span></div>`;
    }

    function layerColumn(label: string, names: string[]): string {
      if (names.length === 0) return "";
      return `
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center;">
          <span style="font-family:'JetBrains Mono';font-size:9px;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;">${label}</span>
          ${names.slice(0, 4).map(n => tableNode(n)).join("")}
        </div>
      `;
    }

    function arrows(count: number): string {
      if (count === 0) return "";
      return `<div style="display:flex;flex-direction:column;gap:4px;align-items:center;">${Array(Math.min(count, 4)).fill(`<span style="font-family:'Inter';font-size:20px;color:${C.dim};">→</span>`).join("")}</div>`;
    }

    const layers = [
      { label: "Sources", names: sources },
      { label: "Core", names: middle },
      { label: "Downstream", names: sinks },
    ].filter(l => l.names.length > 0);

    if (isolated.length > 0) layers.push({ label: "Isolated", names: isolated });

    const mapHtml = layers.map((l, i) => {
      const col = layerColumn(l.label, l.names);
      const arr = i < layers.length - 1 ? arrows(Math.max(l.names.length, layers[i + 1]?.names.length ?? 0)) : "";
      return col + arr;
    }).join("");

    await html(nodeId, `
      <div layer-name="Lineage Map" style="display:flex;gap:24px;align-items:center;padding:40px;background:${C.surface};border-radius:12px;">
        ${mapHtml}
      </div>
    `);
  } else {
    await html(nodeId, `
      <div layer-name="No Lineage" style="padding:40px;background:${C.surface};border-radius:12px;text-align:center;">
        <span style="font-family:'Inter';font-size:14px;color:${C.muted};">No lineage data available. Connect to OpenMetadata for lineage tracking.</span>
      </div>
    `);
  }

  // Divider
  await html(nodeId, `<div layer-name="Divider" style="height:1px;background:${C.card};"></div>`);

  // Ownership header
  const assignedCount = episode.tableCount - insights.ownerlessTables.length;
  await html(nodeId, `
    <div layer-name="Ownership Header" style="display:flex;align-items:baseline;justify-content:space-between;">
      <span style="font-family:'Space Grotesk';font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Ownership</span>
      <span style="font-family:'JetBrains Mono';font-size:11px;color:${C.dim};">${assignedCount} of ${episode.tableCount} tables assigned</span>
    </div>
  `);

  // Ownership cards
  const ownerColors = [C.accent, C.success, "#e879f9", C.warn];
  const ownerCards = insights.owners.slice(0, 3).map((o, i) => {
    const color = ownerColors[i % ownerColors.length];
    const initials = o.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    return `
      <div style="flex:1;padding:24px 28px;background:${C.surface};border-radius:12px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;">
            <span style="font-family:'Inter';font-size:13px;font-weight:600;color:${color};">${initials}</span>
          </div>
          <div>
            <span style="font-family:'Inter';font-size:13px;font-weight:600;color:${C.text};">${o.name}</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${o.tables.map(t => `<span style="font-family:'JetBrains Mono';font-size:10px;padding:4px 8px;background:${C.card};border-radius:4px;color:${C.text};">${t}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");

  const unassignedCard = insights.ownerlessTables.length > 0 ? `
    <div style="flex:1;padding:24px 28px;background:${C.surface};border-radius:12px;display:flex;flex-direction:column;gap:12px;border:1px dashed ${C.danger}40;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:${C.danger}12;display:flex;align-items:center;justify-content:center;">
          <span style="font-family:'Inter';font-size:13px;color:${C.danger};">?</span>
        </div>
        <div>
          <span style="font-family:'Inter';font-size:13px;font-weight:600;color:${C.danger};">Unassigned</span>
          <span style="font-family:'Inter';font-size:11px;color:${C.dim};display:block;">${insights.ownerlessTables.length} tables need owners</span>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${insights.ownerlessTables.slice(0, 6).map(t => `<span style="font-family:'JetBrains Mono';font-size:10px;padding:4px 8px;background:${C.card};border-radius:4px;color:${C.muted};">${t}</span>`).join("")}
      </div>
    </div>
  ` : "";

  await html(nodeId, `
    <div layer-name="Ownership Grid" style="display:flex;gap:20px;">
      ${ownerCards}${unassignedCard}
    </div>
  `);

  // Footer
  await html(nodeId, `
    <div layer-name="Footer" style="display:flex;align-items:center;justify-content:space-between;padding:20px 0 0;">
      <span style="font-family:'Inter';font-size:11px;color:${C.dim};">Generated by DataBard · databard.thisyearnofear.com</span>
      <span style="font-family:'JetBrains Mono';font-size:11px;color:${C.dim};">${episode.schemaName} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
    </div>
  `);

  return nodeId;
}

// ── Pure HTML builders (no MCP — used for server-side PDF export) ──

/** Build the Overview slide as a self-contained HTML string */
export function buildOverviewHtml(episode: Episode, insights: SchemaInsights): string {
  const sc = scoreColor(insights.healthScore);
  const circ = 2 * Math.PI * 42;
  const offset = circ - (insights.healthScore / 100) * circ;
  const testedCount = episode.tableCount - insights.untestedTables.length;
  const undocCount = insights.undocumentedTables.length;
  const summaryText = [
    insights.failingTests > 0 ? `${insights.failingTests} failing tests across ${insights.criticalTables.filter(c => c.failingTests > 0).length} critical tables with downstream dependents.` : "",
    `${insights.docCoverage}% documentation coverage.`,
    insights.untestedTables.length > 0 ? `${insights.untestedTables.length} tables have no quality tests configured.` : "",
  ].filter(Boolean).join(" ");
  const stats = [
    { value: insights.failingTests, label: "Failing Tests", sub: `across ${insights.criticalTables.filter(c => c.failingTests > 0).length} tables`, color: insights.failingTests > 0 ? C.danger : C.success },
    { value: insights.untestedTables.length, label: "Untested Tables", sub: "no quality checks", color: C.text },
    { value: insights.ownerlessTables.length, label: "No Owner", sub: "unassigned tables", color: C.text },
    { value: insights.passingTests, label: "Passing Tests", sub: "all green", color: C.success },
  ];
  return `
    <div style="display:flex;flex-direction:column;gap:32px;padding:48px 56px;background:${C.bg};min-height:100vh;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <div style="display:flex;align-items:baseline;gap:12px;">
          <span style="font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">DataBard</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${C.muted};">${episode.schemaName}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${C.muted};">${episode.tableCount} tables · ${episode.qualitySummary.total} tests</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${C.dim};">${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:48px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <svg width="180" height="180" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="${C.card}" stroke-width="6"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="${sc}" stroke-width="6" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 50 50)"/>
            <text x="50" y="46" text-anchor="middle" dominant-baseline="central" font-family="Space Grotesk" font-size="32" font-weight="700" fill="${sc}">${insights.healthScore}</text>
            <text x="50" y="64" text-anchor="middle" font-family="Inter" font-size="8" fill="${C.muted}">of 100</text>
          </svg>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;color:${sc};letter-spacing:0.08em;text-transform:uppercase;">${insights.healthLabel}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:24px;flex:1;">
          <div style="font-family:'Space Grotesk',sans-serif;font-size:40px;font-weight:700;color:${C.text};letter-spacing:-0.03em;line-height:1.1;">Schema health${insights.healthLabel === "healthy" ? "<br/>looking good" : insights.healthLabel === "at-risk" ? "<br/>needs attention" : "<br/>critical issues"}</div>
          <div style="font-family:'Inter',sans-serif;font-size:14px;color:${C.muted};line-height:1.6;max-width:480px;">${summaryText}</div>
        </div>
      </div>
      <div style="display:flex;gap:20px;">
        <div style="flex:1;display:flex;flex-direction:column;gap:16px;padding:28px;background:${C.surface};border-radius:12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:${C.muted};">Test Coverage</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:${C.accent};">${insights.testCoverage}%</span>
          </div>
          <div style="height:4px;background:${C.card};border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${insights.testCoverage}%;background:${C.accent};border-radius:2px;"></div>
          </div>
          <span style="font-family:'Inter',sans-serif;font-size:11px;color:${C.dim};">${testedCount} of ${episode.tableCount} tables have tests</span>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:16px;padding:28px;background:${C.surface};border-radius:12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:${C.muted};">Documentation</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:${C.success};">${insights.docCoverage}%</span>
          </div>
          <div style="height:4px;background:${C.card};border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${insights.docCoverage}%;background:${C.success};border-radius:2px;"></div>
          </div>
          <span style="font-family:'Inter',sans-serif;font-size:11px;color:${C.dim};">${undocCount} tables missing descriptions</span>
        </div>
      </div>
      <div style="display:flex;gap:20px;">
        ${stats.map(s => `
          <div style="flex:1;padding:24px 28px;background:${C.surface};border-radius:12px;display:flex;align-items:baseline;gap:12px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:700;color:${s.color};">${s.value}</span>
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span style="font-family:'Inter',sans-serif;font-size:13px;font-weight:500;color:${C.text};">${s.label}</span>
              <span style="font-family:'Inter',sans-serif;font-size:11px;color:${C.dim};">${s.sub}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/** Build the Critical Tables & Actions slide as a self-contained HTML string */
export function buildCriticalAndActionsHtml(episode: Episode, insights: SchemaInsights, actionItems: ActionItem[]): string {
  const tableRows = insights.criticalTables.slice(0, 5).map(ct => {
    const rc = riskColor(ct.risk);
    const failText = ct.failingTests > 0 ? `${ct.failingTests} test${ct.failingTests > 1 ? "s" : ""}` : "untested";
    const downText = ct.downstreamCount > 0 ? `${ct.downstreamCount} table${ct.downstreamCount > 1 ? "s" : ""}` : "—";
    const impact = ct.failingTests > 0 && ct.downstreamCount > 0
      ? `Failures cascade to ${ct.downstreamCount} downstream dependents`
      : ct.failingTests === 0 ? "No tests configured — silent failures possible" : "Test failures need investigation";
    return `
      <div style="display:flex;align-items:center;padding:16px 28px;gap:16px;background:${C.surface};border-radius:10px;border-left:3px solid ${rc};">
        <span style="width:140px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:${C.text};flex-shrink:0;">${ct.table.name}</span>
        <span style="width:80px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;background:${rc}18;color:${rc};flex-shrink:0;text-align:center;">${ct.risk}</span>
        <span style="width:100px;font-family:'JetBrains Mono',monospace;font-size:13px;color:${ct.failingTests > 0 ? rc : C.muted};flex-shrink:0;">${failText}</span>
        <span style="width:100px;font-family:'JetBrains Mono',monospace;font-size:13px;color:${C.text};flex-shrink:0;">${downText}</span>
        <span style="flex:1;font-family:'Inter',sans-serif;font-size:12px;color:${C.muted};">${impact}</span>
      </div>
    `;
  }).join("");
  const actionRows = actionItems.slice(0, 5).map(item => {
    const pc = priorityColor(item.priority);
    return `
      <div style="display:flex;align-items:flex-start;gap:16px;padding:20px 28px;background:${C.surface};border-radius:10px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${pc};margin-top:5px;flex-shrink:0;"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
          <span style="font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:${C.text};">${item.title}</span>
          <span style="font-family:'Inter',sans-serif;font-size:12px;color:${C.muted};line-height:1.5;">${item.description}</span>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:3px 8px;border-radius:4px;background:${pc}18;color:${pc};">${item.priority}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:3px 8px;border-radius:4px;background:${C.card};color:${C.muted};">~${item.effort}</span>
        </div>
      </div>
    `;
  }).join("");
  return `
    <div style="display:flex;flex-direction:column;gap:32px;padding:48px 56px;background:${C.bg};min-height:100vh;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <div style="display:flex;align-items:baseline;gap:12px;">
          <span style="font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Critical Tables</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${C.danger};">${insights.criticalTables.length} at risk</span>
        </div>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${C.dim};">sorted by cascading risk</span>
      </div>
      <div style="display:flex;padding:0 28px 12px;gap:16px;">
        <span style="width:140px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Table</span>
        <span style="width:80px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Risk</span>
        <span style="width:100px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Failing</span>
        <span style="width:100px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;">Downstream</span>
        <span style="flex:1;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;">Impact</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">${tableRows}</div>
      <div style="height:1px;background:${C.card};"></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <div style="display:flex;align-items:baseline;gap:12px;">
          <span style="font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Action Items</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${C.accent};">${actionItems.length} items</span>
        </div>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${C.dim};">sorted by priority</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">${actionRows}</div>
    </div>
  `;
}

/** Build the Lineage & Ownership slide as a self-contained HTML string */
export function buildLineageAndOwnershipHtml(episode: Episode, insights: SchemaInsights): string {
  const totalConnections = episode.schemaMeta?.lineage.length ?? 0;
  const assignedCount = episode.tableCount - insights.ownerlessTables.length;

  let lineageHtml = `
    <div style="padding:40px;background:${C.surface};border-radius:12px;text-align:center;">
      <span style="font-family:'Inter',sans-serif;font-size:14px;color:${C.muted};">No lineage data available. Connect to OpenMetadata for lineage tracking.</span>
    </div>
  `;

  if (insights.lineageHotspots.length > 0 && episode.schemaMeta) {
    const tables = episode.schemaMeta.tables;
    const lineage = episode.schemaMeta.lineage;
    const hasUpstream = new Set(lineage.map(e => e.toTable.split(".").pop()!));
    const hasDownstream = new Set(lineage.map(e => e.fromTable.split(".").pop()!));
    const sources = tables.filter(t => !hasUpstream.has(t.name) && hasDownstream.has(t.name)).map(t => t.name);
    const sinks = tables.filter(t => hasUpstream.has(t.name) && !hasDownstream.has(t.name)).map(t => t.name);
    const middle = tables.filter(t => hasUpstream.has(t.name) && hasDownstream.has(t.name)).map(t => t.name);
    const isolated = tables.filter(t => !hasUpstream.has(t.name) && !hasDownstream.has(t.name)).map(t => t.name);
    const criticalNames = new Set(insights.criticalTables.map(c => c.table.name));

    function tableNode(name: string): string {
      const isCritical = criticalNames.has(name);
      const ct = insights.criticalTables.find(c => c.table.name === name);
      const rc = ct ? riskColor(ct.risk) : C.border;
      const bg = isCritical ? `${rc}12` : C.card;
      const border = isCritical ? `${rc}40` : C.border;
      const textColor = isCritical ? rc : (sources.includes(name) || isolated.includes(name) ? C.muted : C.text);
      const weight = isCritical ? "600" : "400";
      return `<div style="padding:12px 20px;background:${bg};border-radius:8px;border:1px solid ${border};"><span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:${weight};color:${textColor};">${name}</span></div>`;
    }

    const layers = [
      { label: "Sources", names: sources },
      { label: "Core", names: middle },
      { label: "Downstream", names: sinks },
    ].filter(l => l.names.length > 0);
    if (isolated.length > 0) layers.push({ label: "Isolated", names: isolated });

    const mapHtml = layers.map((l, i) => {
      const col = l.names.length === 0 ? "" : `
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:${C.dim};letter-spacing:0.08em;text-transform:uppercase;">${l.label}</span>
          ${l.names.slice(0, 4).map(n => tableNode(n)).join("")}
        </div>
      `;
      const arr = i < layers.length - 1 ? `<div style="display:flex;flex-direction:column;gap:4px;align-items:center;">${Array(Math.min(Math.max(l.names.length, layers[i + 1]?.names.length ?? 0), 4)).fill(`<span style="font-family:'Inter',sans-serif;font-size:20px;color:${C.dim};">→</span>`).join("")}</div>` : "";
      return col + arr;
    }).join("");

    lineageHtml = `<div style="display:flex;gap:24px;align-items:center;padding:40px;background:${C.surface};border-radius:12px;">${mapHtml}</div>`;
  }

  const ownerColors = [C.accent, C.success, "#e879f9", C.warn];
  const ownerCards = insights.owners.slice(0, 3).map((o, i) => {
    const color = ownerColors[i % ownerColors.length];
    const initials = o.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    return `
      <div style="flex:1;padding:24px 28px;background:${C.surface};border-radius:12px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;">
            <span style="font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:${color};">${initials}</span>
          </div>
          <span style="font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:${C.text};">${o.name}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${o.tables.map(t => `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:4px 8px;background:${C.card};border-radius:4px;color:${C.text};">${t}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");

  const unassignedCard = insights.ownerlessTables.length > 0 ? `
    <div style="flex:1;padding:24px 28px;background:${C.surface};border-radius:12px;display:flex;flex-direction:column;gap:12px;border:1px dashed ${C.danger}40;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:${C.danger}12;display:flex;align-items:center;justify-content:center;">
          <span style="font-family:'Inter',sans-serif;font-size:13px;color:${C.danger};">?</span>
        </div>
        <div>
          <span style="font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:${C.danger};">Unassigned</span>
          <span style="font-family:'Inter',sans-serif;font-size:11px;color:${C.dim};display:block;">${insights.ownerlessTables.length} tables need owners</span>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${insights.ownerlessTables.slice(0, 6).map(t => `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:4px 8px;background:${C.card};border-radius:4px;color:${C.muted};">${t}</span>`).join("")}
      </div>
    </div>
  ` : "";

  return `
    <div style="display:flex;flex-direction:column;gap:32px;padding:48px 56px;background:${C.bg};min-height:100vh;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <span style="font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Data Lineage</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${C.dim};">${totalConnections} connections across ${episode.tableCount} tables</span>
      </div>
      ${lineageHtml}
      <div style="height:1px;background:${C.card};"></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <span style="font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">Ownership</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${C.dim};">${assignedCount} of ${episode.tableCount} tables assigned</span>
      </div>
      <div style="display:flex;gap:20px;">${ownerCards}${unassignedCard}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 0 0;">
        <span style="font-family:'Inter',sans-serif;font-size:11px;color:${C.dim};">Generated by DataBard · databard.thisyearnofear.com</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${C.dim};">${episode.schemaName} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </div>
  `;
}

/**
 * Compose all 3 slides into a single multi-page HTML document for PDF export.
 * Each slide is a full-viewport page separated by a page-break.
 */
export function buildDashboardHtml(episode: Episode, insights: SchemaInsights, actionItems: ActionItem[]): string {
  const slide1 = buildOverviewHtml(episode, insights);
  const slide2 = buildCriticalAndActionsHtml(episode, insights, actionItems);
  const slide3 = buildLineageAndOwnershipHtml(episode, insights);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=1440"/>
  <title>DataBard — ${episode.schemaName} Health Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${C.bg}; width: 1440px; }
    .slide { page-break-after: always; width: 1440px; }
    .slide:last-child { page-break-after: avoid; }
  </style>
</head>
<body>
  <div class="slide">${slide1}</div>
  <div class="slide">${slide2}</div>
  <div class="slide">${slide3}</div>
</body>
</html>`;
}

// ── Public API ──

/** Render a multi-slide health dashboard on the Paper canvas */
export async function renderHealthDashboard(
  episode: Episode,
  insights: SchemaInsights,
  actionItems: ActionItem[],
): Promise<{ artboardIds: string[] }> {
  const ids: string[] = [];

  ids.push(await renderOverview(episode, insights));
  ids.push(await renderCriticalAndActions(episode, insights, actionItems));
  ids.push(await renderLineageAndOwnership(episode, insights));

  await call("finish_working_on_nodes", {});

  return { artboardIds: ids };
}

/**
 * Render the 3-slide dashboard on Paper canvas and capture screenshots.
 * Returns base64 PNG images for each slide — no Paper Desktop dependency
 * beyond the initial render call.
 */
export async function exportDashboardScreenshots(
  episode: Episode,
  insights: SchemaInsights,
  actionItems: ActionItem[],
): Promise<{ screenshots: { name: string; dataUrl: string }[] }> {
  const { artboardIds } = await renderHealthDashboard(episode, insights, actionItems);

  const names = ["Overview", "Critical-Tables-and-Actions", "Lineage-and-Ownership"];
  const screenshots: { name: string; dataUrl: string }[] = [];

  for (let i = 0; i < artboardIds.length; i++) {
    const result = await call("get_screenshot", { nodeId: artboardIds[i], scale: 2 }) as { content?: { type: string; data: string }[] };
    // Paper returns content array with base64 image data
    const imageContent = result.content?.find((c) => c.type === "image");
    if (imageContent?.data) {
      screenshots.push({
        name: names[i] ?? `slide-${i + 1}`,
        dataUrl: `data:image/jpeg;base64,${imageContent.data}`,
      });
    }
  }

  return { screenshots };
}
