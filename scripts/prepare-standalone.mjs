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
  // function bundle — MP3s and PDFs are served from the CDN/static layer,
  // not from the serverless function itself.
  await copyIfExists('public', '.next/standalone/public', {
    filter: (src) => {
      // Skip MP3s, PDFs, and other large binaries
      return !/\.(mp3|pdf|webm|mp4|wav)$/i.test(src);
    },
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
