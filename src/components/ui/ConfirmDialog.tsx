"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Confirmation for destructive actions.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * Two things, both wrong in different directions.
 *
 * Sixteen call sites used `window.confirm()`. It blocks the main thread, can't
 * be styled, ignores the theme, renders the origin above your text in most
 * browsers, and offers "OK / Cancel" for an action that deletes a client. It
 * also can't distinguish a destructive confirm from an ordinary one, so
 * `destructive-emphasis` is unreachable.
 *
 * Thirteen others had no confirmation at all — goals, team members, portal
 * logins and tasks all deleted on a single click, optimistically, so the row
 * vanished before the request even left. The reason isn't carelessness: there
 * was no primitive, so every page made its own call and half of them chose
 * nothing.
 *
 * ── Why an imperative promise, not a component per call site ────────────────
 *
 * The natural React shape here is a <ConfirmDialog open={...}> per page, which
 * means a piece of state, a pending-target ref and two handlers at all 29 call
 * sites. That's the reason the pattern never got adopted the first time.
 *
 * `await confirmAction({...})` reads almost exactly like the `window.confirm`
 * it replaces:
 *
 *     if (!confirm("Delete this?")) return;              // before
 *     if (!(await confirmAction({ title: "..." }))) return;  // after
 *
 * so converting a call site is a one-line change and adding one to a page that
 * had none is also a one-line change. Cheap enough that nobody skips it.
 *
 * The store is module-level and read with useSyncExternalStore — the same
 * shape sonner uses, and the reason a single <ConfirmHost /> in the dashboard
 * layout serves the whole app.
 */

export interface ConfirmOptions {
  title: string;
  /** What actually happens. Say the consequence, not "are you sure?". */
  body?: string;
  /** Verb, not "OK" — `destructive-emphasis` wants the button to name the act. */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * "danger" is the default because everything routed through here is
   * destructive. "neutral" exists for the rarer "you have unsaved changes".
   */
  tone?: "danger" | "neutral";
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => pending;
// The host renders nothing on the server, so a stable null keeps
// useSyncExternalStore from looping on a fresh object each call.
const getServerSnapshot = () => null;

/**
 * Ask, then resolve true if they confirmed.
 *
 * Only one dialog can be open at a time. A second call while one is pending
 * resolves the first as cancelled rather than stacking — two confirmations on
 * screen at once means neither is clearly about anything.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const current = pending;
  pending = null;
  emit();
  current?.resolve(ok);
}

/**
 * Mount once, near the root. Everything else talks to it through
 * `confirmAction`.
 */
export function ConfirmHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Radix calls onOpenChange(false) for Escape, the overlay and the X. All
  // three mean "no", which satisfies `escape-routes` and `modal-escape`
  // without three separate handlers.
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) settle(false);
  }, []);

  const danger = current?.tone !== "neutral";

  return (
    <Dialog open={current !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] gap-0 border-border bg-background p-0 sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3 space-y-0 p-4 pb-3 text-left">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4",
              danger
                ? "bg-danger text-white ring-danger/15"
                : "bg-warning text-black ring-warning/15"
            )}
          >
            {/* Icon plus colour, not colour alone — `color-not-only`. */}
            <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[14px] font-semibold leading-snug">
              {current?.title ?? ""}
            </DialogTitle>
            {current?.body && (
              <DialogDescription className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {current.body}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button variant="secondary" size="sm" onClick={() => settle(false)}>
            {current?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            size="sm"
            /*
              Autofocused on Cancel would be safer still, but Radix already
              focuses the first tabbable element (Cancel) on open — so the
              destructive button is never one stray Enter away.
            */
            className={cn(
              danger &&
                "bg-[var(--danger)] text-white hover:brightness-110 focus-visible:ring-[var(--danger)]"
            )}
            onClick={() => settle(true)}
          >
            {current?.confirmLabel ?? "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
