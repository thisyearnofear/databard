import Link from "next/link";

export function DashboardHeader({ isProtocols }: { isProtocols: boolean }) {
  return (
    <div className="mb-8">
      <Link href="/" className="font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
        ← DataBard
      </Link>
      <div className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--accent)] mt-4">
        {isProtocols ? "Protocol health · verifiable briefing" : "Data health · weekly briefing"}
      </div>
      <h1 className="text-[28px] font-extrabold mt-1 mb-1">{isProtocols ? "Protocol briefing" : "This week’s briefing"}</h1>
      <p className="text-[var(--text-muted)] text-[15px]">
        {isProtocols
          ? "The material health changes across your protocol’s sources, with the evidence and Solana attestation trail behind each claim."
          : "The material health changes across your data estate—what changed, why it matters, and what to do next."}
      </p>
      <div className="mt-3 flex items-center gap-4 font-mono text-[12px]">
        {isProtocols ? (
          <Link href="/verify" className="text-[var(--accent)] no-underline hover:underline">Verify an attestation →</Link>
        ) : (
          <Link href="/alerts" className="text-[var(--accent)] no-underline hover:underline">Manage alerts →</Link>
        )}
      </div>
    </div>
  );
}
