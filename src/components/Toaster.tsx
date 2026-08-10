"use client";

import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={16}
      // `unstyled` because every toast renders our own card below — otherwise
      // sonner's container fights it for background, padding and radius.
      toastOptions={{ unstyled: true, classNames: { toast: "w-full" } }}
    />
  );
}

type Tone = "success" | "error" | "warning" | "info";

const TONE: Record<Tone, { icon: typeof Check; chip: string; ring: string }> = {
  success: { icon: Check, chip: "bg-success text-black", ring: "ring-success/20" },
  error: { icon: X, chip: "bg-danger text-white", ring: "ring-danger/20" },
  warning: { icon: AlertTriangle, chip: "bg-warning text-black", ring: "ring-warning/20" },
  info: { icon: Info, chip: "bg-primary text-primary-foreground", ring: "ring-primary/20" },
};

interface ToastOptions {
  /** Small suffix after the title — a count, a client name, a version. */
  meta?: string;
  /** Second line. Say what happened or what to do next, not both. */
  body?: string;
  /** Filled button. Only when there's genuinely something to do. */
  action?: { label: string; onClick: () => void };
  /** Outlined button for the escape hatch — details, docs, undo. */
  secondary?: { label: string; onClick: () => void };
  duration?: number;
}

/**
 * Toast card, modelled on the notification pattern from the design reference:
 * semantic icon chip, title with optional meta, short body, then a secondary
 * and a primary action.
 *
 * The point isn't decoration. The old toast was a single line of text, so
 * anything needing a decision — "couldn't save, retry?" — had nowhere to put
 * the decision. Failures became dead ends you recovered from by repeating
 * whatever you'd just done and hoping.
 */
function ToastCard({
  id,
  tone,
  title,
  meta,
  body,
  action,
  secondary,
}: { id: string | number; tone: Tone; title: string } & ToastOptions) {
  const { icon: Icon, chip, ring } = TONE[tone];
  const dismiss = () => sonnerToast.dismiss(id);

  return (
    <div
      className={cn(
        "animate-pop flex w-[380px] max-w-[calc(100vw-2rem)] gap-3 rounded-lg",
        "border border-border bg-elevated p-3.5 shadow-[var(--shadow-xl)]"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4",
          chip,
          ring
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={3} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-foreground">
            {title}
            {meta && (
              <span className="ml-1.5 font-normal text-muted-2">
                <span className="mr-1.5 text-muted-2/60">|</span>
                {meta}
              </span>
            )}
          </p>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-muted-2 transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {body && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
        )}

        {(action || secondary) && (
          <div className="mt-2.5 flex items-center gap-2">
            {secondary && (
              <button
                onClick={() => {
                  secondary.onClick();
                  dismiss();
                }}
                className="rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground-secondary transition-colors hover:bg-hover hover:text-foreground"
              >
                {secondary.label}
              </button>
            )}
            {action && (
              <button
                onClick={() => {
                  action.onClick();
                  dismiss();
                }}
                className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-[filter,transform] hover:brightness-90 active:scale-[0.97]"
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function show(tone: Tone, title: string, opts: ToastOptions = {}) {
  return sonnerToast.custom(
    (id) => <ToastCard id={id} tone={tone} title={title} {...opts} />,
    {
      // An error you didn't read is an error that happens twice. Errors, and
      // anything carrying an action, wait to be dismissed. The rest fade.
      duration: opts.duration ?? (tone === "error" || opts.action ? Infinity : 4000),
    }
  );
}

/**
 * Existing call sites are unchanged — `toast.success("Saved")` still works.
 * The options argument is the new part.
 */
export const toast = Object.assign(
  (title: string, opts?: ToastOptions) => show("info", title, opts),
  {
    success: (title: string, opts?: ToastOptions) => show("success", title, opts),
    error: (title: string, opts?: ToastOptions) => show("error", title, opts),
    warning: (title: string, opts?: ToastOptions) => show("warning", title, opts),
    info: (title: string, opts?: ToastOptions) => show("info", title, opts),
    dismiss: sonnerToast.dismiss,
  }
);
