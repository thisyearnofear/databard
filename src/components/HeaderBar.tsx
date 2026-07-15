"use client";

import { WalletButton } from "./WalletButton";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Top-right chrome only: wallet button + theme toggle.
 * SiteNav is now rendered in page.tsx, centered above the persona toggle,
 * so the nav feels like part of the page structure, not stranded in the corner.
 */
export function HeaderBar() {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      <WalletButton />
      <ThemeToggle />
    </div>
  );
}
