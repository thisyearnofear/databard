/**
 * /loop — live audit trail of the DataBard × TestSprite verification loop.
 *
 * Reads LOOP.md at request time and renders the "Loop-Quality evidence" audit trail
 * plus the historical bugs. The page auto-refreshes every 30s so a judge can watch
 * new iterations land as the GitHub Action runs.
 */
import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readLoopMd(): Promise<string> {
  const p = path.join(process.cwd(), "LOOP.md");
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return "";
  }
}

interface RecentCommit {
  sha: string;
  subject: string;
  date: string;
}

function loopCommits(limit = 20): RecentCommit[] {
  try {
    const out = execSync(
      `git log --format='%h|%s|%cI' -n ${limit} --grep='^loop'`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, subject, date] = line.split("|");
        return { sha, subject, date };
      });
  } catch {
    return [];
  }
}

interface IterationEntry {
  timestamp: string;
  test: string;
  iteration: string;
  status: string;
  commit?: string;
  provider?: string;
  reasoning?: string;
}

function parseIterations(md: string): IterationEntry[] {
  // Split by `---` separators; parse blocks that start with `### <ts> — \`<test>\` iteration N`
  const blocks = md.split(/\n---\n/);
  const out: IterationEntry[] = [];
  for (const block of blocks) {
    const headerMatch = block.match(
      /^\s*###\s+([\dTZ:.-]+)\s+—\s+`([^`]+)`\s+iteration\s+([^\s\n]+)/,
    );
    if (!headerMatch) continue;
    const [, timestamp, test, iteration] = headerMatch;
    const get = (label: string): string | undefined => {
      const m = block.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i"));
      return m?.[1]?.trim();
    };
    out.push({
      timestamp,
      test,
      iteration,
      status: get("Status") ?? "",
      commit: get("Commit")?.replace(/^`|`$/g, ""),
      provider: get("Fixer provider"),
      reasoning: get("Fixer reasoning"),
    });
  }
  return out.reverse();
}

function StatusPill({ status }: { status: string }) {
  const passed = status.includes("✓") || /passed/i.test(status);
  const patched = /patched/i.test(status);
  const bailed = /bailed|infrastructure/i.test(status);
  const cls = passed
    ? "bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/40"
    : bailed
      ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/40"
      : patched
        ? "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/40"
        : "bg-[var(--border)] text-[var(--text-muted)] border-[var(--border)]";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{status}</span>
  );
}

export default async function LoopPage() {
  const md = await readLoopMd();
  const iterations = parseIterations(md);
  const commits = loopCommits(30);

  return (
    <main className="min-h-screen max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">
          🐕 LOOP · verification audit trail
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Every iteration below was produced by <code>scripts/loop/loop-local.mjs</code> —
          a TestSprite failure bundle → strict-JSON patch → git commit chain, with
          Venice → NVIDIA → Anthropic provider fallback. Page auto-refreshes every 30s.
        </p>
        <div className="flex items-center gap-3 text-xs">
          <a
            href="https://www.testsprite.com/dashboard/tests/98d788db-4ec4-46ea-abb9-49acd9d4ffd5/test/cfa9db2e-57a8-4cd4-a821-396e697b0de4"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            official TestSprite verdict (prod) ↗
          </a>
          <span className="text-[var(--text-muted)]">·</span>
          <a
            href="https://github.com/thisyearnofear/databard/blob/main/LOOP.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            LOOP.md source ↗
          </a>
          <span className="text-[var(--text-muted)]">·</span>
          <a
            href="/market"
            className="text-[var(--accent)] hover:underline"
          >
            /market dashboard →
          </a>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
            Loop iterations ({iterations.length})
          </h2>
          {iterations.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">
              No iterations recorded yet. Run <code>node scripts/loop/loop-local.mjs</code>
              to generate the first one.
            </p>
          ) : (
            <ol className="space-y-3">
              {iterations.map((it, i) => (
                <li
                  key={i}
                  className="rounded border border-[var(--border)] bg-[var(--bg)] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm">
                      <code className="text-[var(--accent)]">{it.test}</code>
                      <span className="text-[var(--text-muted)]"> · iter {it.iteration}</span>
                    </span>
                    <StatusPill status={it.status} />
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono">
                    {it.timestamp}
                  </div>
                  {it.reasoning && (
                    <p className="text-xs text-[var(--text)]/80 italic">
                      &ldquo;{it.reasoning}&rdquo; {it.provider && `— ${it.provider}`}
                    </p>
                  )}
                  {it.commit && (
                    <a
                      href={`https://github.com/thisyearnofear/databard/commit/${it.commit}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent)] hover:underline font-mono"
                    >
                      {it.commit} ↗
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
            Loop commits ({commits.length})
          </h2>
          <ul className="space-y-1.5 text-xs">
            {commits.map((c) => (
              <li key={c.sha} className="border-l-2 border-[var(--accent)]/40 pl-2">
                <a
                  href={`https://github.com/thisyearnofear/databard/commit/${c.sha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[var(--accent)] hover:underline"
                >
                  {c.sha}
                </a>
                <div className="text-[var(--text)]/80">{c.subject}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {new Date(c.date).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <meta httpEquiv="refresh" content="30" />
    </main>
  );
}
