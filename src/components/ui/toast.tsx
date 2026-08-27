"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastMessage, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = `toast_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
      const newToast: ToastMessage = { ...toast, id };
      setToasts((prev) => [...prev.slice(-4), newToast]);

      const duration = toast.durationMs ?? 4000;
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, description?: string) => showToast({ type: "success", title, description }),
    [showToast]
  );

  const error = useCallback(
    (title: string, description?: string) => showToast({ type: "error", title, description }),
    [showToast]
  );

  const info = useCallback(
    (title: string, description?: string) => showToast({ type: "info", title, description }),
    [showToast]
  );

  const warning = useCallback(
    (title: string, description?: string) => showToast({ type: "warning", title, description }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
      {children}
      {/* Toast Render Portal */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const isSuccess = t.type === "success";
          const isError = t.type === "error";
          const isWarning = t.type === "warning";

          return (
            <div
              key={t.id}
              className={`pointer-events-auto border p-3.5 shadow-2xl flex items-start gap-3 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                isSuccess
                  ? "bg-[#0f170d] border-[#3e5532] text-[#f0eee6]"
                  : isError
                  ? "bg-[#1c0e0d] border-[#592321] text-[#ffd6d3]"
                  : isWarning
                  ? "bg-[#1a160d] border-[#59421f] text-[#ffe6b3]"
                  : "bg-[#0d100d] border-[#252a24] text-[#e3e1d8]"
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="h-4 w-4 text-[#a4b58a]" />}
                {isError && <AlertTriangle className="h-4 w-4 text-[#d9776f]" />}
                {isWarning && <AlertTriangle className="h-4 w-4 text-[#d9aa6f]" />}
                {t.type === "info" && <Info className="h-4 w-4 text-[#88b0c4]" />}
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold font-mono tracking-tight">{t.title}</h4>
                {t.description && (
                  <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed font-sans">{t.description}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="shrink-0 opacity-60 hover:opacity-100 p-0.5 text-current"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return context;
}
