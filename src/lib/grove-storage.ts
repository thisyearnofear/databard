/**
 * Grove storage — IPFS-backed, onchain-controlled episode persistence via Lens Protocol.
 * Uploads episode metadata (script, musicPlan, healthScore) and audio to Grove,
 * returning a CID that can be embedded in the Solana memo for permanent retrieval.
 *
 * Docs: https://lens.xyz/docs/storage
 */
import { StorageClient, immutable, production } from "@lens-chain/storage-client";
import type { Episode } from "./types";

// Lens Chain mainnet chain ID (232 = Lens Chain mainnet)
const LENS_CHAIN_ID = production.defaultChainId;

// Grove uses Lens Chain (EVM) for access control — we use immutable (public) storage
// so no wallet signing is required server-side.
const storageClient = StorageClient.create();

export interface GroveEpisodeRecord {
  /** IPFS CID of the episode metadata JSON */
  metadataCid: string;
  /** IPFS CID of the audio MP3 (if provided) */
  audioCid?: string;
  /** Grove gateway URL for the metadata */
  metadataUrl: string;
  /** Grove gateway URL for the audio */
  audioUrl?: string;
}

/**
 * Upload episode metadata (and optionally audio) to Grove/IPFS.
 * Returns CIDs that can be embedded in the Solana on-chain memo.
 */
export async function uploadEpisodeToGrove(
  episode: Episode,
  audioBuffer?: Buffer
): Promise<GroveEpisodeRecord> {
  // Build a clean metadata payload — omit schemaMeta (too large) and raw audio
  const metadata = {
    app: "DataBard",
    version: "1.0",
    schemaFqn: episode.schemaFqn,
    schemaName: episode.schemaName,
    researchQuestion: episode.researchQuestion,
    tableCount: episode.tableCount,
    qualitySummary: episode.qualitySummary,
    healthScore: episode.qualitySummary
      ? Math.round(
          (episode.qualitySummary.passed / Math.max(episode.qualitySummary.total, 1)) * 100
        )
      : null,
    script: episode.script,
    musicPlan: episode.musicPlan ?? null,
    generatedAt: new Date().toISOString(),
  };

  // Upload metadata JSON
  const metadataJson = JSON.stringify(metadata, null, 2);
  const metadataFile = new File([metadataJson], "episode.json", { type: "application/json" });
  const metadataAcl = immutable(LENS_CHAIN_ID);
  const metadataResult = await storageClient.uploadFile(metadataFile, { acl: metadataAcl });
  const metadataCid = metadataResult.uri; // lens://... URI
  const metadataUrl = groveUriToUrl(metadataCid);

  // Optionally upload audio
  let audioCid: string | undefined;
  let audioUrl: string | undefined;
  if (audioBuffer && audioBuffer.length > 0) {
    const audioFile = new File([audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer], "episode.mp3", { type: "audio/mpeg" });
    const audioAcl = immutable(LENS_CHAIN_ID);
    const audioResult = await storageClient.uploadFile(audioFile, { acl: audioAcl });
    audioCid = audioResult.uri;
    audioUrl = groveUriToUrl(audioCid);
  }

  console.log(`[Grove] Uploaded episode metadata: ${metadataCid}`);
  if (audioCid) console.log(`[Grove] Uploaded audio: ${audioCid}`);

  return { metadataCid, audioCid, metadataUrl, audioUrl };
}

/**
 * Fetch a previously stored episode from Grove by its metadata CID.
 */
export async function fetchEpisodeFromGrove(metadataCid: string): Promise<Episode | null> {
  try {
    const url = groveUriToUrl(metadataCid);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data as Episode;
  } catch {
    return null;
  }
}

/**
 * Convert a lens:// URI to a Grove HTTPS gateway URL.
 */
export function groveUriToUrl(uri: string): string {
  if (uri.startsWith("lens://")) {
    const cid = uri.replace("lens://", "");
    return `https://api.grove.storage/${cid}`;
  }
  // Already an https URL or IPFS CID
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
  }
  return uri;
}
