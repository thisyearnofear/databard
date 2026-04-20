"use client";

import { useState, useEffect } from "react";

interface ProviderStatusData {
  ok: boolean;
  configured: string;
  providers: Record<string, boolean>;
  available: string[];
  recommendation: string;
}

export function ProviderStatus() {
  const [status, setStatus] = useState<ProviderStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!status || !status.ok) return null;

  const providerNames: Record<string, string> = {
    "agent-browser": "agent-browser (Vercel Labs)",
    "browser-use": "Browser Use Cloud",
    "browser-use-cli": "browser-use CLI",
    "tinyfish": "TinyFish AI",
  };

  const providerDescriptions: Record<string, string> = {
    "agent-browser": "Local Rust CLI - Fast, free, no API limits",
    "browser-use": "Cloud API - Serverless-friendly, pay-per-use",
    "browser-use-cli": "Local Python CLI - Can reuse Chrome logins",
    "tinyfish": "Cloud AI Agent - Natural language automation",
  };

  const hasAnyProvider = status.available.length > 0;

  return (
    <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${hasAnyProvider ? "bg-green-500" : "bg-yellow-500"}`} />
          <div>
            <h3 className="text-sm font-medium">Audio Provider Status</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {hasAnyProvider
                ? `Using: ${status.recommendation}`
                : "ElevenLabs API only (no browser automation)"}
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-[var(--text-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3 animate-slide-up">
          <div className="text-xs">
            <p className="text-[var(--text-muted)] mb-2">
              <strong>Configured mode:</strong> {status.configured}
            </p>
            <p className="text-[var(--text-muted)] mb-3">
              Browser automation provides fallback when ElevenLabs API returns 402 errors (free tier limitation).
            </p>
          </div>

          <div className="space-y-2">
            {Object.entries(status.providers).map(([provider, available]) => (
              <div
                key={provider}
                className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                  available ? "bg-green-500/10" : "bg-[var(--bg)]"
                }`}
              >
                <div className="mt-0.5">
                  {available ? (
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className={available ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>
                    <strong>{providerNames[provider] || provider}</strong>
                  </p>
                  <p className="text-[var(--text-muted)] mt-0.5">{providerDescriptions[provider]}</p>
                  {!available && provider === "agent-browser" && (
                    <p className="text-[var(--text-muted)] mt-1 italic">
                      Install: <code className="bg-[var(--bg)] px-1 py-0.5 rounded">npm install -g agent-browser && agent-browser install</code>
                    </p>
                  )}
                  {!available && provider === "browser-use-cli" && (
                    <p className="text-[var(--text-muted)] mt-1 italic">
                      Install: <code className="bg-[var(--bg)] px-1 py-0.5 rounded">curl -fsSL https://browser-use.com/cli/install.sh | bash</code>
                    </p>
                  )}
                  {!available && provider === "tinyfish" && (
                    <p className="text-[var(--text-muted)] mt-1 italic">
                      Set: <code className="bg-[var(--bg)] px-1 py-0.5 rounded">TINYFISH_API_KEY</code>
                    </p>
                  )}
                  {!available && provider === "browser-use" && (
                    <p className="text-[var(--text-muted)] mt-1 italic">
                      Set: <code className="bg-[var(--bg)] px-1 py-0.5 rounded">BROWSER_USE_API_KEY</code>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!hasAnyProvider && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs">
              <p className="text-yellow-600 dark:text-yellow-400 mb-2">
                <strong>⚠️ No browser automation available</strong>
              </p>
              <p className="text-[var(--text-muted)]">
                Free tier ElevenLabs API keys don't support voice access. Install a browser automation provider
                or upgrade to ElevenLabs Starter plan ($5/month) for full API access.
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-[var(--border)]">
            <a
              href="https://github.com/thisyearnofear/databard#audio-generation--browser-automation"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--accent)] hover:underline"
            >
              Learn more about audio providers →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
