/**
 * Playlist store — queue multiple schema episodes as a database series.
 * Users can build a playlist by adding schema+source pairs, then generate
 * episodes in sequence. Each playlist gets a unique shareable link.
 */
import { store } from "./store";

export interface PlaylistItem {
  id: string;
  schemaFqn: string;
  schemaName: string;
  source: string;
  episodeId?: string;
  status: "pending" | "generating" | "done" | "error";
  error?: string;
  addedAt: string;
  completedAt?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  items: PlaylistItem[];
  createdAt: string;
  updatedAt: string;
  /** If all items are done, this is the primary share ID for the playlist overview page */
  shareId?: string;
}

const PLAYLIST_TTL = 86400 * 30; // 30 days

function listKey(): string {
  return "playlists:index";
}

export function createPlaylist(name: string, description?: string): Playlist {
  const id = `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const playlist: Playlist = {
    id,
    name,
    description,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Maintain index
  const index = store.get<string[]>(listKey()) ?? [];
  index.push(id);
  store.set(listKey(), index, PLAYLIST_TTL);
  store.set(`playlist:${id}`, playlist, PLAYLIST_TTL);

  return playlist;
}

export function getPlaylist(id: string): Playlist | null {
  return store.get<Playlist>(`playlist:${id}`);
}

export function addToPlaylist(playlistId: string, item: Omit<PlaylistItem, "id" | "status" | "addedAt">): Playlist | null {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return null;

  const newItem: PlaylistItem = {
    ...item,
    id: `pli_${Date.now().toString(36)}`,
    status: "pending",
    addedAt: new Date().toISOString(),
  };

  playlist.items.push(newItem);
  playlist.updatedAt = new Date().toISOString();
  store.set(`playlist:${playlistId}`, playlist, PLAYLIST_TTL);

  return playlist;
}

export function updatePlaylistItem(playlistId: string, itemId: string, patch: Partial<PlaylistItem>): Playlist | null {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return null;

  const idx = playlist.items.findIndex((i) => i.id === itemId);
  if (idx === -1) return null;

  playlist.items[idx] = { ...playlist.items[idx], ...patch };
  playlist.updatedAt = new Date().toISOString();

  // Check if all items are done
  if (playlist.items.every((i) => i.status === "done" || i.status === "error")) {
    // All items processed
  }

  store.set(`playlist:${playlistId}`, playlist, PLAYLIST_TTL);
  return playlist;
}

export function listPlaylists(): Playlist[] {
  const index = store.get<string[]>(listKey()) ?? [];
  return index
    .map((id) => getPlaylist(id))
    .filter((p): p is Playlist => p !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deletePlaylist(id: string): void {
  store.delete(`playlist:${id}`);
  const index = store.get<string[]>(listKey()) ?? [];
  store.set(listKey(), index.filter((i) => i !== id), PLAYLIST_TTL);
}
