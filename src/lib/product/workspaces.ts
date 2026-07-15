/**
 * The briefing engine is shared. A workspace only changes the language,
 * navigation, trust surface, and source defaults around it.
 *
 * Keep this module data-only: shells and routes consume it rather than
 * branching on `persona` throughout the UI.
 */
export type Workspace = "teams" | "protocols";

export const WORKSPACE_QUERY_KEY = "workspace";

export const WORKSPACES = {
  teams: {
    label: "Teams",
    shortLabel: "Enterprise",
    nav: [
      { href: "/protocol", label: "Briefing" },
      { href: "/alerts", label: "Settings" },
    ],
    landing: {
      eyebrow: "WEEKLY DATA BRIEFING",
      title: "Know what changed in your data before it becomes someone else’s problem.",
      description: "DataBard turns data-health signals into a decision-ready weekly briefing: the change, the impact, and the next action.",
      demoLabel: "Open this week’s briefing",
      connectLabel: "Connect a data source",
    },
  },
  protocols: {
    label: "Protocols",
    shortLabel: "Solana",
    nav: [
      { href: "/protocol?workspace=protocols", label: "Briefing" },
      { href: "/onchain", label: "Attestations" },
      { href: "/leaderboard", label: "Explorer" },
    ],
    landing: {
      eyebrow: "VERIFIABLE PROTOCOL BRIEFING",
      title: "Protocol health, explained and provable.",
      description: "DataBard turns on-chain data into a clear health briefing, with the evidence and attestation trail behind every claim.",
      demoLabel: "Open a protocol briefing",
      connectLabel: "Query protocol data",
    },
  },
} as const;

export function workspaceFromSearch(search: string): Workspace {
  const params = new URLSearchParams(search);
  const value = params.get(WORKSPACE_QUERY_KEY) ?? params.get("persona");
  return value === "protocols" || value === "web3" || value === "onchain" ? "protocols" : "teams";
}

export function workspaceFromPathname(pathname: string): Workspace {
  return pathname === "/onchain" || pathname === "/verify" || pathname === "/leaderboard" || pathname === "/history"
    ? "protocols"
    : "teams";
}

/** Route-only protocol surfaces always win; shared surfaces use the explicit URL mode. */
export function workspaceFromRoute(pathname: string, search = ""): Workspace {
  return workspaceFromPathname(pathname) === "protocols"
    ? "protocols"
    : workspaceFromSearch(search);
}

/** Preserve the selected workspace whenever a user moves between product surfaces. */
export function workspaceHref(href: string, workspace: Workspace): string {
  const [pathAndQuery, hash = ""] = href.split("#", 2);
  const [pathname, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(WORKSPACE_QUERY_KEY, workspace);
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

export function homeHref(workspace: Workspace): string {
  return workspaceHref("/", workspace);
}

export function isNavItemActive(href: string, pathname: string): boolean {
  return href.split("?")[0] === pathname;
}
