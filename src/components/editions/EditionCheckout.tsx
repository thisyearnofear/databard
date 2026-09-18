"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { checkoutStorageKey } from "@/lib/checkout-recovery";
import { track } from "@/lib/track";
import { PublicationFrame } from "./PublicationFrame";

const EditionPaymentPanel = dynamic(
  () => import("./EditionPaymentPanel").then((m) => ({ default: m.EditionPaymentPanel })),
  { ssr: false, loading: () => <p className="text-xs text-[var(--text-muted)]">Loading payment options…</p> },
);

export function EditionCheckout({
  sponsor,
  slug,
  pricePusd,
}: {
  sponsor: string;
  slug: string;
  pricePusd: number;
}) {
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(checkoutStorageKey("edition", slug)) !== null) {
        setOpen(true);
      }
    } catch {
      setStorageError("Saved payment details could not be read. Check your wallet before paying again.");
      setOpen(true);
    }
  }, [slug]);

  if (!open) {
    return (
      <PublicationFrame sponsor={sponsor} stage="preview">
      <button
        type="button"
        onClick={() => {
          track("edition_publish_start", { slug });
          setOpen(true);
        }}
        className="inline-flex items-center whitespace-nowrap rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        Continue to payment
      </button>
      </PublicationFrame>
    );
  }

  return (
    <>
      {storageError && (
        <p className="mb-2 text-xs text-[var(--danger)]" role="alert">{storageError}</p>
      )}
      <EditionPaymentPanel sponsor={sponsor} slug={slug} pricePusd={pricePusd} />
    </>
  );
}
