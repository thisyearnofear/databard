/**
 * /api/playlists — CRUD for multi-episode playlists.
 * GET /api/playlists — list all playlists
 * POST /api/playlists — create a new playlist
 */
import { NextRequest, NextResponse } from "next/server";
import { createPlaylist, listPlaylists, getPlaylist, addToPlaylist, deletePlaylist, updatePlaylistItem } from "@/lib/playlist-store";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const playlist = getPlaylist(id);
    if (!playlist) return NextResponse.json({ ok: false, error: "Playlist not found" }, { status: 404 });
    return NextResponse.json({ ok: true, playlist });
  }
  const playlists = listPlaylists();
  return NextResponse.json({ ok: true, playlists });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, playlistId, name, description, item, itemId, patch } = body;

    if (action === "create") {
      if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
      const playlist = createPlaylist(name, description);
      return NextResponse.json({ ok: true, playlist });
    }

    if (action === "add-item") {
      if (!playlistId || !item) return NextResponse.json({ ok: false, error: "playlistId and item required" }, { status: 400 });
      const playlist = addToPlaylist(playlistId, item);
      if (!playlist) return NextResponse.json({ ok: false, error: "Playlist not found" }, { status: 404 });
      return NextResponse.json({ ok: true, playlist });
    }

    if (action === "update-item") {
      if (!playlistId || !itemId) return NextResponse.json({ ok: false, error: "playlistId and itemId required" }, { status: 400 });
      const playlist = updatePlaylistItem(playlistId, itemId, patch ?? {});
      if (!playlist) return NextResponse.json({ ok: false, error: "Playlist or item not found" }, { status: 404 });
      return NextResponse.json({ ok: true, playlist });
    }

    if (action === "delete") {
      if (!playlistId) return NextResponse.json({ ok: false, error: "playlistId required" }, { status: 400 });
      deletePlaylist(playlistId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
