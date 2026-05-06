"use client";

/**
 * Lightweight toast notification system.
 * Uses React context + DOM portal for stacking toasts.
 */
import { createContext, useCallback, useContext, useState, useEffect, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";

type ToastType = "error" | "success" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2, 8);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: "420px" }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => onDismiss(toast.id), toast.type === "error" ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onDismiss]);

  const bg = toast.type === "error"
    ? "bg-[var(--danger)]"
    : toast.type === "success"
    ? "bg-emerald-600"
    : "bg-[var(--accent)]";

  const icon = toast.type === "error" ? "!" : toast.type === "success" ? "\u2713" : "i";

  return (
    <div
      role="alert"
      onClick={() => onDismiss(toast.id)}
      className={`
        ${bg} text-white text-sm px-4 py-3 rounded-lg shadow-lg
        pointer-events-auto cursor-pointer transition-all duration-300
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
        flex items-start gap-3
      `}
    >
      <span className="font-bold text-base leading-none mt-0.5 shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
        {icon}
      </span>
      <span className="flex-1">{toast.message}</span>
      <span className="text-white/60 text-xs leading-none mt-0.5 shrink-0">\u00d7</span>
    </div>
  );
}
