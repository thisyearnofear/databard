"use client";

import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import {
  LineChart,
  Line,
  Grid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  DitherGradient,
  type ChartConfig,
  type DitherColor,
} from "@/components/dither-kit";
import type { RaceSeries } from "@/lib/superteam-earn";

const OTHER_COLORS: DitherColor[] = ["blue", "green", "orange", "pink"];

/**
 * The chapter race — cumulative Earn listings by deadline month, one dithered
 * line per chapter. The focus sponsor is the highlighted series; scrub to
 * compare, hover a legend entry to spotlight.
 */
export function ChapterRaceChart({ race, focusName = "Superteam UK", spotlight = false }: { race: RaceSeries; focusName?: string; spotlight?: boolean }) {
  const reduce = useReducedMotion();
  const config = useMemo<ChartConfig>(() => {
    const out: ChartConfig = {};
    let i = 0;
    for (const key of race.keys) {
      out[key] = {
        label: key.replace("Superteam ", "") || key,
        color: key === focusName ? "purple" : OTHER_COLORS[i++ % OTHER_COLORS.length],
      };
    }
    return out;
  }, [race.keys, focusName]);

  if (race.rows.length < 2) return null;

  return (
    <div className="hover-depth relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 overflow-hidden">
      <DitherGradient from="purple" direction="down" cell={3} opacity={0.14} className="absolute inset-x-0 top-0 h-20" />
      <div className="relative flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            The chapter race
          </div>
          <h2 className="text-sm font-semibold mt-0.5">Cumulative listings, by closing month</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Every listing Earn has published, counted in the month its bounty closed. Earn&apos;s API
            has no posted-at date, so this is a closings race, not an announcements race.
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          Select a legend entry to focus; select it again to compare.
        </span>
      </div>
      <div className="relative h-56 w-full pt-4">
        <LineChart data={race.rows} config={config} animate={!reduce} animationDuration={450} defaultSelectedDataKey={spotlight ? focusName : null} bloom="low" margins={{ top: 18, right: 8, bottom: 22, left: 30 }}>
          <Grid />
          <XAxis dataKey="t" maxTicks={8} />
          <YAxis tickFormatter={(v) => `${v}`} />
          {race.keys.map((key) => (
            <Line key={key} dataKey={key} />
          ))}
          <Legend isClickable />
          <Tooltip labelKey="t" variant="frosted-glass" />
        </LineChart>
      </div>
    </div>
  );
}
