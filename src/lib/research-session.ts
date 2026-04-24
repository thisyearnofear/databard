import { randomUUID } from "crypto";
import { store } from "./store";
import type { EvidenceSourceContext, ResearchSession, ResearchSessionBranch, ResearchTrail, DataSource, SchemaMeta } from "./types";

const SESSION_PREFIX = "research-session:";

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

function episodeBranch(question: string, trail: ResearchTrail, episodeId?: string, parentBranchId?: string): ResearchSessionBranch {
  return {
    id: randomUUID(),
    question,
    createdAt: new Date().toISOString(),
    parentBranchId,
    researchTrail: trail,
    episodeId,
  };
}

export function createResearchSession(input: {
  schemaMeta: SchemaMeta;
  source: DataSource;
  question: string;
  trail: ResearchTrail;
  evidenceContext?: EvidenceSourceContext;
  episodeId?: string;
}): ResearchSession {
  const now = new Date().toISOString();
  const session: ResearchSession = {
    id: randomUUID(),
    schemaFqn: input.schemaMeta.fqn,
    schemaName: input.schemaMeta.name,
    source: input.source,
    evidenceContext: input.evidenceContext,
    createdAt: now,
    updatedAt: now,
    schemaMeta: input.schemaMeta,
    branches: [episodeBranch(input.question, input.trail, input.episodeId)],
  };
  session.latestBranchId = session.branches[0]?.id;
  session.latestEpisodeId = input.episodeId;
  store.set(sessionKey(session.id), session, 86400 * 30);
  return session;
}

export function getResearchSession(sessionId: string): ResearchSession | null {
  return store.get<ResearchSession>(sessionKey(sessionId));
}

export function listResearchSessions(prefix = ""): ResearchSession[] {
  return store.keys(SESSION_PREFIX)
    .map((key) => store.get<ResearchSession>(key))
    .filter((session): session is ResearchSession => Boolean(session))
    .filter((session) => !prefix || session.schemaFqn.startsWith(prefix) || session.schemaName.toLowerCase().includes(prefix.toLowerCase()));
}

export function appendResearchBranch(input: {
  sessionId: string;
  question: string;
  trail: ResearchTrail;
  episodeId?: string;
  parentBranchId?: string;
}): ResearchSession | null {
  const session = getResearchSession(input.sessionId);
  if (!session) return null;

  const branch = episodeBranch(input.question, input.trail, input.episodeId, input.parentBranchId ?? session.latestBranchId);
  const updated: ResearchSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    branches: [...session.branches, branch],
    latestBranchId: branch.id,
    latestEpisodeId: input.episodeId ?? session.latestEpisodeId,
  };

  store.set(sessionKey(session.id), updated, 86400 * 30);
  return updated;
}

export function linkEpisodeToSession(sessionId: string, episodeId: string): ResearchSession | null {
  const session = getResearchSession(sessionId);
  if (!session) return null;
  const updatedBranches = session.branches.map((branch) =>
    branch.id === session.latestBranchId ? { ...branch, episodeId } : branch
  );
  const updated: ResearchSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    branches: updatedBranches,
    latestEpisodeId: episodeId,
  };
  store.set(sessionKey(session.id), updated, 86400 * 30);
  return updated;
}
