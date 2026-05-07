"use client";

import { useState, useEffect, useReducer, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import { GenerationProgress } from "@/components/GenerationProgress";
import { ProviderStatus } from "@/components/ProviderStatus";
import { SolanaWalletConnect } from "@/components/SolanaWalletConnect";
import { useToast } from "@/components/Toast";
import type { Episode, DataSource } from "@/lib/types";

type OMMode = "sandbox" | "custom";

const DEFAULT_OM_SANDBOX_URL = process.env.NEXT_PUBLIC_OM_SANDBOX_URL || "https://sandbox.open-metadata.org";

// ─── State machine ───
type WizardStep = "landing" | "connect" | "pick-schema" | "generating" | "episode";

const WIZARD_STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: "connect", label: "Connect", icon: "🔌" },
  { key: "pick-schema", label: "Pick a dataset", icon: "📋" },
  { key: "generating", label: "Create episode", icon: "⚡" },
  { key: "episode", label: "Listen", icon: "🎧" },
];

type WizardAction =
  | { type: "SHOW_CONNECT" }
  | { type: "CONNECTED"; schemas: string[] }
  | { type: "START_GENERATING" }
  | { type: "BACK_TO_SCHEMA" }
  | { type: "EPISODE_READY" }
  | { type: "RESET" };

function wizardReducer(state: WizardStep, action: WizardAction): WizardStep {
  switch (action.type) {
    case "SHOW_CONNECT": return "connect";
    case "CONNECTED": return action.schemas.length > 0 ? "pick-schema" : "connect";
    case "START_GENERATING": return "generating";
    case "BACK_TO_SCHEMA": return "pick-schema";
    case "EPISODE_READY": return "episode";
    case "RESET": return "landing";
    default: return state;
  }
}

// ─── Wizard step indicator ───
function StepIndicator({ current }: { current: WizardStep }) {
  if (current === "landing") return null;
  const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === current);
  return (
    <nav className="w-full max-w-lg mx-auto mb-6 animate-fade-in" aria-label="Progress">
      <ol className="flex items-center justify-between">
        {WIZARD_STEPS.map((step, i) => {
          const isComplete = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <li key={step.key} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <div className={`absolute top-4 -left-1/2 w-full h-0.5 ${isComplete ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                  isComplete ? "bg-[var(--accent)] text-white" : isActive ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent)]/20 scale-110" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                {isComplete ? "✓" : step.icon}
              </div>
              <span className={`text-xs mt-1.5 ${isActive ? "text-[var(--text)] font-medium" : "text-[var(--text-muted)]"}`}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Skeleton loader ───
function ConnectingSkeleton() {
  return (
    <div className="w-full max-w-md flex flex-col gap-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--border)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-[var(--border)] rounded w-3/4" />
            <div className="h-2 bg-[var(--border)] rounded w-1/2" />
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--text-muted)] text-center">Discovering schemas…</p>
    </div>
  );
}

export default function Home() {
  const [wizardStep, dispatch] = useReducer(wizardReducer, "landing");

  const [source, setSource] = useState<DataSource>("openmetadata");
  const [omMode, setOmMode] = useState<OMMode>("sandbox");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [omUrl, setOmUrl] = useState("http://localhost:8585");
  const [token, setToken] = useState("");
  const [dbtAccountId, setDbtAccountId] = useState("");
  const [dbtProjectId, setDbtProjectId] = useState("");
  const [dbtToken, setDbtToken] = useState("");

  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("");
  const [genStep, setGenStep] = useState(-1);
  const [genSegments, setGenSegments] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [genStartedAt, setGenStartedAt] = useState(0);
  const [genFindings, setGenFindings] = useState<string[]>([]);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [persona, setPersona] = useState<"enterprise" | "web3">("enterprise");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const { publicKey: solanaPublicKey, signTransaction: solanaSignTx } = useWallet();
  const [mintStats, setMintStats] = useState<{ total: number; recent: Array<{ schemaName: string; healthScore: number; walletAddress: string; txSignature: string; network: string; createdAt: string }> } | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [connectionTested, setConnectionTested] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [schemaPage, setSchemaPage] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [graphUrl, setGraphUrl] = useState("");
  const [graphApiKey, setGraphApiKey] = useState("");
  const [duneApiKey, setDuneApiKey] = useState("");
  const [duneNamespace, setDuneNamespace] = useState("");
  const [duneQueryUrl, setDuneQueryUrl] = useState("");

  const { toast } = useToast();

  /** Show error as both toast and status bar */
  function showError(message: string) {
    toast(message, "error");
    setStatus(`Error: ${message}`);
  }

  // When persona switches, pre-select the most relevant source
  useEffect(() => {
    if (persona === "web3" && (source === "openmetadata" || source === "dbt-cloud" || source === "dbt-local")) {
      setSource("dune");
    } else if (persona === "enterprise" && (source === "the-graph" || source === "dune")) {
      setSource("openmetadata");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona]);

  // Load aggregate Solana mint stats whenever the web3 persona is active. Used
  // for the social-proof pill in the hero. Failures are silent — the pill just
  // doesn't render.
  const loadMintStats = useCallback(async () => {
    try {
      const res = await fetch("/api/onchain/mints/stats?limit=5");
      const data = await res.json();
      if (data.ok) {
        setMintStats({ total: data.total ?? 0, recent: data.recent ?? [] });
      }
    } catch { /* swallow — stats are decorative */ }
  }, []);

  useEffect(() => {
    if (persona === "web3") loadMintStats();
  }, [persona, loadMintStats]);

  // Restore connection config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("databard:connection");
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.source) setSource(cfg.source);
        if (cfg.omMode === "sandbox" || cfg.omMode === "custom") setOmMode(cfg.omMode);
        if (cfg.researchQuestion) setResearchQuestion(cfg.researchQuestion);
        if (cfg.omUrl) setOmUrl(cfg.omUrl);
        if (cfg.token) setToken(cfg.token);
        if (cfg.dbtAccountId) setDbtAccountId(cfg.dbtAccountId);
        if (cfg.dbtProjectId) setDbtProjectId(cfg.dbtProjectId);
        if (cfg.dbtToken) setDbtToken(cfg.dbtToken);
      }
    } catch { /* ignore corrupt localStorage */ }
  }, []);

  useEffect(() => {
    try {
      setWalletAddress(localStorage.getItem("databard:initiaAddress"));
    } catch {
      setWalletAddress(null);
    }
  }, []);

  // Persist connection config to localStorage (excluding sensitive tokens from localStorage for security)
  useEffect(() => {
    try {
      localStorage.setItem("databard:connection", JSON.stringify({
        source, omMode, researchQuestion, omUrl, dbtAccountId, dbtProjectId,
      }));
    } catch { /* quota exceeded or private mode */ }
  }, [source, omMode, researchQuestion, omUrl, dbtAccountId, dbtProjectId]);

  // Handle checkout cancellation return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // Pre-fill first question preset when entering schema picker with empty question
  useEffect(() => {
    if (wizardStep === "pick-schema" && !researchQuestion) {
      const presets = persona === "enterprise"
        ? ["What tables are most likely to break downstream?", "Where are the biggest coverage gaps?", "What changed since last week?"]
        : ["Which entities are behind on freshness?", "Where is the biggest indexer risk?", "What protocol issue should we fix first?"];
      setResearchQuestion(presets[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep]);

  // Reset connection test state when credentials change
  useEffect(() => {
    setConnectionTested("idle");
  }, [source, omMode, token, omUrl, dbtAccountId, dbtProjectId, dbtToken, graphUrl, graphApiKey, duneApiKey, manifestFile]);

  const filteredSchemas = schemas.filter((s) =>
    s.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Smart schema recommendation: schemas with more dots (deeper hierarchy) tend to be richer
  const recommendedSchema = schemas.length > 1
    ? schemas.reduce((best, s) => (s.split(".").length > best.split(".").length || s.length > best.length ? s : best), schemas[0])
    : schemas[0] ?? null;

  // Auto-expand the group containing the recommended schema on first load
  useEffect(() => {
    if (wizardStep === "pick-schema" && recommendedSchema && expandedGroups.size === 0) {
      const parts = recommendedSchema.split(".");
      const prefix = parts.length > 1 ? parts.slice(0, -1).join(".") : "default";
      setExpandedGroups(new Set([prefix]));
    }
  }, [wizardStep, recommendedSchema]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDemo() {
    dispatch({ type: "START_GENERATING" });
    setGenStep(0);
    setStatus("Loading demo…");

    try {
      const isWeb3 = persona === "web3";
      const sampleUrl = isWeb3 ? "/sample-episode-dune.json" : "/sample-episode.json";
      const audioFile = isWeb3 ? "/demo-episode-dune.mp3" : "/demo-episode.mp3";

      const res = await fetch(sampleUrl);
      const demo: Episode = await res.json();
      setGenStep(2);
      setEpisode(demo);

      // Clear any prior demo audio so we never play the wrong persona's track
      // if the matching mp3 isn't available.
      setAudioUrl(null);

      const audioCheck = await fetch(audioFile, { method: "HEAD" });
      if (audioCheck.ok) {
        setAudioUrl(audioFile);
      } else {
        setStatus("Demo loaded (audio requires ElevenLabs API key to generate)");
      }

      setStatus("");
      dispatch({ type: "EPISODE_READY" });
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Failed to load demo");
      dispatch({ type: "RESET" });
    } finally {
      setGenStep(-1);
    }
  }

  // Build connect request body (shared between test & connect)
  const buildConnectBody = useCallback(async (): Promise<Record<string, unknown> | null> => {
    const body: Record<string, unknown> = { source };
    if (source === "openmetadata") {
      body.omMode = omMode;
      if (omMode === "sandbox") {
        if (token) body.token = token;
      } else {
        if (!omUrl || !token) { showError("URL and token required for custom instance"); return null; }
        body.url = omUrl;
        body.token = token;
      }
    } else if (source === "dbt-cloud") {
      if (!dbtAccountId || !dbtProjectId || !dbtToken) { showError("All fields required"); return null; }
      body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken };
    } else if (source === "dbt-local") {
      if (!manifestFile) { showError("Please upload a manifest.json file"); return null; }
      const text = await manifestFile.text();
      try { JSON.parse(text); } catch { showError("Invalid JSON in manifest file"); return null; }
      body.dbtLocal = { manifestContent: text };
    } else if (source === "the-graph") {
      if (!graphUrl) { showError("Subgraph URL required"); return null; }
      body.theGraph = { subgraphUrl: graphUrl, apiKey: graphApiKey || undefined };
    } else if (source === "dune") {
      if (!duneApiKey) { showError("Dune API key required"); return null; }
      body.dune = { apiKey: duneApiKey, namespace: duneNamespace || undefined, queryUrl: duneQueryUrl || undefined };
    }
    return body;
  }, [source, omMode, token, omUrl, dbtAccountId, dbtProjectId, dbtToken, manifestFile, graphUrl, graphApiKey, duneApiKey, duneNamespace]);

  async function handleTestConnection() {
    setConnectionTested("testing");
    setStatus("");
    const body = await buildConnectBody();
    if (!body) { setConnectionTested("error"); return; }
    try {
      const res = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) {
        setConnectionTested("success");
        setStatus(`✓ Connection valid — ${(data.schemas ?? []).length} schemas available`);
      } else {
        setConnectionTested("error");
        setStatus(`✗ ${data.error}`);
      }
    } catch (e: unknown) {
      setConnectionTested("error");
      setStatus(`✗ ${e instanceof Error ? e.message : "Connection failed"}`);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setStatus("Connecting…");

    const body = await buildConnectBody();
    if (!body) { setConnecting(false); return; }

    try {
      const res = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) {
        const nextSchemas = data.schemas ?? [];
        setSchemas(nextSchemas);
        setSelectedSchema(nextSchemas[0] ?? null);
        setStatus(`Connected — ${nextSchemas.length} schemas found`);
        dispatch({ type: "CONNECTED", schemas: nextSchemas });
      } else {
        showError(data.error);
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  // One-click sandbox: auto-connect without requiring token input
  async function handleQuickSandbox() {
    // Submit lead email if provided (fire-and-forget)
    if (leadEmail.trim()) {
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: leadEmail.trim(), source: "sandbox" }),
      }).catch(() => {});
    }

    setShowEmailGate(false);
    setSource("openmetadata");
    setOmMode("sandbox");
    dispatch({ type: "SHOW_CONNECT" });
    setConnecting(true);
    setStatus("Connecting to sandbox…");

    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "openmetadata", omMode: "sandbox" }),
      });
      const data = await res.json();
      if (data.ok) {
        const nextSchemas = data.schemas ?? [];
        setSchemas(nextSchemas);
        setSelectedSchema(nextSchemas[0] ?? null);
        setStatus(`Connected — ${nextSchemas.length} schemas found`);
        dispatch({ type: "CONNECTED", schemas: nextSchemas });
      } else {
        setStatus(`Sandbox requires a token — ${data.error}`);
        setConnecting(false);
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Connection failed");
      setConnecting(false);
    } finally {
      setConnecting(false);
    }
  }

  async function handleGenerate(schemaFqn: string) {
    dispatch({ type: "START_GENERATING" });
    setGenStep(0);
    setGenSegments(0);
    setGenTotal(0);
    setGenStartedAt(0);
    setGenFindings([]);
    setStatus(`Checking your data…`);

    try {
      const body: Record<string, unknown> = { schemaFqn, source };
      if (researchQuestion.trim()) body.researchQuestion = researchQuestion.trim();
      if (source === "openmetadata") { body.url = omUrl; body.token = token; }
      else if (source === "dbt-cloud") { body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken }; }
      else if (source === "dbt-local" && manifestFile) {
        const text = await manifestFile.text();
        body.dbtLocal = { manifestContent: text };
      } else if (source === "the-graph") {
        body.theGraph = { subgraphUrl: graphUrl, apiKey: graphApiKey || undefined };
      } else if (source === "dune") {
        body.dune = { apiKey: duneApiKey, namespace: duneNamespace || undefined, queryUrl: duneQueryUrl || undefined };
      }

      // Pre-validate schema before committing to full generation
      const validateRes = await fetch("/api/validate-schema", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (validateRes.ok) {
        const validation = await validateRes.json();
        if (validation.quality === "empty") {
          setStatus(`❌ ${validation.message}`);
          dispatch({ type: "BACK_TO_SCHEMA" });
          return;
        }
        if (validation.quality === "thin") {
          setStatus(`⚠️ ${validation.message} — generating anyway…`);
        } else {
          const s = validation.stats;
          setStatus(`✓ Schema looks good (${s.tableCount} tables, ${s.totalTests} tests) — generating…`);
        }
      }

      const res = await fetch("/api/synthesize-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          if (typeof data?.error === "string" && data.error) {
            message = data.error;
          }
        } catch {
          // Keep fallback message for non-JSON responses
        }
        showError(message);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { showError("No response stream"); return; }

      const decoder = new TextDecoder();
      const audioChunks: ArrayBuffer[] = [];
      const segmentByteSizes: Record<number, number> = {};
      let sfxBytes = 0;
      let metadata: Episode | null = null;
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let data: any;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === "metadata") {
            setGenStep(1);
            metadata = {
              schemaFqn: data.schemaFqn, schemaName: data.schemaName, tableCount: data.tableCount,
              qualitySummary: { passed: data.testsTotal - data.testsFailed, failed: data.testsFailed, total: data.testsTotal },
              script: data.script, schemaMeta: data.schemaMeta, researchQuestion: data.researchQuestion,
              researchTrail: data.researchTrail,
              researchSessionId: data.researchSessionId,
            };
            // Extract findings for generation storytelling
            const findings: string[] = [];
            if (data.tableCount) findings.push(`📊 Found ${data.tableCount} tables`);
            if (data.testsFailed > 0) findings.push(`⚠️ ${data.testsFailed} failing test${data.testsFailed > 1 ? "s" : ""} detected`);
            if (data.testsTotal === 0) findings.push(`🔍 No quality tests configured`);
            if (data.schemaMeta?.lineage?.length > 0) findings.push(`🔗 Analyzing lineage for ${data.schemaMeta.lineage.length} edges`);
            if (findings.length > 0) setGenFindings(findings);
          } else if (data.type === "schema_rejected") {
            setStatus(`❌ ${data.message}`);
            dispatch({ type: "BACK_TO_SCHEMA" });
            break;
          } else if (data.type === "quality_warning") {
            setStatus(`⚠️ ${data.message}`);
          } else if (data.type === "estimate") {
            setGenTotal(data.segments);
            setGenStartedAt(Date.now());
            setStatus(`Generating ${data.segments} speech segments + sound effects`);
          } else if (data.type === "audio") {
            setGenStep(2);
            const audioData = Uint8Array.from(atob(data.data as string), (c) => c.charCodeAt(0));
             audioChunks.push(audioData.buffer as ArrayBuffer);
            if (data.segment !== undefined) {
              segmentByteSizes[data.segment] = (segmentByteSizes[data.segment] || 0) + audioData.byteLength;
              setGenSegments((n) => n + 1);
            } else {
              sfxBytes += audioData.byteLength;
            }
            setStatus(`Recording audio… segment ${audioChunks.length}`);
          } else if (data.type === "done" && metadata) {
            // Handle transcript-only episodes (no audio chunks received)
            if (audioChunks.length === 0) {
              setEpisode(metadata);
              setAudioUrl(null);
              setStatus("Transcript ready (no audio generated)");
              dispatch({ type: "EPISODE_READY" });
              break;
            }
            const blob = new Blob(audioChunks, { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            setEpisode({ ...metadata, audioUrl: url });
            setAudioUrl(url);

            // Compute segment time offsets and duration from actual audio byte sizes
            // CBR MP3 at 128kbps = 16,000 bytes/sec
            const totalSegmentBytes = Object.values(segmentByteSizes).reduce((a, b) => a + b, 0);
            const totalBytes = totalSegmentBytes + sfxBytes;
            if (totalBytes > 0) {
              const computedDuration = totalBytes / 16000; // 128kbps CBR
              setAudioDuration(computedDuration);

              if (metadata.script.length > 0 && totalSegmentBytes > 0) {
                let cumulative = 0;
                const offsets = metadata.script.map((_: unknown, i: number) => {
                  const offset = cumulative / totalBytes;
                  cumulative += segmentByteSizes[i] || 0;
                  return offset;
                });
                setSegmentOffsets(offsets);
              }
            }

            setStatus("");
            dispatch({ type: "EPISODE_READY" });
          } else if (data.type === "error") {
            showError(data.error);
          }
        }
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGenStep(-1);
    }
  }

  async function handleCheckout() {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "team" }) });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else showError(data.error || "Checkout not available yet");
  }

  async function handleMint() {
    if (!episode || !walletAddress) return;
    setMinting(true);
    setStatus("Minting on-chain…");

    try {
      // 1. First ensure it's "shared" to get an ID (since minting needs an ID)
      let episodeId = "";
      const shareRes = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(episode),
      });
      const shareData = await shareRes.json();
      if (shareData.ok) {
        episodeId = shareData.id;
      } else {
        throw new Error(shareData.error || "Failed to prepare episode for minting");
      }

      // 2. Compute report hash for tamper-evidence
      const scriptJson = JSON.stringify(episode.script);
      const encoder = new TextEncoder();
      const encodedScript = encoder.encode(scriptJson);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encodedScript as any);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const reportHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      // 3. Mint on-chain
      const res = await fetch("/api/onchain/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaName: episode.schemaName,
          healthScore: episode.qualitySummary.total > 0 ? Math.round((episode.qualitySummary.passed / episode.qualitySummary.total) * 100) : 100,
          episodeId: episodeId,
          reportHash,
          initiaAddress: walletAddress,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus(`✓ Minted on-chain! ${data.txHash ? `TX: ${data.txHash.slice(0, 8)}…` : "(Stubbed)"}`);
      } else {
        showError(data.error);
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Minting failed");
    } finally {
      setMinting(false);
    }
  }

  async function handleMintSolana() {
    if (!episode || !solanaPublicKey || !solanaSignTx) return;
    setMinting(true);
    setStatus("Minting on Solana…");

    try {
      // 1. Share episode to get an ID
      let episodeId = "";
      const shareRes = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(episode),
      });
      const shareData = await shareRes.json();
      if (shareData.ok) {
        episodeId = shareData.id;
      } else {
        throw new Error(shareData.error || "Failed to prepare episode for minting");
      }

      // 2. Compute report hash for tamper-evidence
      const scriptJson = JSON.stringify(episode.script);
      const encoder = new TextEncoder();
      const encodedScript = encoder.encode(scriptJson);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encodedScript as any);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const reportHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      // 3. Get unsigned transaction from server
      const healthScore = episode.qualitySummary.total > 0
        ? Math.round((episode.qualitySummary.passed / episode.qualitySummary.total) * 100)
        : 100;

      const mintRes = await fetch("/api/onchain/mint-solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaName: episode.schemaName,
          healthScore,
          episodeId,
          reportHash,
          walletAddress: solanaPublicKey.toBase58(),
        }),
      });
      const mintData = await mintRes.json();
      if (!mintData.ok) throw new Error(mintData.error || "Mint failed");

      // 4. Sign and submit
      const { Transaction } = await import("@solana/web3.js");
      const tx = Transaction.from(Buffer.from(mintData.unsignedTxBase64, "base64"));
      const signedTx = await solanaSignTx(tx);
      const sig = await fetch("/api/onchain/mint-solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaName: episode.schemaName,
          healthScore,
          episodeId,
          reportHash,
          walletAddress: solanaPublicKey.toBase58(),
          signedTxBase64: Buffer.from(signedTx.serialize()).toString("base64"),
        }),
      });
      const sigData = await sig.json();
      if (sigData.ok) {
        toast(`Minted on Solana! ${sigData.txSignature?.slice(0, 8)}…`, "success");
        setStatus(`✓ Minted on Solana! TX: ${sigData.txSignature?.slice(0, 8)}…`);
        // Refresh the social-proof counter so the user sees their own mint reflected.
        loadMintStats();
      } else {
        showError(sigData.error);
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Solana minting failed");
    } finally {
      setMinting(false);
    }
  }

  function reset() {
    setEpisode(null); setAudioUrl(null); setSegmentOffsets([]); setAudioDuration(0); setSelectedSchema(null); setStatus(""); setGenFindings([]);
    dispatch({ type: "RESET" });
  }

  const sourceHelp: Record<DataSource, string> = {
    openmetadata: "Choose the OpenMetadata sandbox for a one-click demo, or connect your own instance.",
    "dbt-cloud": "Find Account ID and Project ID in your dbt Cloud URL. Generate a token at Account Settings → API Access.",
    "dbt-local": "Run `dbt compile` first, then point to the generated manifest.json in your target/ directory.",
    "the-graph": "Paste any subgraph endpoint URL. DataBard introspects the GraphQL schema and treats entities as tables.",
    "dune": "Enter your Dune API key and your Dune username. DataBard runs your queries and analyzes the results to create data-rich episodes.",
  };

  const sourceLabel: Record<DataSource, string> = {
    openmetadata: "OpenMetadata",
    "dbt-cloud": "dbt Cloud",
    "dbt-local": "dbt Local",
    "the-graph": "The Graph",
    dune: "Dune",
  };

  const activeContext =
    source === "openmetadata"
      ? omMode === "sandbox"
        ? `Sandbox · ${DEFAULT_OM_SANDBOX_URL}`
        : `Custom · ${omUrl || "Not set"}`
      : source === "dbt-cloud"
        ? `Account ${dbtAccountId || "?"} · Project ${dbtProjectId || "?"}`
        : source === "dbt-local"
          ? manifestFile?.name || "No manifest uploaded"
          : source === "the-graph"
            ? graphUrl || "No subgraph endpoint set"
            : duneNamespace
              ? `Dune user: ${duneNamespace}`
              : "Dune username optional";

  const questionPresets = persona === "enterprise"
    ? ["What tables are most likely to break downstream?", "Where are the biggest coverage gaps?", "What changed since last week?"]
    : ["Which entities are behind on freshness?", "Where is the biggest indexer risk?", "What protocol issue should we fix first?"];

  // ─── Episode player ───
  if (wizardStep === "episode" && episode) {
    return (
      <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6">
        <StepIndicator current="episode" />
        {/* Demo context banner */}
        {episode.schemaFqn === "analytics.ecommerce" && (
          <div className="w-full max-w-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-center animate-slide-up">
            <p className="text-xs text-[var(--text-muted)]">
              🎧 Demo episode analyzing a sample <span className="text-[var(--text)]">e-commerce schema</span> — 6 tables, 3 failing tests, PII governance gaps, and stale pipelines
            </p>
          </div>
        )}
        {episode.schemaFqn === "dune.uniswap" && (
          <div className="w-full max-w-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-center animate-slide-up">
            <p className="text-xs text-[var(--text-muted)]">
              📊 Demo episode analyzing <span className="text-[var(--text)]">Uniswap onchain data</span> via Dune — 6 queries with real column stats, broken whale tracking, and missing documentation
            </p>
          </div>
        )}
        <EpisodePlayer 
          episode={episode} 
          audioUrl={audioUrl} 
          segmentOffsets={segmentOffsets}
          audioDuration={audioDuration}
          onMint={persona === "web3" && solanaPublicKey ? handleMintSolana : persona === "web3" && walletAddress ? handleMint : undefined}
          minting={minting}
        />

        <div className="flex flex-col items-center gap-3">
          <button onClick={reset} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            ← Generate another
          </button>

          {/* Post-experience upsell */}
{persona === "web3" ? (
             <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-4 max-w-md text-center animate-slide-up">
               <p className="text-sm mb-2">Save this report to the blockchain</p>
               <p className="text-xs text-[var(--text-muted)] mb-3">
                 Create a permanent, shareable record of this health report.
               </p>

               {/* Solana (primary) */}
               <div className="mb-3">
                 <SolanaWalletConnect onAddressChange={setSolanaAddress} />
                 {solanaPublicKey && (
                   <button 
                     onClick={handleMintSolana} 
                     disabled={minting}
                     className="mt-2 w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-6 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
                   >
                     {minting ? "Minting…" : "Mint on Solana"}
                   </button>
                 )}
               </div>

               {/* Initia (secondary) */}
               {walletAddress && (
                 <div className="border-t border-[var(--border)] pt-3">
                   <p className="text-xs text-[var(--text-muted)] mb-2">Initia: {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</p>
                   <button 
                     onClick={handleMint} 
                     disabled={minting}
                     className="w-full bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] rounded-lg px-4 py-1.5 text-xs cursor-pointer disabled:opacity-50"
                   >
                     {minting ? "Minting…" : "Mint on Initia"}
                   </button>
                 </div>
               )}
             </div>
           ) : (
            <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-4 max-w-md text-center animate-slide-up">
              <p className="text-sm mb-2">Want this for your team every week?</p>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Scheduled episodes, private feeds, Slack notifications — $29/mo
              </p>
              <button onClick={handleCheckout} className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-xs font-medium cursor-pointer">
                Start Pro trial
              </button>
            </div>
          )}
        </div>
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </main>
    );
  }

  // ─── Generating ───
  if (wizardStep === "generating") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
        <StepIndicator current="generating" />
        <GenerationProgress currentStep={genStep} segmentsComplete={genSegments} segmentsTotal={genTotal} startedAt={genStartedAt} findings={genFindings} />
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </main>
    );
  }

  // ─── Schema picker ───
  const SCHEMAS_PER_PAGE = 10;
  const groupedSchemas = (() => {
    const groups: Record<string, string[]> = {};
    for (const s of filteredSchemas) {
      const parts = s.split(".");
      const prefix = parts.length > 1 ? parts.slice(0, -1).join(".") : "default";
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(s);
    }
    return groups;
  })();

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }

  if (wizardStep === "pick-schema") {
    const groupKeys = Object.keys(groupedSchemas);
    const hasMultipleGroups = groupKeys.length > 1;
    const totalPages = Math.ceil(filteredSchemas.length / SCHEMAS_PER_PAGE);
    const paginatedSchemas = filteredSchemas.slice(schemaPage * SCHEMAS_PER_PAGE, (schemaPage + 1) * SCHEMAS_PER_PAGE);

    // Sort groups: recommended group first, then alphabetically
    const recommendedGroup = recommendedSchema
      ? (() => { const p = recommendedSchema.split("."); return p.length > 1 ? p.slice(0, -1).join(".") : "default"; })()
      : null;
    const sortedGroupKeys = [...groupKeys].sort((a, b) => {
      if (a === recommendedGroup) return -1;
      if (b === recommendedGroup) return 1;
      return a.localeCompare(b);
    });

    return (
      <main className="min-h-screen flex flex-col items-center justify-start pt-12 p-4 sm:p-8 gap-6">
        <StepIndicator current="pick-schema" />
        <div className="w-full max-w-3xl flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Select a schema</h2>
            <button onClick={reset} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">← Back</button>
          </div>

          {/* Context bar — compact */}
          <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <span className="text-lg">🔌</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{sourceLabel[source]} · {activeContext}</p>
              <p className="text-xs text-[var(--text-muted)]">{filteredSchemas.length} schema{filteredSchemas.length !== 1 ? "s" : ""} available</p>
            </div>
          </div>

          {/* Two-column layout: left = schema list, right = question + action */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Schema list — left 3 cols */}
            <div className="md:col-span-3 flex flex-col gap-3">
              {schemas.length > 5 && (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">🔍</span>
                  <input type="text" placeholder="Search schemas…" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setSchemaPage(0); }}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none transition-colors" />
                </div>
              )}
              <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 scrollbar-thin">
                {filteredSchemas.length === 0
                  ? <p className="text-sm text-[var(--text-muted)] text-center py-8">No schemas match your search</p>
                  : hasMultipleGroups
                    ? sortedGroupKeys.flatMap((group) => {
                        const items = groupedSchemas[group];
                        const hasRecommended = items.includes(recommendedSchema ?? "");
                        const groupLeaf = group.split(".").slice(-1)[0] ?? group;
                        return [
                          <div key={`hdr-${group}`} className="flex items-center gap-2 px-3 py-1.5 mt-1 first:mt-0">
                            <span className={`text-[11px] font-semibold uppercase tracking-wider ${hasRecommended ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                              {groupLeaf}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">({items.length})</span>
                            {hasRecommended && <span className="text-[10px] text-[var(--accent)]">⭐</span>}
                            <div className="flex-1 h-px bg-[var(--border)]" />
                          </div>,
                          ...items.map((s) => {
                            const leaf = s.split(".").slice(-1)[0] ?? s;
                            const isSelected = selectedSchema === s;
                            const isRecommended = s === recommendedSchema;
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSelectedSchema(s)}
                                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-[var(--accent)] text-white shadow-sm"
                                    : "hover:bg-[var(--bg)]"
                                }`}
                              >
                                <span className="text-sm">{isSelected ? "✓" : "○"}</span>
                                <span className={`text-sm flex-1 min-w-0 truncate ${isSelected ? "font-semibold" : "font-medium"}`}>{leaf}</span>
                                {isRecommended && !isSelected && <span className="text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded-full shrink-0">⭐</span>}
                              </button>
                            );
                          }),
                        ];
                      })
                    : paginatedSchemas.map((s) => {
                        const leaf = s.split(".").slice(-1)[0] ?? s;
                        const isSelected = selectedSchema === s;
                        const isRecommended = s === recommendedSchema;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSelectedSchema(s)}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[var(--accent)] text-white shadow-sm"
                                : "hover:bg-[var(--bg)]"
                            }`}
                          >
                            <span className="text-sm">{isSelected ? "✓" : "○"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${isSelected ? "font-semibold" : "font-medium"}`}>{leaf}</span>
                                {isRecommended && !isSelected && <span className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded-full">⭐</span>}
                              </div>
                              <p className={`text-xs truncate mt-0.5 ${isSelected ? "text-white/70" : "text-[var(--text-muted)]"}`}>{s}</p>
                            </div>
                          </button>
                        );
                      })
                }
              </div>
              {!hasMultipleGroups && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSchemaPage((p) => Math.max(0, p - 1))}
                    disabled={schemaPage === 0}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >← Prev</button>
                  <span className="text-xs text-[var(--text-muted)]">{schemaPage + 1} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setSchemaPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={schemaPage >= totalPages - 1}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >Next →</button>
                </div>
              )}
            </div>

            {/* Right panel — question + generate */}
            <div className="md:col-span-2 flex flex-col gap-4">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
                <label className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-medium">Your question</label>
                <textarea
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm min-h-20 resize-y focus:border-[var(--accent)] focus:outline-none transition-colors"
                  value={researchQuestion}
                  onChange={(e) => setResearchQuestion(e.target.value)}
                  placeholder={persona === "enterprise"
                    ? "What is the biggest risk in this dataset?"
                    : "Which data health issue should we investigate first?"}
                />
                <p className="text-xs text-[var(--text-muted)] -mt-1">This guides what the AI hosts investigate. Pick a preset or write your own.</p>
                <div className="flex flex-wrap gap-1.5">
                  {questionPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setResearchQuestion(preset)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                        researchQuestion === preset
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]"
                          : "border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--text)] text-[var(--text-muted)]"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected schema + generate CTA */}
              <div className={`border rounded-xl p-4 flex flex-col gap-3 transition-all overflow-hidden ${
                selectedSchema
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}>
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-medium">Selected dataset</p>
                {selectedSchema ? (
                  <div className="min-w-0">
                    <p className="text-base font-semibold truncate">{selectedSchema.split(".").slice(-1)[0]}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 break-all">{selectedSchema}</p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic">← Pick a schema from the list</p>
                )}
                <button
                  type="button"
                  onClick={() => selectedSchema && handleGenerate(selectedSchema)}
                  disabled={!selectedSchema}
                  className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-3 text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.01] shrink-0"
                >
                  {selectedSchema ? "⚡ Generate episode" : "Select a schema first"}
                </button>
              </div>
            </div>
          </div>
        </div>
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </main>
    );
  }

  // ─── Landing page ───
  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8">
      {/* Persona Toggle */}
      <div className="flex bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)] mb-8 animate-fade-in">
        <button 
          onClick={() => setPersona("enterprise")}
          className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${persona === "enterprise" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
        >
          📊 Data teams
        </button>
        <button 
          onClick={() => setPersona("web3")}
          className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${persona === "web3" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
        >
          ⛓️ Onchain teams
        </button>
      </div>

      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-8 sm:pt-12 pb-10 sm:pb-14 max-w-2xl">
        <p className="text-xs text-[var(--accent)] font-medium tracking-wider uppercase mb-4">
          {persona === "enterprise" ? "AI podcast episodes for your data catalog" : "AI podcast episodes for your onchain data"}
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
          {persona === "enterprise" ? "Your data catalog," : "Your onchain data,"}<br />as a podcast
        </h1>
        <p className="text-lg sm:text-xl text-[var(--text-muted)] mb-8 max-w-lg">
          {persona === "enterprise" 
            ? "Ask a question about your data. Connect your catalog. Get a podcast episode where two AI hosts investigate the answer."
            : "Connect your Dune queries or subgraph. Get a podcast episode where two AI hosts analyze the data — then mint it on Solana."
          }
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-3">
          <button
            onClick={handleDemo}
            className="bg-[var(--accent)] hover:brightness-110 text-white rounded-xl px-8 py-4 text-lg font-medium cursor-pointer transition-all hover:scale-[1.02]"
          >
            ▶ Listen to a demo episode
          </button>
          <Link
            href="/research/sessions"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-4 text-sm font-medium text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Browse saved sessions
          </Link>
        </div>
        <p className="text-xs text-[var(--text-muted)]">No signup required · 30 seconds to hear it</p>

        {/* On-chain social proof pill — only on web3 persona, only when there's something to show. */}
        {persona === "web3" && mintStats && mintStats.total > 0 && (
          <Link
            href="/onchain"
            className="mt-4 inline-flex items-center gap-2 text-xs bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 rounded-full px-3 py-1.5 font-medium transition-colors"
            title="View the On-Chain Health Wall"
          >
            <span>⛓️</span>
            <span>
              <b>{mintStats.total.toLocaleString()}</b> health report{mintStats.total === 1 ? "" : "s"} minted on Solana
            </span>
            {mintStats.recent[0] && (
              <span className="text-[var(--text-muted)] font-normal hidden sm:inline">
                · last by {mintStats.recent[0].walletAddress.slice(0, 4)}…{mintStats.recent[0].walletAddress.slice(-4)}
              </span>
            )}
          </Link>
        )}
      </section>

      {/* Social proof */}
      <section className="flex flex-wrap justify-center gap-6 text-xs text-[var(--text-muted)] pb-8 sm:pb-10 max-w-2xl">
        {persona === "enterprise" ? (
          <>
            <span>Built on <span className="text-[var(--text)]">OpenMetadata</span></span>
            <span>·</span>
            <span>Voices by <span className="text-[var(--text)]">ElevenLabs</span></span>
            <span>·</span>
            <span>Works with <span className="text-[var(--text)]">dbt, OpenMetadata & Dune</span></span>
          </>
        ) : (
          <>
            <span>Built on <span className="text-[var(--text)]">Solana & ElevenLabs</span></span>
            <span>·</span>
            <span>Voices by <span className="text-[var(--text)]">ElevenLabs</span></span>
            <span>·</span>
            <span>Works with <span className="text-[var(--text)]">Dune, The Graph & Palm USD</span></span>
          </>
        )}
      </section>

      {/* Connect CTA — prominent, right after hero */}
      <section className="w-full max-w-md pb-10 sm:pb-14 flex flex-col gap-4" id="connect">
        {/* Provider Status */}
        <ProviderStatus />

        {persona === "web3" && (
          <div className="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-sm font-medium text-center">Connect your Solana wallet to mint episodes on-chain</p>
            <SolanaWalletConnect onAddressChange={setSolanaAddress} />
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-muted)]">or connect a data source below</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>
          </div>
        )}

        {/* Skeleton loader while connecting */}
        {connecting && <ConnectingSkeleton />}

        {wizardStep === "landing" && !connecting ? (
          <div className="flex flex-col gap-3">
            {showEmailGate ? (
              <div className="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-xl p-4 flex flex-col gap-3 animate-slide-up">
                <p className="text-sm text-[var(--text)]">Enter your email for updates <span className="text-[var(--text-muted)]">(optional)</span></p>
                <input
                  type="email"
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
                  placeholder="you@company.com"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQuickSandbox()}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={handleQuickSandbox}
                    className="flex-1 bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2.5 text-sm font-medium cursor-pointer transition-all">
                    {leadEmail.trim() ? "Continue →" : "Skip & Continue →"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => persona === "web3" ? handleDemo() : setShowEmailGate(true)}
                className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-xl px-6 py-4 text-base font-medium cursor-pointer transition-all hover:scale-[1.02] shadow-lg shadow-[var(--accent)]/20">
                ⚡ {persona === "web3" ? "Try Dune demo" : "Try with sample data"}
              </button>
            )}
            <button onClick={() => dispatch({ type: "SHOW_CONNECT" })}
              className="w-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-xl px-6 py-3 text-sm font-medium cursor-pointer transition-colors">
              {persona === "enterprise" ? "🔌 Connect your data source" : "🔌 Connect your data source"}
            </button>
          </div>
        ) : wizardStep === "connect" && !connecting ? (
          <div className="flex flex-col gap-4 bg-[var(--surface)] p-6 rounded-xl border-2 border-[var(--accent)] animate-slide-up shadow-lg">
            <StepIndicator current="connect" />
            <h3 className="text-sm font-semibold">Connect data source</h3>
            <label className="text-sm text-[var(--text-muted)]">Data Source</label>
            <select className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm cursor-pointer"
              value={source} onChange={(e) => setSource(e.target.value as DataSource)}>
              <optgroup label="📊 Data stack">
                <option value="openmetadata">OpenMetadata</option>
                <option value="dbt-cloud">dbt Cloud</option>
                <option value="dbt-local">dbt Local (manifest.json)</option>
              </optgroup>
              <optgroup label="⛓️ Onchain">
                <option value="the-graph">The Graph (subgraph)</option>
                <option value="dune">Dune Analytics</option>
              </optgroup>
            </select>
            <p className="text-xs text-[var(--text-muted)] -mt-2">{sourceHelp[source]}</p>

            {source === "openmetadata" && (<>
              <label className="text-sm text-[var(--text-muted)]">OpenMetadata Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOmMode("sandbox")}
                  className={`text-left border rounded-lg px-3 py-2 text-xs cursor-pointer ${omMode === "sandbox" ? "border-[var(--accent)] bg-[var(--bg)]" : "border-[var(--border)]"}`}
                >
                  <p className="font-medium text-[var(--text)]">Use Sandbox</p>
                  <p className="text-[var(--text-muted)]">Fastest way to try DataBard with sample metadata.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setOmMode("custom")}
                  className={`text-left border rounded-lg px-3 py-2 text-xs cursor-pointer ${omMode === "custom" ? "border-[var(--accent)] bg-[var(--bg)]" : "border-[var(--border)]"}`}
                >
                  <p className="font-medium text-[var(--text)]">Connect Your Instance</p>
                  <p className="text-[var(--text-muted)]">Use your own OpenMetadata URL and bot token.</p>
                </button>
              </div>

              {omMode === "sandbox" ? (
                <>
                  <label className="text-sm text-[var(--text-muted)]">Sandbox Endpoint</label>
                  <input
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-muted)]"
                    value={DEFAULT_OM_SANDBOX_URL}
                    readOnly
                  />
                  <label className="text-sm text-[var(--text-muted)]">Sandbox Token (optional)</label>
                  <input
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste your OpenMetadata PAT/JWT if sandbox is not preconfigured"
                  />
                  <p className="text-xs text-[var(--text-muted)] -mt-2">Leave blank if admin configured shared sandbox credentials.</p>
                </>
              ) : (
                <>
                  <label className="text-sm text-[var(--text-muted)]">OpenMetadata URL</label>
                  <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={omUrl} onChange={(e) => setOmUrl(e.target.value)} placeholder="http://localhost:8585" title="The base URL of your OpenMetadata instance. Default is http://localhost:8585 for local Docker installs." />
                  <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
                  <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="JWT from Settings → Bots" title="Find this in OpenMetadata: Settings → Bots → Ingestion Bot → Copy Token. It's a long JWT string." />
                </>
              )}
            </>)}
            {source === "dbt-cloud" && (<>
              <label className="text-sm text-[var(--text-muted)]">Account ID</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtAccountId} onChange={(e) => setDbtAccountId(e.target.value)} placeholder="From URL: cloud.getdbt.com/deploy/{id}" title="Find this in your dbt Cloud URL: cloud.getdbt.com/deploy/{account_id}/..." />
              <label className="text-sm text-[var(--text-muted)]">Project ID</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtProjectId} onChange={(e) => setDbtProjectId(e.target.value)} placeholder="From URL: …/projects/{id}" title="Find this in your dbt Cloud URL: .../projects/{project_id}/..." />
              <label className="text-sm text-[var(--text-muted)]">API Token</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" autoComplete="off" value={dbtToken} onChange={(e) => setDbtToken(e.target.value)} placeholder="Account Settings → API Access" title="Generate at: dbt Cloud → Account Settings → API Access → Service Tokens. Needs 'Metadata Only' permission." />
            </>)}
            {source === "dbt-local" && (<>
              <label className="text-sm text-[var(--text-muted)]">Upload manifest.json</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm w-full file:mr-3 file:rounded file:border-0 file:bg-[var(--accent)] file:text-white file:px-3 file:py-1 file:text-xs file:cursor-pointer"
                />
                {manifestFile && (
                  <p className="text-xs text-[var(--success)] mt-1">✓ {manifestFile.name} ({(manifestFile.size / 1024).toFixed(0)} KB)</p>
                )}
              </div>
            </>)}
            {source === "the-graph" && (<>
              <label className="text-sm text-[var(--text-muted)]">Subgraph Endpoint URL</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={graphUrl} onChange={(e) => setGraphUrl(e.target.value)} placeholder="https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3" title="The GraphQL endpoint for your subgraph. Works with The Graph hosted service or decentralized network." />
              <label className="text-sm text-[var(--text-muted)]">API Key (optional)</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" autoComplete="off" value={graphApiKey} onChange={(e) => setGraphApiKey(e.target.value)} placeholder="For The Graph Network endpoints" title="Required for The Graph Network (gateway.thegraph.com). Leave blank for hosted service." />
            </>)}
            {source === "dune" && (<>
              {persona === "web3" && (
                <div className="bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-lg px-4 py-3 text-xs text-[var(--text-muted)]">
                  <p className="flex items-center gap-2 text-[var(--text)] font-medium mb-1">
                    <span>💡</span>
                    <span>Getting started with Dune</span>
                  </p>
                  <p className="leading-relaxed">
                    Create a free API key at <a href="https://dune.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">dune.com/settings/api</a>. 
                    DataBard will analyze queries in your namespace and narrate the results.
                  </p>
                </div>
              )}
              <label className="text-sm text-[var(--text-muted)]">Dune API Key</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" autoComplete="off" value={duneApiKey} onChange={(e) => setDuneApiKey(e.target.value)} placeholder="Paste your Dune API key" title="Generate at dune.com → Settings → API. Free tier available. DataBard uses this to fetch query metadata and execute non-parameterized queries for result analysis." />
              
              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--text-muted)]">Analyze specific queries</label>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Recommended</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <input 
                  className={`bg-[var(--bg)] border rounded-lg px-4 py-2 text-sm transition-colors ${
                    duneQueryUrl && !duneQueryUrl.split(",").every(s => s.trim().match(/queries\/(\d+)|^\d+$/))
                      ? "border-yellow-500/50 focus:border-yellow-500" 
                      : "border-[var(--border)] focus:border-[var(--accent)]"
                  }`} 
                  value={duneQueryUrl} 
                  onChange={(e) => setDuneQueryUrl(e.target.value)} 
                  placeholder="dune.com/queries/123, 456..." 
                  title="Analyze specific queries directly. Comma-separated URLs or IDs supported." 
                />
                {duneQueryUrl && !duneQueryUrl.split(",").every(s => s.trim().match(/queries\/(\d+)|^\d+$/)) && (
                  <p className="text-[10px] text-yellow-500 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>Please provide valid Query URLs or IDs (comma-separated). Dashboards/Blockchains not yet supported.</span>
                  </p>
                )}
                {!duneQueryUrl && (
                  <p className="text-[10px] text-[var(--text-muted)] opacity-60">Paste multiple query URLs (comma-separated) for a batch report</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--text-muted)]">Dune Username</label>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Browse all</span>
              </div>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={duneNamespace} onChange={(e) => setDuneNamespace(e.target.value)} placeholder="e.g. uniswap (defaults to your own)" title="Your Dune username or team name. DataBard fetches your queries, runs them, and analyzes the results." />
            </>)}

            {source !== "dbt-local" && (
              <p className="text-xs text-[var(--text-muted)] -mt-2 flex items-center gap-1 opacity-70">
                <span>🔒</span> Credentials are sent over HTTPS and never stored on disk
              </p>
            )}

            <div className="flex flex-col gap-2 mt-2">
              <button onClick={handleConnect} disabled={connecting} className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:scale-[1.01] shadow-md shadow-[var(--accent)]/10">
                {connecting && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {connecting ? "Connecting…" : "Connect & Continue →"}
              </button>
              <button onClick={handleTestConnection} disabled={connectionTested === "testing"} className="w-full bg-transparent hover:bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
                {connectionTested === "testing" && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--text-muted)]/30 border-t-[var(--text-muted)] rounded-full animate-spin" />}
                {connectionTested === "success" && <span className="text-[var(--success)]">✓</span>}
                {connectionTested === "error" && <span className="text-red-500">✗</span>}
                Test Connection
              </button>
            </div>
            <button onClick={() => dispatch({ type: "RESET" })} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer text-center mt-2">← Back</button>
          </div>
        ) : null}
        {status && <p className="text-sm text-[var(--text-muted)] text-center mt-4">{status}</p>}
      </section>

      {/* Plans — includes "what you get" features */}
      <section className="w-full max-w-3xl pb-8 sm:pb-12" id="pricing">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-2">Plans</h2>
        <p className="text-sm text-[var(--text-muted)] text-center mb-6">Start free. Upgrade when your team needs scheduled episodes.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-lg mb-1">Free</h3>
            <p className="text-3xl font-bold mb-3">$0</p>
            <ul className="text-sm text-[var(--text-muted)] space-y-1.5 mb-4">
              <li>✓ Unlimited one-off episodes</li>
              <li>✓ All data sources</li>
              <li>✓ Health score & coverage analysis</li>
              <li>✓ {persona === "enterprise" ? "Test failure" : "Indexer lag"} breakdown</li>
              <li>✓ Data flow risk analysis</li>
              <li>✓ {persona === "enterprise" ? "Sensitive data & governance flags" : "On-chain verification"}</li>
              <li>✓ Prioritized action items</li>
              <li>✓ MP3 download & sharing</li>
            </ul>
            <button onClick={handleDemo} className="w-full bg-[var(--border)] hover:bg-[var(--text-muted)]/20 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer">
              Try demo
            </button>
          </div>
          <div className="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-xl p-5 relative">
            <span className="absolute -top-3 left-4 bg-[var(--accent)] text-white text-xs px-2 py-0.5 rounded-full">Pro</span>
            <h3 className="font-semibold text-lg mb-1">Team</h3>
            <p className="text-3xl font-bold mb-3">$29<span className="text-sm font-normal text-[var(--text-muted)]">/mo</span></p>
            <ul className="text-sm text-[var(--text-muted)] space-y-1.5 mb-4">
              <li>✓ Everything in Free</li>
              <li>✓ Scheduled daily/weekly episodes</li>
              <li>✓ <b>On-chain health minting (Solana)</b></li>
              <li>✓ Private team RSS feeds</li>
              <li>✓ Slack/webhook notifications</li>
              <li>✓ Historical comparison</li>
            </ul>
            <button onClick={handleCheckout} className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer">
              Start Pro
            </button>
            <a href="/pro" className="block text-center text-xs text-[var(--text-muted)] hover:text-[var(--text)] mt-2 cursor-pointer">
              Already subscribed? Manage schedules →
            </a>
          </div>
        </div>
      </section>

      {/* FAQ — accordion */}
      <section className="w-full max-w-3xl pb-8 sm:pb-12" id="faq">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-6">Questions</h2>
        <div className="flex flex-col gap-2">
          {[
            {
              q: "Is my data sent to your servers?",
              a: "Your credentials are stored server-side in an encrypted session that expires after 1 hour. We fetch metadata from your catalog to generate the episode, but we don't store your raw data. Audio and episode data are cached temporarily for sharing (24h for free, 7 days for Pro).",
            },
            {
              q: "Do I need an ElevenLabs account?",
              a: "For the demo, no. To generate episodes from your own data, you need an ElevenLabs API key (Starter plan at $5/mo is recommended for full API access).",
            },
            {
              q: "What data sources are supported?",
              a: "We support OpenMetadata, dbt (Cloud & Local), The Graph (any subgraph), and Dune Analytics. For Dune, we run your queries and analyze the results. For all sources, we examine data quality, table dependencies, and test coverage to build your health profile.",
            },
            {
              q: "How does the blockchain integration work?",
              a: "For onchain teams, each episode can be recorded on Solana as a permanent, shareable record of your data quality. You can also pay for Pro with Palm USD, a Solana stablecoin.",
            },
            {
              q: "How long does generation take?",
              a: "30-60 seconds depending on how many tables you have. The AI writes a two-host script, then records each section as audio. You see real-time progress as it happens.",
            },
            {
              q: "What are the two AI hosts?",
              a: "Alex is the enthusiastic data advocate who highlights what's working well. Morgan is the skeptical quality auditor who flags risks, failing tests, and governance gaps. Together they create a balanced, engaging walkthrough.",
            },
          ].map((item) => (
            <details key={item.q} className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <summary className="px-5 py-3.5 text-sm font-medium cursor-pointer list-none flex items-center justify-between">
                {item.q}
                <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
              </summary>
              <p className="px-5 pb-4 text-sm text-[var(--text-muted)] leading-relaxed">{item.a as React.ReactNode}</p>
            </details>
          ))}
        </div>
      </section>

      {/* How it works — collapsible explainer */}
      <section className="w-full max-w-3xl pb-8 sm:pb-12">
        <details className="group">
          <summary className="text-sm font-medium text-[var(--text-muted)] cursor-pointer list-none flex items-center justify-center gap-2 hover:text-[var(--text)] transition-colors">
            <span>How DataBard works</span>
            <span className="group-open:rotate-90 transition-transform text-xs">→</span>
          </summary>
          <div className="mt-6 space-y-8">
            {/* Why a podcast */}
            <div>
              <h3 className="text-base font-semibold text-center mb-3">Why a podcast?</h3>
              <p className="text-sm text-[var(--text-muted)] text-center mb-5 max-w-lg mx-auto">
                {persona === "enterprise" 
                  ? "Your data catalog has hundreds of tables. Nobody reads the docs. But everyone listens to podcasts."
                  : "Your onchain data has thousands of entities. Dashboards get ignored. But audio reports build trust."
                }
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { 
                    icon: persona === "enterprise" ? "🎧" : "⛓️", 
                    title: persona === "enterprise" ? "Passive consumption" : "On-chain proof", 
                    desc: persona === "enterprise" 
                      ? "Listen while commuting, coding, or doing dishes. No screen required." 
                      : "Record each health report on Solana. Build a verifiable history of data quality."
                  },
                  { 
                    icon: "⚠️", 
                    title: persona === "enterprise" ? "Issues you'd miss" : "Data health", 
                    desc: persona === "enterprise"
                      ? "AI hosts flag failing tests, stale tables, sensitive columns, and missing owners."
                      : "Spot indexer lag, broken entity relationships, and sync gaps before they affect users."
                  },
                  { 
                    icon: "📊", 
                    title: "Click to explore", 
                    desc: "Hear something interesting? Click the segment to see columns, tests, and data flow in real-time." 
                  },
                ].map((item) => (
                  <div key={item.title} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                    <div className="text-xl mb-1.5">{item.icon}</div>
                    <h4 className="text-sm font-semibold mb-0.5">{item.title}</h4>
                    <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works steps */}
            <div>
              <h3 className="text-base font-semibold text-center mb-4">Three steps</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { step: "1", title: "Connect", desc: persona === "enterprise" ? "Connect OpenMetadata, dbt, or another data source" : "Paste your Dune API key or subgraph URL" },
                  { step: "2", title: "Analyze", desc: "AI examines your tables for quality issues, data flow problems, and missing tests" },
                  { step: "3", title: persona === "enterprise" ? "Listen & share" : "Mint & share", desc: persona === "enterprise" ? "Stream episodes or share MP3s via Slack" : "Record findings on Solana and share with your community" },
                ].map((item) => (
                  <div key={item.step} className="flex flex-col items-center text-center">
                    <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs font-bold mb-2">{item.step}</div>
                    <h4 className="text-sm font-semibold mb-0.5">{item.title}</h4>
                    <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>
      </section>

      {/* Footer */}
      <footer className="text-xs text-[var(--text-muted)] pb-8 flex gap-3">
        <span>{persona === "web3" ? "Powered by ElevenLabs & Solana" : "Powered by ElevenLabs & OpenMetadata"}</span>
        <span>·</span>
        <a href="/api/feed" className="hover:text-[var(--text)]">RSS Feed</a>
      </footer>
    </main>
  );
}
