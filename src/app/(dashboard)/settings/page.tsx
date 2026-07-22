"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, setBaseCurrency, useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { ACCENT_PRESETS, useAccent } from "@/lib/theme";

export default function SettingsPage() {
  const { profile, isSupabaseConfigured } = useAuth();
  const { primary, setAccent } = useAccent();
  const { currency, base, converted, ratesFetchedAt } = useCurrency();
  const [customHex, setCustomHex] = useState("");

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Seed the form once the profile arrives.
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (!profile) return;
    queueMicrotask(() => {
      setFullName(profile.full_name ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const dirty =
    !!profile &&
    (fullName.trim() !== (profile.full_name ?? "") || avatarUrl.trim() !== (profile.avatar_url ?? ""));

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const name = fullName.trim();
    if (!name) {
      toast.error("Name can't be empty.");
      return;
    }
    setSavingProfile(true);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, avatar_url: avatarUrl.trim() || null })
      .eq("id", profile.id);
    setSavingProfile(false);
    if (error) {
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }
    toast.success("Profile updated");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return;
    setSavingPassword(true);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      toast.error(`Couldn't change password: ${error.message}`);
      return;
    }
    setPassword("");
    toast.success("Password updated");
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Your Profile</h3>
        {profile ? (
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={fullName || profile.full_name} url={avatarUrl || profile.avatar_url} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
                <Badge tone="green" className="mt-1">{profile.role}</Badge>
              </div>
            </div>
            <div>
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <Label>Avatar image URL (optional)</Label>
              <Input
                placeholder="https://..."
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={!dirty || savingProfile}>
                {savingProfile ? "Saving..." : "Save profile"}
              </Button>
              {dirty && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setFullName(profile.full_name ?? "");
                    setAvatarUrl(profile.avatar_url ?? "");
                  }}
                >
                  Reset
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Not signed in.</p>
        )}
      </Card>

      {profile && (
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Password</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Set a new password for {profile.email}. You&apos;ll stay signed in.
          </p>
          <form onSubmit={changePassword} className="flex items-center gap-2">
            <Input
              type="password"
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="max-w-[260px]"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={password.length < 8 || savingPassword}>
              {savingPassword ? "Updating..." : "Update password"}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Theme</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Accent color used for buttons, selection, focus states, and highlights across the app.
        </p>
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map((p) => {
            const active = p.primary.toLowerCase() === primary.toLowerCase();
            return (
              <button
                key={p.primary}
                title={p.name}
                onClick={() => setAccent(p.primary)}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                  active ? "ring-2 ring-white/60 ring-offset-2 ring-offset-surface" : ""
                }`}
                style={{ background: p.primary }}
              >
                {active && <Check className="h-4 w-4" style={{ color: p.foreground }} />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Input
            placeholder="#5e6ad2 — custom hex"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            className="max-w-[180px]"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!/^#[0-9a-fA-F]{6}$/.test(customHex)}
            onClick={() => setAccent(customHex)}
          >
            Apply
          </Button>
          <span
            className="ml-1 h-5 w-5 rounded-full border border-border"
            style={{ background: /^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : primary }}
          />
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Base currency</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Every amount in the app — deal values, payments received, staff payment plans — is
          stored in this currency. The currency toggle converts from it using live rates, so
          switching display shows real converted values.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setBaseCurrency(c.code)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                c.code === base
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-foreground-secondary hover:bg-white/5 hover:text-foreground"
              )}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {currency === base ? (
            <>Showing amounts in the base currency.</>
          ) : converted ? (
            <>
              Showing amounts converted to <span className="text-foreground-secondary">{currency}</span>
              {ratesFetchedAt && <> · rates updated {formatDistanceToNow(ratesFetchedAt, { addSuffix: true })}</>}
            </>
          ) : (
            <span className="text-warning">
              Live rates unavailable right now — amounts are shown in {base} until they load.
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-warning">
          Changing the base doesn&apos;t re-value existing records — it changes what the stored
          numbers mean. Only change this if your stored amounts really are in that currency.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Environment</h3>
        <p className="text-sm">
          Supabase connection:{" "}
          {isSupabaseConfigured ? (
            <span className="text-success">Connected</span>
          ) : (
            <span className="text-warning">Not configured</span>
          )}
        </p>
      </Card>
    </div>
  );
}
