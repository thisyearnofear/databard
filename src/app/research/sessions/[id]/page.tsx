import Link from "next/link";
import { notFound } from "next/navigation";
import { getResearchSession } from "@/lib/research-session";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ResearchSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getResearchSession(id);

  if (!session) {
    notFound();
  }

  const latestBranch = session.branches.find((branch) => branch.id === session.latestBranchId) ?? session.branches[session.branches.length - 1];

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--accent)] font-medium mb-2">Research session</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{session.schemaName}</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">{session.schemaFqn} · {session.source}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/research/sessions"
              className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--accent)]"
            >
              ← All sessions
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              New episode
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Branches</p>
            <p className="text-2xl font-semibold">{session.branches.length}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Created</p>
            <p className="text-sm font-medium">{formatDate(session.createdAt)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Updated</p>
            <p className="text-sm font-medium">{formatDate(session.updatedAt)}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Latest branch</p>
          <h2 className="text-xl font-semibold">{latestBranch?.question}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">{latestBranch?.researchTrail.summary}</p>

          {session.latestEpisodeId && (
            <Link
              href={`/episode/${session.latestEpisodeId}`}
              className="mt-4 inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              Open latest episode
            </Link>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Branch history</h2>
          {session.branches.slice().reverse().map((branch) => (
            <div key={branch.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{formatDate(branch.createdAt)}</p>
                  <h3 className="text-base font-semibold mt-1">{branch.question}</h3>
                </div>
                {branch.episodeId && (
                  <Link
                    href={`/episode/${branch.episodeId}`}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    View episode
                  </Link>
                )}
              </div>
              {branch.parentBranchId && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">Branch from {branch.parentBranchId.slice(0, 8)}</p>
              )}
              <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">{branch.researchTrail.summary}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Focus</p>
                  <p className="text-sm">{branch.researchTrail.focus}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Evidence</p>
                  <p className="text-sm">{branch.researchTrail.evidence.length} items · {branch.researchTrail.recommendedActions.length} actions</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
