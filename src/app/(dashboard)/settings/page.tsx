"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import type { OnboardingTemplate, Role } from "@/lib/types";
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
    <div className="flex max-w-3xl flex-col gap-5">
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

      <RolesCard />
    </div>
  );
}

/**
 * Company roles — the admin-managed list that everything else reads from.
 *
 * Before this, a person's job was free text in three places (applicant, profile
 * team, profile title) and they could disagree. A role names the job once,
 * says which team it sits in, and points at the onboarding checklist a new
 * hire in that role should get.
 */
function RolesCard() {
  const { profile } = useAuth();
  const { rows: roles, setRows: setRoles } = useSupabaseTable<Role>("roles", {
    column: "sort_order",
    ascending: true,
  });
  const { rows: templates } = useSupabaseTable<OnboardingTemplate>("onboarding_templates");
  const { rows: staff } = useStaffProfiles();

  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = profile?.role === "admin";

  const teams = useMemo(
    () =>
      Array.from(
        new Set([
          ...roles.map((r) => r.team),
          ...staff.map((p) => p.team),
        ].filter((t): t is string => !!t))
      ).sort(),
    [roles, staff]
  );

  const headcount = (roleId: string) => staff.filter((p) => p.role_id === roleId).length;

  async function addRole() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("roles")
      .insert({ name: n, team: team.trim() || null, sort_order: roles.length })
      .select()
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(
        error?.message.includes("duplicate")
          ? "That role already exists."
          : `Couldn't add: ${error?.message ?? "unknown error"}`
      );
      return;
    }
    setRoles((prev) => [...prev, data as Role]);
    setName("");
    setTeam("");
  }

  async function updateRole(id: string, patch: Partial<Role>) {
    const before = roles;
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("roles").update(patch).eq("id", id);
    if (error) {
      setRoles(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function deleteRole(id: string) {
    if (headcount(id) > 0) {
      toast.error("Someone still holds this role. Move them first.");
      return;
    }
    const before = roles;
    setRoles((prev) => prev.filter((r) => r.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) {
      setRoles(before);
      toast.error(`Couldn't delete: ${error.message}`);
    }
  }

  if (!isAdmin) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold">Company roles</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The job list your whole app reads from. A role sets someone&apos;s team and the
        onboarding checklist they get when hired.
      </p>

      <div className="mt-3.5 flex flex-col gap-1.5">
        {roles.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No roles yet. Add the jobs you hire for.
          </p>
        )}
        {roles.map((r) => (
          <div
            key={r.id}
            // A fixed-width name input next to two fixed-width dropdowns left
            // the name with almost no room. Grid gives it a real minimum and
            // wraps the whole row on narrow screens instead of crushing it.
            className="group grid grid-cols-1 items-center gap-2 rounded-md border border-border-subtle px-2.5 py-2 sm:grid-cols-[minmax(8rem,1fr)_9rem_11rem_auto_auto]"
          >
            <input
              value={r.name}
              onChange={(e) =>
                setRoles((prev) =>
                  prev.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x))
                )
              }
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== r.name) updateRole(r.id, { name: v });
              }}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium hover:border-border focus:border-primary/60 focus:outline-none"
            />
            <div>
              <Dropdown
                value={r.team ?? ""}
                placeholder="No team"
                options={[
                  { value: "", label: "No team" },
                  ...teams.map((t) => ({ value: t, label: t })),
                ]}
                onChange={(v) => updateRole(r.id, { team: v || null })}
              />
            </div>
            <div>
              <Dropdown
                value={r.template_id ?? ""}
                placeholder="No checklist"
                options={[
                  { value: "", label: "No checklist" },
                  ...templates.map((t) => ({ value: t.id, label: t.name })),
                ]}
                onChange={(v) => updateRole(r.id, { template_id: v || null })}
              />
            </div>
            <span className="whitespace-nowrap text-right text-[11px] text-muted-2">
              {headcount(r.id)} {headcount(r.id) === 1 ? "person" : "people"}
            </span>
            <button
              type="button"
              aria-label={`Delete ${r.name}`}
              onClick={() => deleteRole(r.id)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addRole();
        }}
        className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle bg-white/[0.02] p-2.5"
      >
        <div className="min-w-[10rem] flex-1">
          <Label>Role name</Label>
          <Input
            placeholder="Video Editor"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Label>Team</Label>
          <Input
            placeholder="Video Editing"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add role
        </Button>
      </form>
    </Card>
  );
}
