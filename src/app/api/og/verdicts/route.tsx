import { ImageResponse } from "next/og";
import { loadVerdicts } from "@/lib/probe-verdicts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OG card for /probe/verdicts — the latest published verdict unfurled as the
 * share card. Falls back to a title card when nothing has published yet.
 */
export async function GET() {
  const verdicts = await loadVerdicts();
  const latest = verdicts[0];

  if (!latest) {
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
          <div style={{ display: "flex", flexDirection: "column", fontSize: "18px", letterSpacing: "0.28em", textTransform: "uppercase", color: "#7c5bf5" }}>
            DataBard Probe
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: "52px", fontWeight: 700, marginTop: "24px", letterSpacing: "-0.03em" }}>
            Which service was worth paying?
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: "22px", color: "#8888a0", marginTop: "16px" }}>
            Agent services measured head-to-head, published weekly.
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const top = latest.ranked.filter((r) => !r.reference).slice(0, 4);
  const date = new Date(latest.generatedAt).toUTCString().slice(0, 16);
  const unreachable = latest.ranked.filter((r) => !r.reachable).length;

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
            <div style={{ display: "flex", flexDirection: "column", fontSize: "18px", letterSpacing: "0.28em", textTransform: "uppercase", color: "#7c5bf5" }}>
              DataBard Probe verdict
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "22px", color: "#8888a0", marginTop: "8px" }}>{date}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "40px", fontWeight: 700 }}>{latest.candidates}</div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "14px", color: "#8888a0", letterSpacing: "0.16em", textTransform: "uppercase" }}>
              services measured
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "36px" }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: "18px", color: "#5bb8f5", letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Top pick
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: "48px", fontWeight: 700, marginTop: "8px", letterSpacing: "-0.03em" }}>
            {latest.topPick ?? "n/a"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: "22px", color: "#b0b0c8", marginTop: "10px", maxWidth: "980px" }}>
            {unreachable > 0
              ? `${unreachable} service${unreachable === 1 ? "" : "s"} didn't answer. Verdicts are measured, not sponsored.`
              : "Every service answered. Verdicts are measured, not sponsored."}
          </div>
        </div>

        <div style={{ display: "flex", marginTop: "auto", gap: "28px" }}>
          {top.map((row) => (
            <div
              key={row.endpoint}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "14px 18px",
                border: "1px solid #2a2a3a",
                borderRadius: "12px",
                minWidth: "200px",
              }}
            >
              <div style={{ fontSize: "14px", color: "#8888a0", display: "flex" }}>
                {`#${row.rank} ${row.name.length > 22 ? `${row.name.slice(0, 22)}…` : row.name}`}
              </div>
              <div style={{ display: "flex", flexDirection: "column", fontSize: "32px", fontWeight: 700, marginTop: "4px" }}>{row.score}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
