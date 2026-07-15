"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const EVENT = "trydent-toast";
let counter = 0;

/** Fire a toast from anywhere: toast.success("Saved"), toast.error("Failed"). */
export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
  info: (message: string) => emit("info", message),
};

function emit(type: ToastType, message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { id: ++counter, type, message } })
  );
}

const ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: Check,
  error: AlertTriangle,
  info: Info,
};

const ICON_CLASS: Record<ToastType, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-accent",
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setToasts((prev) => [...prev.slice(-3), t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className="animate-pop pointer-events-auto flex max-w-xs items-start gap-2.5 rounded-md border border-border bg-surface px-3.5 py-2.5 shadow-xl shadow-black/50"
          >
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", ICON_CLASS[t.type])} />
            <p className="min-w-0 flex-1 text-[13px] text-foreground">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="rounded p-0.5 text-muted hover:bg-white/5 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
