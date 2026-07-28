"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { portalEmail } from "@/lib/portal";
import { cn } from "@/lib/utils";

type Mode = "signin" | "forgot";

/**
 * Split-screen sign-in.
 *
 * The right panel is deliberately light while the rest of the app is dark.
 * That's not an inconsistency — it's the one page shown to people who aren't
 * "in" the product yet (clients opening a portal link, a new hire on day one),
 * and a bright card reads as a front door rather than a wall. It also means the
 * form can't reuse the app's dark Input/Button components, so the fields here
 * are styled locally. That's the cost of the choice, and it's contained to this
 * file.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isPortalUsername = identifier.length > 0 && !identifier.includes("@");

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase isn't configured. Add credentials to .env.local.");
      return;
    }

    setLoading(true);
    // Portal users sign in with a bare username; expand it to the address the
    // account was actually created with.
    const email = identifier.includes("@") ? identifier : portalEmail(identifier);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (signInError) {
      // Supabase says "Invalid login credentials" for both a wrong password and
      // an account that doesn't exist — deliberately, so the form can't be used
      // to discover who has an account. Don't undo that by being more specific.
      setError(signInError.message);
      return;
    }

    // Where they land is decided by middleware from their role, so send them to
    // the root and let it route. Hardcoding /dashboard sent portal users on a
    // pointless redirect through a page they can't open.
    router.push("/");
    router.refresh();
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!identifier.includes("@")) {
      setError(
        "Password resets go by email. Portal users should ask their account manager for a new password."
      );
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase isn't configured. Add credentials to .env.local.");
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(identifier, {
      redirectTo: `${window.location.origin}/login?reset=1`,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    // Same message whether or not the address exists — otherwise this form
    // becomes a way to enumerate who works here.
    setNotice("If that address has an account, a reset link is on its way.");
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-5 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-[1400px] overflow-hidden rounded-2xl sm:min-h-[calc(100vh-2.5rem)] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1fr_minmax(0,46%)]">
        {/* ---------------- Left: the pitch ---------------- */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-surface p-10 lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 45% at 20% 15%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%), radial-gradient(45% 40% at 85% 90%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)",
            }}
          />
          {/* Concentric rings, echoing the reference's radar motif. */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {[280, 420, 560, 700].map((size) => (
              <div
                key={size}
                className="absolute rounded-full border border-white/[0.06]"
                style={{
                  width: size,
                  height: size,
                  left: -size / 2,
                  top: -size / 2,
                }}
              />
            ))}
          </div>

          <p className="relative text-sm text-foreground-secondary">
            Clients, projects and money — in one place.
          </p>

          <div className="relative">
            <h2 className="text-[52px] font-semibold leading-[0.95] tracking-tight text-foreground">
              Run the
              <br />
              whole studio
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Pipeline, delivery, invoicing and the people doing the work. Trydent
              Labs keeps every part of the business talking to the others.
            </p>
          </div>

          <div className="relative flex items-center gap-2 text-xs text-muted-2">
            <span>© {new Date().getFullYear()} Trydent Labs</span>
          </div>
        </div>

        {/* ---------------- Right: the form ---------------- */}
        <div className="animate-page flex flex-col rounded-2xl bg-white p-8 text-neutral-900 sm:p-12 lg:rounded-l-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
                style={{ background: "var(--primary)" }}
              >
                TL
              </span>
              <span className="text-[17px] font-semibold tracking-tight">Trydent Labs</span>
            </div>
            {/* The reference has "Sign Up" here. We don't have self-service
                signup — accounts are issued by an admin — so promising one
                would be a dead end. */}
            <span className="hidden text-xs text-neutral-500 sm:block">
              Access is issued by your admin
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-center py-10">
            <div className="mx-auto w-full max-w-md">
              <h1 className="text-[40px] font-semibold leading-none tracking-tight">
                {mode === "signin" ? "Sign In" : "Reset"}
              </h1>
              <p className="mt-3 text-sm text-neutral-500">
                {mode === "signin"
                  ? "Use your work email, or the portal username we sent you."
                  : "We'll email you a link to set a new password."}
              </p>

              {!isSupabaseConfigured && (
                <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Supabase credentials aren&apos;t set. Add NEXT_PUBLIC_SUPABASE_URL and
                  NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.
                </div>
              )}

              <form
                onSubmit={mode === "signin" ? handleSignIn : handleForgot}
                className="mt-8 flex flex-col gap-3.5"
              >
                <div>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Email or Username"
                    className={FIELD}
                  />
                  {isPortalUsername && mode === "signin" && (
                    <p className="mt-1.5 pl-1 text-[11px] text-neutral-500">
                      Signing in as a client portal user.
                    </p>
                  )}
                </div>

                {mode === "signin" && (
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className={cn(FIELD, "pr-12")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "forgot" : "signin");
                    setError(null);
                    setNotice(null);
                  }}
                  className="self-start text-[13px] font-medium text-primary hover:underline"
                >
                  {mode === "signin" ? "Forgot password?" : "Back to sign in"}
                </button>

                {error && (
                  <p className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
                    {notice}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-medium text-white transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
                  style={{
                    background:
                      "linear-gradient(100deg, var(--primary), color-mix(in oklab, var(--primary) 65%, #ff5a3d))",
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {loading
                    ? mode === "signin"
                      ? "Signing in…"
                      : "Sending…"
                    : mode === "signin"
                      ? "Sign In"
                      : "Send reset link"}
                </button>
              </form>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>© {new Date().getFullYear()} Trydent Labs</span>
            <a href="mailto:hello@trydentlabs.com" className="hover:text-neutral-700">
              Contact us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared field styling. Light-panel only — see the note at the top of the file. */
const FIELD =
  "h-14 w-full rounded-full border border-neutral-200 bg-white px-5 text-[15px] text-neutral-900 " +
  "placeholder:text-neutral-400 transition-colors focus:border-neutral-400 focus:outline-none " +
  "focus:ring-4 focus:ring-neutral-900/5";
