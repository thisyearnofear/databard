"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setDataContext } from "@/lib/data-context";
import { PixelIcon, type PixelIconName } from "@/components/dither-kit";

type OptionKey = "demo" | "sample" | "my";

interface Option {
  key: OptionKey;
  icon: PixelIconName;
  label: string;
  desc: string;
  href: string;
}

/**
 * DataSourceSwitch — a first-class "switch data" control in the header.
 * Lets a user flip between the Demo, Sample data, and their own (My data)
 * without re-running the whole wizard; the deep-links on `/` do the rest.
 */
export function DataSourceSwitch({ workspace }: { workspace: "teams" | "protocols" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const options: Option[] = [
    { key: "demo", icon: "flask", label: "Try the demo", desc: "Pre-built sample briefing", href: `/?start=demo&workspace=${workspace}` },
    { key: "sample", icon: "shell", label: "Sample data", desc: "Hosted sample catalog", href: `/?start=connect&mode=sample&workspace=${workspace}` },
    { key: "my", icon: "plug", label: "My data", desc: "Connect your own source", href: `/?start=connect&mode=my&workspace=${workspace}` },
  ];

  function choose(o: Option) {
    setOpen(false);
    if (o.key === "demo") {
      setDataContext({ kind: "demo", label: "Demo", demo: true });
    } else if (o.key === "sample") {
      setDataContext({ kind: "sample", label: "Sample data", source: "openmetadata" });
    } else {
      setDataContext({
        kind: "connected",
        label: "My data",
        source: workspace === "protocols" ? "coral" : "dbt-local",
      });
    }
    router.push(o.href);
  }

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        aria-label="Switch data"
      >
        <PixelIcon name="folder" size={12} />
        <span>Data</span>
        <span aria-hidden className="opacity-60">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-1.5 animate-slide-up">
            <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">Which data?</p>
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => choose(o)}
                className="w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-[var(--bg)] cursor-pointer transition-colors"
              >
                <span className="mt-0.5 text-[var(--text-muted)]"><PixelIcon name={o.icon} size={14} /></span>
                <span>
                  <span className="block text-xs font-medium text-[var(--text)]">{o.label}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
