"use client";

import { useEffect, useState } from "react";

interface VoicePreset {
  id: string;
  name: string;
  description: string;
}

interface VoiceConfigResponse {
  ok: boolean;
  voices: { alex: string; morgan: string };
  presets: VoicePreset[];
  current: {
    alex: VoicePreset | null;
    morgan: VoicePreset | null;
  };
}

export function VoicePicker() {
  const [config, setConfig] = useState<VoiceConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState<"alex" | "morgan" | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/pro/voices")
      .then((r) => r.json())
      .then((d) => setConfig(d))
      .finally(() => setLoading(false));
  }, []);

  async function selectVoice(host: "alex" | "morgan", voiceId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/pro/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [host]: voiceId }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            voices: data.voices,
            current: {
              ...prev.current,
              [host]: prev.presets.find((v: VoicePreset) => v.id === voiceId) ?? null,
            },
          };
        });
        setStatus(`Voice updated`);
        setTimeout(() => setStatus(""), 2000);
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setSaving(false);
      setShowPicker(null);
    }
  }

  if (loading) return <div className="text-xs text-[var(--text-muted)] py-2">Loading voice config…</div>;
  if (!config) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Voice personalities</p>
          <p className="text-xs text-[var(--text-muted)]">Customize your AI hosts. Choose from ElevenLabs premade voices.</p>
        </div>
        {status && <p className="text-xs text-[var(--success)]">{status}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Alex */}
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <span className="text-[var(--accent)]">Alex</span>
                <span className="text-[10px] text-[var(--text-muted)] font-normal">Data advocate</span>
              </p>
              {config.current.alex && (
                <p className="text-xs text-[var(--text-muted)]">{config.current.alex.name} · {config.current.alex.description}</p>
              )}
            </div>
            <button
              onClick={() => setShowPicker(showPicker === "alex" ? null : "alex")}
              disabled={saving}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Change
            </button>
          </div>
          {showPicker === "alex" && (
            <div className="space-y-1 mt-2">
              {config.presets.map((v) => (
                <button
                  key={v.id}
                  onClick={() => selectVoice("alex", v.id)}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                    v.id === config.voices.alex
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "hover:bg-[var(--border)] text-[var(--text)]"
                  }`}
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-[var(--text-muted)] ml-2">{v.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Morgan */}
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <span style={{ color: "#a855f7" }}>Morgan</span>
                <span className="text-[10px] text-[var(--text-muted)] font-normal">Quality auditor</span>
              </p>
              {config.current.morgan && (
                <p className="text-xs text-[var(--text-muted)]">{config.current.morgan.name} · {config.current.morgan.description}</p>
              )}
            </div>
            <button
              onClick={() => setShowPicker(showPicker === "morgan" ? null : "morgan")}
              disabled={saving}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Change
            </button>
          </div>
          {showPicker === "morgan" && (
            <div className="space-y-1 mt-2">
              {config.presets.map((v) => (
                <button
                  key={v.id}
                  onClick={() => selectVoice("morgan", v.id)}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                    v.id === config.voices.morgan
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "hover:bg-[var(--border)] text-[var(--text)]"
                  }`}
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-[var(--text-muted)] ml-2">{v.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-[var(--text-muted)]">
        These voices are used for all DataBard episodes. Custom cloned voices require an ElevenLabs Creator subscription.
      </p>
    </div>
  );
}
