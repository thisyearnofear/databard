import { cp, mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';

async function copyIfExists(source, destination) {
  try {
    await access(source);
    await cp(source, destination, { recursive: true });
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
  await copyIfExists('public', '.next/standalone/public');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
