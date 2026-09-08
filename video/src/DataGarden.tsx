import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { z } from "zod";

export const FPS = 30;

export const dataGardenSchema = z.object({
  healthScore: z.number(),
  rowCount: z.number(),
  costUsd: z.number(),
  runId: z.string(),
  seatPriceUsdLow: z.number(),
  seatPriceUsdHigh: z.number(),
});

export type DataGardenProps = z.infer<typeof dataGardenSchema>;

// ── palette ─────────────────────────────────────────────────────────────────
const C = {
  skyTop: "#e8f0da",
  skyBottom: "#f7f1dd",
  meadow: "#9db87a",
  meadowDark: "#7ea15f",
  soil: "#8a6a4d",
  paper: "#fbf6e9",
  ink: "#3d3830",
  accent: "#c96f3b", // terracotta
  sun: "#e8c34e",
};

// ── shared helpers ──────────────────────────────────────────────────────────
const FadeIn: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame - delay, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
  });
  return <div style={{ opacity }}>{children}</div>;
};

const PaperCard: React.FC<{
  children: React.ReactNode;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({ children, rotate = -1.5, style }) => (
  <div
    style={{
      background: C.paper,
      border: `2px solid ${C.ink}22`,
      borderRadius: 10,
      boxShadow: "0 10px 30px rgba(61,56,48,0.18)",
      padding: "28px 36px",
      transform: `rotate(${rotate}deg)`,
      fontFamily: "Georgia, serif",
      color: C.ink,
      ...style,
    }}
  >
    {children}
  </div>
);

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const { height } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        bottom: height * 0.04,
        width: "100%",
        textAlign: "center",
        fontSize: 34,
        fontFamily: "Georgia, serif",
        color: C.ink,
        textShadow: "0 1px 0 #fff8, 0 0 12px #fff9",
        padding: "0 160px",
      }}
    >
      {text}
    </div>
  );
};

const Serif: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <span style={{ fontFamily: "Georgia, serif", color: C.ink, ...style }}>
    {children}
  </span>
);

// ── garden fixtures (simple, warm SVG shapes) ───────────────────────────────
const Grass: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <svg width={width} height={height} style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.skyTop} />
          <stop offset="100%" stopColor={C.skyBottom} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill="url(#sky)" />
      <circle cx={width * 0.82} cy={140} r={70} fill={C.sun} opacity={0.85} />
      <ellipse cx={width * 0.5} cy={height * 1.06} rx={width * 0.85} ry={height * 0.34} fill={C.meadow} />
      <ellipse cx={width * 0.2} cy={height * 1.1} rx={width * 0.7} ry={height * 0.3} fill={C.meadowDark} opacity={0.7} />
      <ellipse cx={width * 0.85} cy={height * 1.12} rx={width * 0.6} ry={height * 0.26} fill={C.meadowDark} opacity={0.55} />
    </svg>
  );
};

const Sunflower: React.FC<{ label?: string; x: number; scale?: number }> = ({
  label,
  x,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const angle = Math.sin(frame / 40) * 2;
  return (
    <svg
      width={220 * scale}
      height={340 * scale}
      style={{ position: "absolute", left: x, bottom: 60, transform: `rotate(${angle}deg)`, transformOrigin: "bottom center" }}
      viewBox="0 0 220 340"
    >
      <rect x={104} y={120} width={12} height={220} fill="#6f8f52" />
      <path d="M110 200 q-60 -10 -70 -60 q60 10 70 60" fill="#7ea15f" />
      <path d="M110 250 q60 -10 70 -60 q-60 10 -70 60" fill="#7ea15f" />
      {Array.from({ length: 12 }).map((_, i) => (
        <ellipse key={i} cx={110 + Math.cos((i / 12) * Math.PI * 2) * 62} cy={70 + Math.sin((i / 12) * Math.PI * 2) * 62} rx={30} ry={14} fill={C.sun} transform={`rotate(${(i / 12) * 360} 110 70)`} />
      ))}
      <circle cx={110} cy={70} r={34} fill={C.soil} />
      {label ? (
        <text x={110} y={320} textAnchor="middle" fontSize={20} fontFamily="Georgia" fill={C.ink}>{label}</text>
      ) : null}
    </svg>
  );
};

const Butterfly: React.FC<{ x: number; y: number; scale?: number }> = ({ x, y, scale = 1 }) => {
  const frame = useCurrentFrame();
  const flutter = Math.sin(frame / 3) * 20;
  const drift = Math.sin(frame / 55) * 40;
  return (
    <svg width={60 * scale} height={44 * scale} viewBox="0 0 60 44"
      style={{ position: "absolute", left: x + drift, top: y + Math.sin(frame / 30) * 12 }}>
      <ellipse cx={20} cy={22} rx={16 + flutter * 0.3} ry={11} fill={C.accent} opacity={0.9} transform={`rotate(-18 20 22)`} />
      <ellipse cx={40} cy={22} rx={16 - flutter * 0.3} ry={11} fill={C.accent} opacity={0.9} transform={`rotate(18 40 22)`} />
      <rect x={28} y={16} width={4} height={16} rx={2} fill={C.ink} />
    </svg>
  );
};

const Deer: React.FC<{ x: number; scale?: number }> = ({ x, scale = 1 }) => (
  <svg width={200 * scale} height={160 * scale} viewBox="0 0 200 160"
    style={{ position: "absolute", left: x, bottom: 48 }}>
    <path d="M40 150 q10 -60 50 -70 q40 -10 60 10 q15 15 10 60 z" fill="#a9825f" />
    <rect x={55} y={120} width={8} height={32} fill="#a9825f" />
    <rect x={95} y={120} width={8} height={32} fill="#a9825f" />
    <rect x={120} y={120} width={8} height={32} fill="#a9825f" />
    <path d="M150 92 l30 -34 l14 6 l-24 40 z" fill="#a9825f" />
    <circle cx={182} cy={56} r={14} fill="#a9825f" />
    <path d="M176 46 l-8 -18 m14 18 l2 -20 m8 18 l10 -16" stroke="#8a6a4d" strokeWidth={4} fill="none" />
  </svg>
);

const Grain: React.FC = () => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  return (
    <svg width={width} height={height} style={{ position: "absolute", pointerEvents: "none", opacity: 0.05, mixBlendMode: "multiply" }}>
      {Array.from({ length: 220 }).map((_, i) => {
        const px = (i * 9301 + frame * 13) % width;
        const py = (i * 49297 + frame * 7) % height;
        return <circle key={i} cx={px} cy={py} r={1.2} fill={C.ink} />;
      })}
    </svg>
  );
};

// ── scenes ──────────────────────────────────────────────────────────────────
const S1_ThanksDune: React.FC = () => (
  <>
    <Sunflower x={260} scale={1.5} label="DUNE" />
    <Butterfly x={380} y={180} />
    <FadeIn delay={20}>
      <div style={{ position: "absolute", top: 120, width: "100%", textAlign: "center" }}>
        <Serif style={{ fontSize: 92, fontWeight: 700 }}>Thank you, Dune.</Serif>
      </div>
    </FadeIn>
    <FadeIn delay={80}>
      <div style={{ position: "absolute", bottom: 200, width: "100%", textAlign: "center" }}>
        <PaperCard rotate={1.5} style={{ display: "inline-block" }}>
          <Serif style={{ fontSize: 30 }}>
            free tier → view-only · Sep 10 (per public reports)<br />
            <span style={{ color: C.accent }}>Fair enough — seats cost money.</span>
          </Serif>
        </PaperCard>
      </div>
    </FadeIn>
    <Caption text="Dune is the backbone of this industry. Every analyst alive cut their teeth there." />
  </>
);

const S2_TheSeed: React.FC = () => {
  const frame = useCurrentFrame();
  const fall = interpolate(frame, [0, 45], [-140, 260], { easing: Easing.inOut(Easing.quad), extrapolateRight: "clamp" });
  return (
    <>
      <Sunflower x={240} scale={1.2} />
      <div style={{ position: "absolute", left: 880, top: fall }}>
        <Butterfly x={0} y={0} scale={0.9} />
      </div>
      <FadeIn delay={60}>
        <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center" }}>
          <PaperCard rotate={-2} style={{ display: "inline-block" }}>
            <Serif style={{ fontSize: 34 }}>Monid — <b>1,900+ metered endpoints · one key</b><br />
              <span style={{ fontFamily: "monospace", fontSize: 26, color: C.accent }}>
                surf /dex/token/price — $0.006/call · stable · verified ✓
              </span>
            </Serif>
          </PaperCard>
        </div>
      </FadeIn>
      <Caption text="One key, nineteen hundred metered endpoints. We picked a flower off the shelf: six-tenths of a cent." />
    </>
  );
};


const S3_TheBloom: React.FC<DataGardenProps> = ({ healthScore, rowCount }) => {
  const bloom = spring({ frame: useCurrentFrame() - 30, fps: FPS, config: { damping: 12 } });
  const curl = `curl -s -X POST databard.persidian.com/api/mcp/health-check \\
  -d '{"source":"monid","monid":{"provider":"surf",
       "endpoint":"/dex/token/price", ...}}'`;
  return (
    <>
      <Deer x={1400} />
      <FadeIn>
        <div style={{ position: "absolute", left: 140, top: 120 }}>
          <PaperCard rotate={-1.5}>
            <pre style={{ fontFamily: "monospace", fontSize: 24, color: C.ink, margin: 0 }}>{curl}</pre>
          </PaperCard>
        </div>
      </FadeIn>
      <FadeIn delay={40}>
        <div style={{ position: "absolute", right: 160, top: 150, transform: `scale(${0.6 + bloom * 0.4})`, transformOrigin: "center" }}>
          <PaperCard rotate={2} style={{ textAlign: "center" }}>
            <Serif style={{ fontSize: 88, fontWeight: 700, color: C.meadowDark }}>{healthScore}<span style={{ fontSize: 40 }}>/100</span></Serif>
            <Serif style={{ fontSize: 30 }}>healthy · {rowCount} rows</Serif>
          </PaperCard>
        </div>
      </FadeIn>
      <Caption text="One call. Health score, recommendations, no login, no seat." />
    </>
  );
};

const S4_TheReceipt: React.FC<DataGardenProps> = ({ costUsd, seatPriceUsdLow, seatPriceUsdHigh, rowCount }) => {
  const runs = Math.floor(((seatPriceUsdLow + seatPriceUsdHigh) / 2) / costUsd);
  return (
    <>
      <Sunflower x={220} scale={1.3} />
      <FadeIn delay={30}>
        <div style={{ position: "absolute", left: 620, top: 130 }}>
          <PaperCard rotate={-1}>
            <pre style={{ fontFamily: "monospace", fontSize: 26, color: C.ink, margin: 0 }}>{`monidCost: {
  provider: "surf",
  runId:    "01M20SCQV43Y9KDJXWEYS01FY8",
  rowCount: ${rowCount},
  ok:       true
}`}</pre>
          </PaperCard>
        </div>
      </FadeIn>
      <FadeIn delay={80}>
        <div style={{ position: "absolute", right: 180, bottom: 260, textAlign: "center" }}>
          <PaperCard rotate={2}>
            <Serif style={{ fontSize: 96, fontWeight: 700, color: C.accent }}>${costUsd.toFixed(3)}</Serif>
            <Serif style={{ fontSize: 28 }}>measured · per run</Serif>
            <div style={{ height: 14 }} />
            <Serif style={{ fontSize: 30 }}>≈{runs.toLocaleString()} runs for one month of the seat</Serif>
          </PaperCard>
        </div>
      </FadeIn>
      <Caption text="Not a replacement for Dune — an option their pricing left behind." />
    </>
  );
};


const S5_TheSong: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <FadeIn>
        <div style={{ position: "absolute", left: 700, top: 220 }}>
          <PaperCard rotate={-1.5} style={{ textAlign: "center" }}>
            <Serif style={{ fontSize: 40 }}>Alex &amp; Morgan — the briefing</Serif>
            <div style={{ height: 20 }} />
            <svg width={420} height={70}>
              {Array.from({ length: 40 }).map((_, i) => {
                const h = 12 + Math.abs(Math.sin((i + frame) / 5)) * 50;
                return <rect key={i} x={i * 10.5} y={35 - h / 2} width={6} height={h} rx={3} fill={C.accent} />;
              })}
            </svg>
            <div style={{ height: 14 }} />
            <Serif style={{ fontSize: 26, color: C.accent }}>x402 · USDT · settles only after success</Serif>
          </PaperCard>
        </div>
      </FadeIn>
      <Butterfly x={520} y={200} scale={0.8} />
      <Caption text="Two analysts, one audio briefing, delivered to any agent over x402." />
    </>
  );
};

const S6_Close: React.FC<DataGardenProps> = ({ costUsd }) => {
  const scale = spring({ frame: useCurrentFrame(), fps: FPS, config: { damping: 200 } });
  return (
    <>
      <Sunflower x={560} scale={1.35} label="DUNE" />
      <Sunflower x={1160} scale={1.0} label="MONID" />
      <Butterfly x={880} y={240} />
      <FadeIn delay={40}>
        <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", transform: `scale(${scale})` }}>
          <Serif style={{ fontSize: 84, fontWeight: 700 }}>We Kill <span style={{ fontStyle: "italic", color: C.accent }}>(Them With Kindness)</span></Serif>
          <div style={{ height: 20 }} />
          <Serif style={{ fontSize: 32 }}>Any Monid endpoint · a health score · a narration · the exact cents it cost</Serif>
          <div style={{ height: 16 }} />
          <Serif style={{ fontFamily: "monospace", fontSize: 26, color: C.meadowDark }}>
            databard.persidian.com/api/mcp/health-check · last run: ${costUsd.toFixed(3)}
          </Serif>
        </div>
      </FadeIn>
      <Caption text="Thank you for the foundation, Dune. We killed them with kindness." />
    </>
  );
};

// ── master composition ──────────────────────────────────────────────────────
export const DataGarden: React.FC<DataGardenProps> = (props) => {
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      {/* scene boundaries in frames @30fps — matches docs/MONID_VIDEO_SCRIPT.md */}
      <Sequence from={0} durationInFrames={FPS * 12}><Grass /><S1_ThanksDune /><Grain /></Sequence>
      <Sequence from={FPS * 12} durationInFrames={FPS * 12}><Grass /><S2_TheSeed /><Grain /></Sequence>
      <Sequence from={FPS * 24} durationInFrames={FPS * 18}><Grass /><S3_TheBloom {...props} /><Grain /></Sequence>
      <Sequence from={FPS * 42} durationInFrames={FPS * 18}><Grass /><S4_TheReceipt {...props} /><Grain /></Sequence>
      <Sequence from={FPS * 60} durationInFrames={FPS * 15}><Grass /><S5_TheSong /><Grain /></Sequence>
      <Sequence from={FPS * 75} durationInFrames={FPS * 13}><Grass /><S6_Close {...props} /><Grain /></Sequence>
    </AbsoluteFill>
  );
};

