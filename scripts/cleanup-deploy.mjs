import { readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';

async function removePath(path) {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function main() {
  await removePath('node_modules');

  if (existsSync('.next')) {
    const entries = await readdir('.next', { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (entry.name === 'standalone') return;
      await removePath(`.next/${entry.name}`);
    }));
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
