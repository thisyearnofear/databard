"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, type AccountSession } from "@/lib/use-account";
import { workspaceHref } from "@/lib/product/workspaces";

type SignInStep = "email" | "code";

function SignInModal({ onClose, onSignedIn }: { onClose: () => void; onSignedIn: (s: AccountSession) => void }) {
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/account/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "Couldn't send code");
        return;
      }
      setChallengeId(d.challengeId);
      // Dev/lab convenience — pre-fill the code when the server echoes it.
      if (d.devCode) setCode(d.devCode);
      setStep("code");
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId || code.length < 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok || !d.session) {
        setError(d.error || "Verification failed");
        return;
      }
      onSignedIn(d.session);
      onClose();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-sm mx-4 shadow-2xl animate-slide-up w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🔐</div>
          <h2 className="text-lg font-semibold">Sign in to DataBard</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {step === "email"
              ? "No passwords — we email you a one-time code. Your data sources and briefings persist to your account."
              : `Enter the 6-digit code sent to ${email}.`}
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={requestCode} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="you@company.com"
              required
              autoFocus
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none transition-colors"
            />
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
              placeholder="000000"
              required
              maxLength={6}
              autoFocus
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-center tracking-[0.5em] font-mono focus:border-[var(--accent)] focus:outline-none transition-colors"
            />
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button type="button" onClick={() => setStep("email")} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer text-center">
              ← Use a different email
            </button>
          </form>
        )}

        <button onClick={onClose} className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text)] mt-4 cursor-pointer">
          Close
        </button>
      </div>
    </div>
  );
}

/** Header account menu: sign in (email OTP), show identity, my sources, sign out. */
export function AccountMenu({ workspace = "teams" }: { workspace?: "teams" | "protocols" }) {
  const { session, loading, refresh, setCurrent, signOut, signedIn } = useAccount();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [sources, setSources] = useState<Array<{ id: string; name: string; source: string; host?: string }>>([]);

  const loadSources = useCallback(async () => {
    try {
      const r = await fetch("/api/account/sources");
      const d = await r.json();
      if (d.ok) setSources(d.sources ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open && signedIn) loadSources();
  }, [open, signedIn, loadSources]);

  async function removeSource(id: string) {
    try {
      const r = await fetch("/api/account/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (d.ok) setSources(d.sources ?? []);
    } catch {
      /* ignore */
    }
  }

  if (loading) return null;

  const email = session?.identity.email;

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          aria-label="Account"
        >
          {signedIn ? <span className="text-[var(--accent)]">●</span> : <span>👤</span>}
          <span className="max-w-[8rem] truncate">{signedIn ? email : "Sign in"}</span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-2 animate-slide-up">
              {signedIn ? (
                <>
                  <div className="px-2 py-1.5 text-xs text-[var(--text-muted)]">
                    Signed in as <span className="text-[var(--text)]">{email}</span>
                  </div>
                  <p className="px-2 pt-2 pb-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">My data sources</p>
                  {sources.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-[var(--text-muted)]">No saved sources yet.</p>
                  ) : (
                    sources.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 px-2 py-1">
                        <Link
                          href={workspaceHref("/?start=connect", workspace)}
                          className="flex-1 text-xs text-[var(--text)] hover:text-[var(--accent)] truncate"
                          onClick={() => setOpen(false)}
                        >
                          {s.name}
                          {s.host ? <span className="block text-[10px] text-[var(--text-muted)] truncate">{s.host}</span> : null}
                        </Link>
                        <button
                          onClick={() => removeSource(s.id)}
                          className="text-[var(--text-muted)] hover:text-[var(--danger)] text-xs cursor-pointer"
                          aria-label={`Remove ${s.name}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                  <div className="my-1.5 border-t border-[var(--border)]" />
                  <button
                    onClick={async () => { await signOut(); setOpen(false); }}
                    className="w-full text-left px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer rounded-md"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setOpen(false); setModal(true); }}
                    className="w-full text-left px-2 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer rounded-md"
                  >
                    Sign in with email
                  </button>
                  <p className="px-2 py-1.5 text-[11px] text-[var(--text-muted)]">
                    Save your data sources and find past briefings.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <SignInModal
          onClose={() => setModal(false)}
          onSignedIn={(s) => { setCurrent(s); refresh(); }}
        />
      )}
    </>
  );
}

