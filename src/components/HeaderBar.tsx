"use client";

import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Top-right chrome for non-home pages: wallet button + theme toggle.
 * On the home page, these are folded into the persona toggle row instead,
 * so we hide this to avoid duplicate controls.
 */
export function HeaderBar() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      <WalletButton />
      <ThemeToggle />
    </div>
  );
}
