"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Playlist, PlaylistItem } from "@/lib/playlist-store";

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/playlists");
    const data = await res.json();
    if (data.ok) setPlaylists(data.playlists);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!newName.trim()) return;
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: newName.trim() }),
    });
    setNewName("");
    load();
  }

  async function remove(id: string) {
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", playlistId: id }),
    });
    load();
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function itemStatusColor(status: PlaylistItem["status"]) {
    switch (status) {
      case "done": return "var(--success)";
      case "generating": return "var(--accent)";
      case "error": return "var(--danger)";
      default: return "var(--text-muted)";
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8">
      <div className="max-w-[700px] mx-auto">
        <Link href="/" className="text-sm text-[var(--text-muted)] no-underline">
          ← Back to DataBard
        </Link>
        <h1 className="text-[28px] font-extrabold mt-4 mb-2">
          📼 Episode Playlists
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] mb-8">
          Queue multiple schemas to generate a full database series — perfect for onboarding or catalog reviews.
        </p>

        {/* Create */}
        <div className="flex gap-2 mb-8">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. Analytics Pipeline Series"
            className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={!newName.trim()}
            className="bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-40"
          >
            Create
          </button>
        </div>

        {loading && <p className="text-[var(--text-muted)] text-center p-8">Loading…</p>}

        {!loading && playlists.length === 0 && (
          <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center">
            <p className="text-[var(--text-muted)] mb-2 text-sm">No playlists yet</p>
            <p className="text-[var(--text-muted)] text-xs">
              Create a playlist above, then add schemas from the home page.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {playlists.map((pl) => (
            <div key={pl.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div
                onClick={() => toggle(pl.id)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--bg)] transition-colors"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{pl.name}</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {pl.items.length} episode{pl.items.length !== 1 ? "s" : ""} ·{" "}
                    {pl.items.filter((i) => i.status === "done").length} completed
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(pl.id); }}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer px-2"
                  >
                    Delete
                  </button>
                  <span className={`text-[var(--text-muted)] text-sm ${expanded.has(pl.id) ? "rotate-90" : ""}`}>→</span>
                </div>
              </div>

              {expanded.has(pl.id) && (
                <div className="border-t border-[var(--border)] p-4">
                  {pl.items.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      No episodes added yet. Generate an episode from the home page to add it here.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {pl.items.map((item, i) => (
                        <div key={item.id} className="flex items-center gap-3 bg-[var(--bg)] rounded-lg px-3 py-2">
                          <span className="text-xs text-[var(--text-muted)] tabular-nums w-4">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{item.schemaName}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{item.schemaFqn}</p>
                          </div>
                          <div
                            className="w-2 h-2 rounded"
                            style={{ background: itemStatusColor(item.status) }}
                            title={item.status}
                          />
                          {item.episodeId && (
                            <Link
                              href={`/episode/${item.episodeId}`}
                              className="text-xs text-[var(--accent)] hover:underline shrink-0"
                            >
                              Listen
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center pt-12">
        <Link href="/" className="text-xs text-[var(--text-muted)] no-underline">
          Generate episodes →
        </Link>
      </footer>
    </main>
  );
}
