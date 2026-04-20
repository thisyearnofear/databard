import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { shares } from "@/lib/store";
import type { Episode } from "@/lib/types";

/**
 * Dynamic OG image for shared episodes.
 * Usage: /api/og?id=abc123
 * Generates a 1200x630 card with schema name, stats, and quality indicator.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  // Default card if no episode ID
  const episode = id ? shares.get<Episode>(id) : null;

  const name = episode?.schemaName ?? "Your Data Catalog";
  const tables = episode?.tableCount ?? 0;
  const tests = episode?.qualitySummary.total ?? 0;
  const failed = episode?.qualitySummary.failed ?? 0;
  const healthy = failed === 0 && tests > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0a0a0f 0%, #14141f 50%, #1a1a2e 100%)",
          fontFamily: "system-ui, sans-serif",
          color: "#e4e4ef",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "40px",
          }}
        >
          <span style={{ fontSize: "48px" }}>🎙️</span>
          <span style={{ fontSize: "32px", color: "#8888a0", fontWeight: 500 }}>DataBard</span>
        </div>

        {/* Schema name */}
        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: "24px",
            maxWidth: "900px",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>

        {/* Stats row */}
        {episode && (
          <div
            style={{
              display: "flex",
              gap: "32px",
              fontSize: "24px",
              color: "#8888a0",
            }}
          >
            <span>{tables} tables</span>
            <span>·</span>
            <span>{tests} tests</span>
            {failed > 0 && (
              <>
                <span>·</span>
                <span style={{ color: "#f55b5b" }}>{failed} failing</span>
              </>
            )}
            {healthy && (
              <>
                <span>·</span>
                <span style={{ color: "#5bf58c" }}>all passing ✓</span>
              </>
            )}
          </div>
        )}

        {/* Bottom tagline */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            fontSize: "20px",
            color: "#555570",
          }}
        >
          Podcast-style audio docs for your data catalog
        </div>

        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #7c5bf5, #5bf58c)",
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
