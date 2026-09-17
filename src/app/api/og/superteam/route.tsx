import { ImageResponse } from "next/og";
import { loadEarnEdition } from "@/lib/superteam-earn";

export const runtime = "nodejs";
export const revalidate = 3600;

function fmtUsd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

const RACE_COLORS: Record<string, string> = {
  "Superteam UK": "#8f6bff",
  "Superteam Brasil": "#358ff3",
  "Superteam Ukraine": "#28d26e",
  Superteam: "#f59e0b",
  "Superteam Nigeria": "#f05abe",
};

/** Flatten a race series into an SVG polyline path inside the plot box. */
function racePath(rows: Record<string, string | number>[], key: string, w: number, h: number, max: number): string {
  const n = rows.length;
  return rows
    .map((r, i) => {
      const x = (i / (n - 1)) * w;
      const y = h - ((Number(r[key]) || 0) / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * OG card for the Superteam Earn economy page. Slack/X unfurl of /superteam.
 */
export async function GET() {
  try {
    const edition = await loadEarnEdition();
    const race = edition.race;
    const raceMax = Math.max(1, ...race.keys.map((k) => Number(race.rows.at(-1)?.[k]) || 0));
    const PW = 1072, PH = 200; // race plot box

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
                Superteam Earn economy
              </div>
              <div style={{ fontSize: "22px", color: "#8888a0", marginTop: "8px" }}>
                {`${edition.totals.listings.toLocaleString("en-US")} listings · ${edition.totals.submissions.toLocaleString("en-US")} submissions`}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ fontSize: "40px", fontWeight: 700 }}>{`#${edition.uk.rankByListings}`}</div>
              <div style={{ fontSize: "14px", color: "#8888a0", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                UK by listings · all-time
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: "36px" }}>
            <div style={{ fontSize: "18px", color: "#7c5bf5", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Superteam UK
            </div>
            <div style={{ fontSize: "48px", fontWeight: 700, marginTop: "8px", letterSpacing: "-0.03em" }}>
              {`${edition.uk.listings} listings · ${fmtUsd(edition.uk.usdRewards)}`}
            </div>
            <div style={{ fontSize: "22px", color: "#b0b0c8", marginTop: "10px", maxWidth: "980px" }}>
              {`${edition.uk.submissions.toLocaleString("en-US")} builder submissions — ${edition.headline.card}`}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "14px", color: "#8888a0", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                The chapter race · cumulative listings by closing month
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                {race.keys.map((k) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: RACE_COLORS[k] ?? "#8888a0" }} />
                    <div style={{ fontSize: "13px", color: "#b0b0c8" }}>{k.replace("Superteam ", "") || k}</div>
                  </div>
                ))}
              </div>
            </div>
            <svg width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`}>
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1={0} x2={PW} y1={PH * f} y2={PH * f} stroke="#2a2a3a" strokeWidth={1} strokeDasharray="3 6" />
              ))}
              {race.keys.map((k) => (
                <polyline
                  key={k}
                  points={racePath(race.rows, k, PW, PH, raceMax)}
                  fill="none"
                  stroke={RACE_COLORS[k] ?? "#8888a0"}
                  strokeWidth={k === "Superteam UK" ? 4 : 2.5}
                  strokeOpacity={k === "Superteam UK" ? 1 : 0.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </svg>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0f",
            color: "#e4e4ef",
            fontFamily: "system-ui, sans-serif",
            fontSize: "32px",
          }}
        >
          The Superteam Earn economy, measured — DataBard
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }
}
