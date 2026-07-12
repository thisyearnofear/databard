"use client";
/**
 * HashFingerprint — visual proof-of-delivery signature.
 *
 * Turns the 32-byte SHA-256 into a 16-column x 4-row grid of colored cells (256 total = 64 cells,
 * each cell encodes 4 bits). When the hash is `null` the pattern draws empty. When set, it fills
 * in with a stagger — visual metaphor for the cryptographic commitment landing on-chain.
 */
import { useMemo } from "react";

const COLS = 16;
const ROWS = 4;

export function HashFingerprint({
  hashHex,
  size = 6,
  filled = true,
}: {
  hashHex?: string | null;
  size?: number;
  filled?: boolean;
}) {
  const cells = useMemo<{ hue: number; sat: number; light: number }[]>(() => {
    if (!hashHex) return Array(COLS * ROWS).fill({ hue: 260, sat: 5, light: 20 });
    // Take 4-bit nibbles from the hex. 64 nibbles from 32 bytes.
    const arr: { hue: number; sat: number; light: number }[] = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      const nibble = parseInt(hashHex[i] || "0", 16);
      arr.push({
        hue: 260 + (nibble * 6),        // 260 (accent) shifted per nibble
        sat: 60 + (nibble * 2),
        light: 30 + (nibble * 3),
      });
    }
    return arr;
  }, [hashHex]);

  return (
    <div
      className="grid gap-[2px] p-1 rounded bg-[var(--bg)] border border-[var(--border)]"
      style={{ gridTemplateColumns: `repeat(${COLS}, ${size}px)` }}
      title={hashHex ? `SHA-256: ${hashHex}` : "waiting for delivery commitment…"}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          className="transition-colors duration-300 rounded-[1px]"
          style={{
            width: size,
            height: size,
            backgroundColor: filled && hashHex
              ? `hsl(${c.hue} ${c.sat}% ${c.light}%)`
              : "var(--border)",
            transitionDelay: filled && hashHex ? `${i * 8}ms` : "0ms",
          }}
        />
      ))}
    </div>
  );
}
