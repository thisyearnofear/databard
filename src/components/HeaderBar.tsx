"use client";

import { WalletButton } from "./WalletButton";
import { SiteNav } from "./SiteNav";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Single fixed-position container for all top-right site chrome. Each child
 * is a plain flex item (no per-component `fixed`/`right-N` offsets) so
 * adding, removing, or resizing a control never requires re-guessing pixel
 * math across unrelated files. (SiteNav also renders its own mobile-only
 * bottom pill, independent of this row — see SiteNav.tsx.)
 */
export function HeaderBar() {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      <WalletButton />
      <SiteNav />
      <ThemeToggle />
    </div>
  );
}
