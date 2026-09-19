"use client";

import type { ReactNode } from "react";
import { PixelIcon, type PixelIconName } from "@/components/dither-kit";

interface EmptyStateProps {
  /** A PixelIcon glyph name, or any node. Raw emoji strings are not allowed. */
  icon: PixelIconName | ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      <div className="mb-4 text-[var(--text-muted)] opacity-60">
        {typeof icon === "string" ? <PixelIcon name={icon as PixelIconName} size={28} /> : icon}
      </div>
      <h3 className="font-display text-base font-semibold text-[var(--text)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] max-w-sm mb-4">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-2 bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition ease-out"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function SearchEmpty({ query }: { query: string }) {
  return (
    <EmptyState
      icon="search"
      title={`No results for "${query}"`}
      description="Try adjusting your search terms or browse all available schemas."
    />
  );
}

export function SchemasEmpty() {
  return (
    <EmptyState
      icon="folder"
      title="No schemas found"
      description="Connect a data source to see available schemas."
    />
  );
}
