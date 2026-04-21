"use client";

import { useState, useEffect } from "react";

interface AgentCapabilities {
  ok: boolean;
  available: { name: string; description: string }[];
  activeProvider: string;
  canInvestigate: boolean;
}

export function ProviderStatus() {
  const [caps, setCaps] = useState<AgentCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => { setCaps(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !caps?.ok) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${caps.canInvestigate ? "bg-[var(--success)]" : "bg-[var(--border)]"}`} />
        <div>
          <h3 className="text-sm font-medium">
            {caps.canInvestigate ? "AI agent ready" : "AI agent not configured"}
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            {caps.canInvestigate
              ? "Action items include investigation guidance and fix suggestions"
              : "Add an agent provider to enable automated issue investigation"}
          </p>
        </div>
      </div>
    </div>
  );
}
