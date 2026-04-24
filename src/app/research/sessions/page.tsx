import Link from "next/link";
import { listResearchSessions } from "@/lib/research-session";
import { CopyLinkChip } from "@/components/CopyLinkChip";

type SessionSearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readBooleanParam(value: string | string[] | undefined): boolean {
  return readParam(value) === "1";
}

function buildHref(baseParams: SessionSearchParams, overrides: SessionSearchParams): string {
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(baseParams)) {
    if (value == null || key in overrides) continue;
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) nextParams.set(key, normalized);
  }

  for (const [key, value] of Object.entries(overrides)) {
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) nextParams.set(key, normalized);
    else nextParams.delete(key);
  }

  const queryString = nextParams.toString();
  return queryString ? `/research/sessions?${queryString}` : "/research/sessions";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ResearchSessionsPage({ searchParams }: { searchParams: Promise<SessionSearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const query = readParam(resolvedSearchParams.q).trim().toLowerCase();
  const source = readParam(resolvedSearchParams.source).trim();
  const sort = readParam(resolvedSearchParams.sort) === "oldest"
    ? "oldest"
    : readParam(resolvedSearchParams.sort) === "branches"
      ? "branches"
      : "newest";
  const minBranches = Number.parseInt(readParam(resolvedSearchParams.minBranches), 10);
  const hasEpisode = readBooleanParam(resolvedSearchParams.hasEpisode);

  const sessions = listResearchSessions()
    .filter((session) => !source || session.source === source)
    .filter((session) => (Number.isFinite(minBranches) ? session.branches.length >= Math.max(0, minBranches) : true))
    .filter((session) => (!hasEpisode ? true : Boolean(session.latestEpisodeId)))
    .filter((session) => {
      if (!query) return true;
      const haystack = [
        session.schemaName,
        session.schemaFqn,
        session.source,
        ...session.branches.flatMap((branch) => [branch.question, branch.researchTrail.summary, branch.researchTrail.evidence.map((item) => item.label).join(" ")]),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (sort === "branches") {
        const branchDelta = right.branches.length - left.branches.length;
        if (branchDelta !== 0) return branchDelta;
      }
      const leftTime = new Date(left.updatedAt).getTime();
      const rightTime = new Date(right.updatedAt).getTime();
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });

  const sourceOptions = ["openmetadata", "dbt-cloud", "dbt-local", "the-graph", "dune"] as const;
  const hasFilters = Boolean(query || source || sort !== "newest" || (Number.isFinite(minBranches) && minBranches > 0) || hasEpisode);
  const quickFilters = [
    { label: "All", href: buildHref(resolvedSearchParams, { q: "", source: "", minBranches: "", hasEpisode: "", sort: "" }) },
    { label: "With episode", href: buildHref(resolvedSearchParams, { hasEpisode: "1" }) },
    { label: "3+ branches", href: buildHref(resolvedSearchParams, { minBranches: "3" }) },
    ...sourceOptions.map((option) => ({
      label: option,
      href: buildHref(resolvedSearchParams, { source: option }),
    })),
  ];
  const sortFilters = [
    { label: "Newest", href: buildHref(resolvedSearchParams, { sort: "newest" }) },
    { label: "Oldest", href: buildHref(resolvedSearchParams, { sort: "oldest" }) },
    { label: "Most branched", href: buildHref(resolvedSearchParams, { sort: "branches" }) },
  ];
  const resetHref = buildHref(resolvedSearchParams, { q: "", source: "", minBranches: "", hasEpisode: "", sort: "" });

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--accent)] font-medium mb-2">Research sessions</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Browse saved research threads</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">
              Every question-first episode creates a persistent session. Reopen a thread, inspect its branches, and jump back into the matching episode.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--accent)]"
          >
            ← Back home
          </Link>
        </div>

        <form method="get" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Reset view</p>
            <Link
              href={resetHref}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                hasFilters
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]"
              }`}
            >
              {hasFilters ? "Reset defaults" : "Defaults active"}
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => {
              const active =
                (filter.label === "With episode" && hasEpisode) ||
                (filter.label === "3+ branches" && Number.isFinite(minBranches) && minBranches >= 3) ||
                filter.label === source;

              return (
                <Link
                  key={filter.label}
                  href={filter.href}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {sortFilters.map((filter) => {
              const active =
                (filter.label === "Newest" && sort === "newest") ||
                (filter.label === "Oldest" && sort === "oldest") ||
                (filter.label === "Most branched" && sort === "branches");

              return (
                <Link
                  key={filter.label}
                  href={filter.href}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Search</span>
              <input
                name="q"
                defaultValue={query}
                placeholder="Schema, question, summary…"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Source</span>
              <select
                name="source"
                defaultValue={source}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              >
                <option value="">All sources</option>
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Sort</span>
              <select
                name="sort"
                defaultValue={sort}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Minimum branches</span>
              <input
                name="minBranches"
                type="number"
                min={0}
                defaultValue={Number.isFinite(minBranches) ? minBranches : ""}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <input
                name="hasEpisode"
                value="1"
                type="checkbox"
                defaultChecked={hasEpisode}
                className="rounded border-[var(--border)]"
              />
              Has latest episode
            </label>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                Filter
              </button>
              {hasFilters && (
                <Link
                  href="/research/sessions"
                  className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--accent)]"
                >
                  Clear
                </Link>
              )}
            </div>
          </div>
        </form>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <p className="text-lg font-medium">No matching sessions</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {hasFilters
                ? "Try widening your filters or clearing the search form."
                : "Generate a fresh episode with a research question and your first session will show up here."}
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              {hasFilters ? "Create a new episode" : "Create one from the home page"}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((session) => {
              const latestBranch = session.branches.find((branch) => branch.id === session.latestBranchId) ?? session.branches[session.branches.length - 1];
              const sessionHref = `/research/sessions/${session.id}`;
              return (
                <div
                  key={session.id}
                  className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--bg)]"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{session.source}</p>
                      <Link href={sessionHref} className="text-lg font-semibold group-hover:text-[var(--accent)]">
                        {session.schemaName}
                      </Link>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--border)] text-[var(--text-muted)]">
                        {session.branches.length} branch{session.branches.length === 1 ? "" : "es"}
                      </span>
                      <CopyLinkChip href={sessionHref} />
                    </div>
                  </div>

                  <p className="text-sm text-[var(--text-muted)]">{latestBranch?.researchTrail.summary}</p>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                    <span className="rounded-full bg-[var(--bg)] px-2 py-1">Created {formatDate(session.createdAt)}</span>
                    <span className="rounded-full bg-[var(--bg)] px-2 py-1">Updated {formatDate(session.updatedAt)}</span>
                    <span className="rounded-full bg-[var(--bg)] px-2 py-1">{session.schemaMeta.tables.length} tables</span>
                    <span className="rounded-full bg-[var(--bg)] px-2 py-1">{session.schemaMeta.lineage.length} lineage edges</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Latest question</p>
                    <p className="text-sm">{latestBranch?.question}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
