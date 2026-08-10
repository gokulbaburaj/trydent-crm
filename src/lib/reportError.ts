import { toast } from "@/components/Toaster";

/**
 * Tell the user something failed; tell the console why.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * 48 call sites did `toast.error(\`Couldn't save: ${error.message}\`)`. A
 * PostgrestError's message carries table names, column names and constraint
 * names — `new row violates check constraint "project_tasks_start_before_due"`
 * names two things an attacker would otherwise have to guess. Handing that to
 * whoever triggered it is a free map of the schema.
 *
 * The detail isn't discarded, it goes to the console where you can still debug
 * with it. Only the user-facing half is generalised.
 *
 * ── The tradeoff, stated ────────────────────────────────────────────────────
 *
 * Some Postgres messages are genuinely useful to a user — a check-constraint
 * violation can explain exactly what they did wrong. They lose that. The
 * alternative is an allowlist of messages we consider safe, which means
 * maintaining a list that silently rots every time a migration adds a
 * constraint. Generic-plus-logged is the cheaper correct answer; if a specific
 * failure deserves a specific message, write that message deliberately at the
 * call site rather than forwarding the database's.
 */
export function reportError(action: string, error: unknown): void {
  // Full detail to the console. Not stripped in production — this is the
  // developer's copy, and a browser console is already the user's own machine.
  console.error(`[${action}]`, error);

  toast.error(`Couldn't ${action}. Please try again.`);
}

/**
 * The same, for a failure that should stop a flow rather than just inform.
 *
 * Returns false so a caller can `if (!ok(...)) return;` without a second line.
 */
export function reportAndStop(action: string, error: unknown): false {
  reportError(action, error);
  return false;
}
