import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { shares } from "@/lib/store";
import { scoreFromEpisode } from "@/lib/score-card";
import { scoreHex } from "@/lib/product/score-tone";
import type { Episode } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Score card for shared briefings. Slack/X unfurl of /episode/:id.
 * Usage: /api/og?id=abc123&seg=3
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const segRaw = req.nextUrl.searchParams.get("seg");
  const episode = id ? shares.get<Episode>(id) : null;
  const seg = segRaw != null && segRaw !== "" ? Number.parseInt(segRaw, 10) : null;
  const card = episode ? scoreFromEpisode(episode, Number.isFinite(seg) ? seg : null) : null;

  const name = card?.name ?? "Your data";
  const score = card?.score;
  const quote = card?.quote ?? "Health scores, what changed, and a briefing you can forward.";
  const speaker = card?.speaker ?? "Morgan";
  const accent = score == null ? "#7c5bf5" : scoreHex(score);

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
          <div
            style={{
              fontSize: "18px",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "#7c5bf5",
            }}
          >
            DataBard
          </div>
          {card && card.failed > 0 && (
            <div style={{ fontSize: "18px", color: "#f55b5b" }}>
              {card.failed} failing
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: "28px", marginTop: "48px" }}>
          <div
            style={{
              fontSize: "128px",
              fontWeight: 700,
              lineHeight: 0.85,
              letterSpacing: "-0.04em",
              color: accent,
            }}
          >
            {score == null ? "—" : String(score)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: "12px" }}>
            <div
              style={{
                fontSize: "22px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#8888a0",
              }}
            >
              Health
            </div>
            <div
              style={{
                fontSize: "44px",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                marginTop: "4px",
                maxWidth: "720px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "40px",
            maxWidth: "980px",
          }}
        >
          <div style={{ fontSize: "28px", lineHeight: 1.35, color: "#b0b0c8" }}>
            {`"${quote}"`}
          </div>
          <div style={{ fontSize: "18px", color: "#8888a0", marginTop: "12px" }}>
            — {speaker}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: "18px",
            color: "#555570",
          }}
        >
          databard.persidian.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
