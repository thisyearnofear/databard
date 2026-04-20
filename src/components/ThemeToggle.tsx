"use client";

import { useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("databard:theme") as Theme | null;
    if (saved) {
      setTheme(saved);
      if (saved !== "system") document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  function cycle() {
    const next: Theme = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
    localStorage.setItem("databard:theme", next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  const icon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "💻";

  return (
    <button
      onClick={cycle}
      className="fixed top-4 right-4 z-50 w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-sm cursor-pointer hover:border-[var(--accent)] transition-colors"
      title={`Theme: ${theme}`}
      aria-label={`Switch theme (current: ${theme})`}
    >
      {icon}
    </button>
  );
}
