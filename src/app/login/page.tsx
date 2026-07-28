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
 * Layout borrowed from the reference; visual language is ours. The first pass
 * imported the reference's look wholesale — white panel, pill fields, gradient
 * button — and none of that exists anywhere else in this app. A login screen
 * that doesn't look like the product it opens is a worse first impression than
 * a plain one.
 *
 * So: dark panels, `--radius` corners like every other surface, the flat
 * `bg-primary` button used on every form, and the TL mark from the sidebar.
 * The only thing that stays oversized is field height — 52px reads as a front
 * door rather than a table filter, and it's the one place that's warranted.
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
            Trydent Labs
          </p>

          <div className="relative">
            <h2 className="text-[52px] font-semibold leading-[0.95] tracking-tight text-foreground">
              Trydent Labs
              <br />
              <span className="text-muted-foreground">CRM</span>
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Clients, pipeline, projects, invoicing and the people doing the
              work — one place, so none of it drifts apart.
            </p>
          </div>

          <div className="relative flex items-center gap-2 text-xs text-muted-2">
            <span>© {new Date().getFullYear()} Trydent Labs</span>
          </div>
        </div>

        {/* ---------------- Right: the form ---------------- */}
        <div className="animate-page flex flex-col rounded-2xl border-l border-border bg-panel p-8 text-foreground sm:p-12 lg:rounded-l-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* Same mark as the sidebar and both portals — one brand, one
                  square, driven by the accent you set in Settings. */}
              <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-[11px] font-medium text-primary-foreground">
                TL
              </span>
              <span className="text-[17px] font-semibold tracking-tight">Trydent Labs</span>
            </div>
            {/* The reference has "Sign Up" here. We don't have self-service
                signup — accounts are issued by an admin — so promising one
                would be a dead end. */}
            <span className="hidden text-xs text-muted-foreground sm:block">
              Access is issued by your admin
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-center py-10">
            <div className="mx-auto w-full max-w-md">
              <h1 className="text-[40px] font-semibold leading-none tracking-tight">
                {mode === "signin" ? "Sign In" : "Reset"}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Use your work email, or the portal username we sent you."
                  : "We'll email you a link to set a new password."}
              </p>

              {!isSupabaseConfigured && (
                <div className="mt-6 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
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
                    <p className="mt-1.5 pl-1 text-[11px] text-muted-2">
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
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
                  <p className="rounded-md border border-danger/25 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="rounded-md border border-success/25 bg-success/10 px-4 py-2.5 text-[13px] text-success">
                    {notice}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
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

          <div className="flex items-center justify-between text-xs text-muted-2">
            <span>© {new Date().getFullYear()} Trydent Labs</span>
            <a href="mailto:hello@trydentlabs.com" className="hover:text-foreground">
              Contact us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Login-page fields: app radius and tokens, just taller than usual. */
const FIELD =
  "h-[52px] w-full rounded-lg border border-border bg-surface px-5 text-[15px] text-foreground " +
  "placeholder:text-muted-2 transition-colors focus:border-primary/60 focus:outline-none " +
  "focus:ring-2 focus:ring-ring/30";
