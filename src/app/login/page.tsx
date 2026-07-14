"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { portalEmail } from "@/lib/portal";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = createClient();
    if (!supabase) {
      setError(
        "Supabase is not configured yet. Add credentials to .env.local to enable sign-in."
      );
      return;
    }

    setLoading(true);
    // Client-portal users sign in with a plain username — expand it to the portal email.
    const identifier = email.includes("@") ? email : portalEmail(email);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-accent text-xs font-medium text-accent-foreground">
            TL
          </div>
          <h1 className="text-[17px] font-semibold text-foreground">Trydent Labs</h1>
          <p className="text-sm text-muted">Sign in to your CRM account</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-4 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Supabase credentials are not set. Add NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label>Email or username</Label>
            <Input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@trydentlabs.com or portal username"
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
