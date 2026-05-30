"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TooltipStep {
  id: string;
  target?: string; // CSS selector for the target element
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

const DEFAULT_STEPS: TooltipStep[] = [
  {
    id: "welcome",
    title: "Welcome to DataBard",
    content: "Transform your data catalog into audio podcasts. Start by connecting a data source, then generate and share insights.",
    position: "bottom",
  },
  {
    id: "schema-picker",
    target: "[data-tour='schema-picker']",
    title: "Choose Your Schema",
    content: "Pick the schema with the most tables for the richest episode. The recommended schema is highlighted.",
    position: "right",
  },
  {
    id: "research-question",
    target: "[data-tour='research-question']",
    title: "Ask Your Question",
    content: "A specific question surfaces actionable insights. \"Which tables have failing tests?\" works great.",
    position: "top",
  },
  {
    id: "player",
    target: "[data-tour='episode-player']",
    title: "Interactive Player",
    content: "Click any segment to drill into actual columns, tests, and lineage. Use the tabs to explore insights and actions.",
    position: "top",
  },
];

interface OnboardingTooltipProps {
  steps?: TooltipStep[];
  storageKey?: string;
  onComplete?: () => void;
}

export function OnboardingTooltip({
  steps = DEFAULT_STEPS,
  storageKey = "databard:onboarding-complete",
  onComplete,
}: OnboardingTooltipProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 320, height: 200 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Check if onboarding has been completed
  useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = localStorage.getItem(storageKey);
    if (completed) {
      setVisible(false);
      return;
    }
    // Show first tooltip after a short delay
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, [storageKey]);

  // Calculate target position
  const updateTargetRect = useCallback(() => {
    const step = steps[currentStep];
    if (!step?.target) {
      setTargetRect(null);
      return;
    }
    const element = document.querySelector(step.target);
    if (element) {
      setTargetRect(element.getBoundingClientRect());
    }
  }, [currentStep, steps]);

  useEffect(() => {
    if (!visible) return;
    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [visible, updateTargetRect]);

  // Measure actual tooltip dimensions via ResizeObserver
  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setTooltipSize({ width, height });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, currentStep]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      // Complete onboarding
      localStorage.setItem(storageKey, "true");
      setVisible(false);
      onComplete?.();
    }
  };

  const handleSkip = () => {
    localStorage.setItem(storageKey, "true");
    setVisible(false);
    onComplete?.();
  };

  if (!visible) return null;

  const step = steps[currentStep];
  const isWelcome = step.id === "welcome";

  // Calculate tooltip position using measured dimensions
  const getTooltipStyle = () => {
    if (isWelcome || !targetRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const padding = 16;
    const pos = step.position || "bottom";
    let top = 0;
    let left = 0;

    switch (pos) {
      case "bottom":
        top = targetRect.bottom + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipSize.width / 2;
        break;
      case "top":
        top = targetRect.top - tooltipSize.height - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipSize.width / 2;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - tooltipSize.height / 2;
        left = targetRect.right + padding;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - tooltipSize.height / 2;
        left = targetRect.left - tooltipSize.width - padding;
        break;
    }

    // Clamp to viewport
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipSize.width - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipSize.height - padding));

    return { top: `${top}px`, left: `${left}px` };
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={handleSkip}
        style={{ backdropFilter: "blur(2px)" }}
      />

      {/* Highlight ring around target */}
      {targetRect && !isWelcome && (
        <div
          className="fixed z-40 border-2 border-[var(--accent)] rounded-lg pointer-events-none animate-pulse"
          style={{
            top: `${targetRect.top - 4}px`,
            left: `${targetRect.left - 4}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-50 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl animate-slide-up"
        style={{
          ...getTooltipStyle(),
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">{step.title}</h3>
            <span className="text-[10px] text-[var(--text-muted)]">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{step.content}</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--bg)]/50 rounded-b-xl">
          <button
            onClick={handleSkip}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
          >
            Skip tour
          </button>
          <button
            onClick={handleNext}
            className="text-xs bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-3 py-1.5 cursor-pointer font-medium"
          >
            {currentStep < steps.length - 1 ? "Next" : "Get started"}
          </button>
        </div>
      </div>
    </>
  );
}
