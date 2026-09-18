"use client";

import { SolanaProvider } from "@/components/SolanaProvider";
import { EditionPublish } from "./EditionPublish";

export function EditionPaymentPanel({
  sponsor,
  slug,
  pricePusd,
}: {
  sponsor: string;
  slug: string;
  pricePusd: number;
}) {
  return (
    <SolanaProvider>
      <EditionPublish sponsor={sponsor} slug={slug} pricePusd={pricePusd} />
    </SolanaProvider>
  );
}
