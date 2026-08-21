import { ImageResponse } from "next/og";
import { buildLeagueEdition } from "@/lib/league";

export const runtime = "nodejs";

/**
 * OG card for the weekly league. Slack/X unfurl of /league.
 */
export async function GET() {
  const edition = buildLeagueEdition();
  const { headline, rows, weekLabel, average } = edition;
  const top = rows.slice(0, 4);
  const change =
    headline.change === 0 ? "" : headline.change > 0 ? `↑${headline.change}` : `↓${Math.abs(headline.change)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0f",
          color: "#e4e4ef",
          padding: "56px 64px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "18px", letterSpacing: "0.28em", textTransform: "uppercase", color: "#7c5bf5" }}>
              DataBard league
            </div>
            <div style={{ fontSize: "22px", color: "#8888a0", marginTop: "8px" }}>{weekLabel}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ fontSize: "40px", fontWeight: 700 }}>{average}</div>
            <div style={{ fontSize: "14px", color: "#8888a0", letterSpacing: "0.16em", textTransform: "uppercase" }}>
              avg health
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "36px" }}>
          <div style={{ fontSize: "18px", color: "#f55b5b", letterSpacing: "0.18em", textTransform: "uppercase" }}>
            This week
          </div>
          <div style={{ fontSize: "48px", fontWeight: 700, marginTop: "8px", letterSpacing: "-0.03em" }}>
            {headline.schemaName} {headline.score} {change}
          </div>
          <div style={{ fontSize: "22px", color: "#b0b0c8", marginTop: "10px", maxWidth: "980px" }}>
            {headline.line}
          </div>
        </div>

        <div style={{ display: "flex", marginTop: "auto", gap: "28px" }}>
          {top.map((row) => (
            <div
              key={row.schemaFqn}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "14px 18px",
                border: "1px solid #2a2a3a",
                borderRadius: "12px",
                minWidth: "200px",
              }}
            >
              <div style={{ fontSize: "14px", color: "#8888a0" }}>#{row.rank} {row.schemaName}</div>
              <div style={{ fontSize: "32px", fontWeight: 700, marginTop: "4px" }}>{row.score}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
