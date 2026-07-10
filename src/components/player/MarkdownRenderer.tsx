"use client";

import type { ReactNode } from "react";
import { inlineFormat } from "@/lib/markdown-lite";

/** Lightweight markdown → JSX for investigation results */
export function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings
    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={i} className="font-semibold text-[var(--text)] mt-2 mb-1">{line.replace(/\*\*/g, "")}</p>);
      continue;
    }

    // Numbered lists
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-[var(--accent)] shrink-0 w-4 text-right">{numMatch[1]}.</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(numMatch[2]) }} />
        </div>
      );
      continue;
    }

    // Bullet lists
    if (line.startsWith("- ") || line.startsWith("• ")) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-[var(--accent)] shrink-0">·</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />
        </div>
      );
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    // Regular text with inline formatting
    elements.push(<p key={i} className="py-0.5" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
  }

  return <>{elements}</>;
}
