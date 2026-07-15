import { cp, mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';

async function copyIfExists(source, destination, options = {}) {
  try {
    await access(source);
    await cp(source, destination, { recursive: true, ...options });
  } catch {
    // ignore missing optional assets
  }
}

async function main() {
  if (!existsSync('.next/standalone')) {
    throw new Error('Standalone build output not found. Run `next build` first.');
  }

  await mkdir('.next/standalone/.next', { recursive: true });
  await copyIfExists('.next/static', '.next/standalone/.next/static');

  // Copy public/ but exclude large binary assets that bloat the serverless
  // function bundle. Audio, video, documents, and archives are served from
  // the CDN/static layer, not from the serverless function itself.
  // Keep: favicon, SVG, JSON, CSS, JS, fonts, images under 1MB.
  const BINARY_ASSET_RE = /\.(mp3|mp4|wav|flac|ogg|aac|m4a|webm|mov|avi|mkv|pdf|docx?|xlsx?|pptx?|zip|tar|gz|bz2|7z|rar|iso|dmg|exe|bin|wasm)$/i;
  await copyIfExists('public', '.next/standalone/public', {
    filter: (src) => !BINARY_ASSET_RE.test(src),
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
