"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  ALWAYS_GRANTED,
  ENFORCED_PAGES,
  GRANTABLE_PAGES,
  PAGE_LABELS,
  PORTAL_PAGE,
  isAdmin as hasAdminRights,
} from "@/lib/permissions";
import {
  VIEW_PREFERENCES,
  readViewPreference,
  writeViewPreference,
} from "@/lib/useViewPreference";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import type { OnboardingTemplate, Role, Team } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, setBaseCurrency, useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { ACCENT_PRESETS, accentIsRisky, useAccent } from "@/lib/theme";

export default function SettingsPage() {
  const { profile, email, isSupabaseConfigured } = useAuth();
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
    // Settings is a stack of small independent cards, so on a wide screen it
    // reads as two columns rather than one narrow ribbon pinned to the left.
    <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Your Profile</h3>
        {profile ? (
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={fullName || profile.full_name} url={avatarUrl || profile.avatar_url} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">{email}</p>
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
            Set a new password for {email}. You&apos;ll stay signed in.
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
        {accentIsRisky(primary) && (
          <p className="mt-2.5 text-xs text-warning">
            This accent is very close to white or black. It drives every chart series,
            progress bar and highlight, so on a dark background those will read as blank
            blocks. Pick a preset above if charts look empty.
          </p>
        )}
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

      {/* Roles is a table of rows, so it always wants the full width. */}
      <div className="xl:col-span-2">
        <DefaultViewsCard />
        <TeamsCard />
        <RolesCard />
      </div>
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
/**
 * Which view each page opens in.
 *
 * Every toggle in the app used to hardcode its starting view, so anyone who
 * lives in one of them re-clicked it on every visit. Saved per person, because
 * a recruiter working from the list and a designer working from the board are
 * both right.
 */
function DefaultViewsCard() {
  // Local mirror so the dropdowns re-render; localStorage isn't reactive.
  const [prefs, setPrefs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      VIEW_PREFERENCES.map((p) => [p.key, readViewPreference(p.key, p.fallback)])
    )
  );

  return (
    <Card>
      <h3 className="text-sm font-semibold">Default views</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Which layout each page opens in. Switching view while you work is
        temporary — this is the one that sticks.
      </p>

      <div className="mt-3.5 flex flex-col gap-2">
        {VIEW_PREFERENCES.map((pref) => (
          <div
            key={pref.key}
            className="grid grid-cols-1 items-center gap-2 rounded-md border border-border-subtle px-2.5 py-2 sm:grid-cols-[1fr_11rem]"
          >
            <span className="text-[13px] font-medium">{pref.label}</span>
            <Dropdown
              value={prefs[pref.key]}
              options={pref.options.map((o) => ({ value: o.id, label: o.label }))}
              onChange={(v) => {
                writeViewPreference(pref.key, v);
                setPrefs((prev) => ({ ...prev, [pref.key]: v }));
                toast.success(`${pref.label} opens in ${
                  pref.options.find((o) => o.id === v)?.label ?? v
                }`);
              }}
            />
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted-2">
        Saved on this device. Preferences like this stay out of the database so
        a page never waits on the network to know what to draw.
      </p>
    </Card>
  );
}

/**
 * Teams.
 *
 * These already existed, but the only way to rename or delete one was a
 * right-click-ish menu inside the org chart on the Team page — a view most
 * people never open. Nobody looks for "rename team" inside a chart. It belongs
 * next to Company roles, because a role points at a team and the two are edited
 * in the same sitting.
 *
 * A team name lives in three places: teams.name, profiles.team and roles.team.
 * Every write here fans out to all three, which is the bug that made renames
 * look like they half-worked.
 */
function TeamsCard() {
  const { access } = useAuth();
  const { rows: teams, setRows: setTeams } = useSupabaseTable<Team>("teams", {
    column: "name",
    ascending: true,
  });
  const { rows: roles, setRows: setRoles } = useSupabaseTable<Role>("roles");
  const { rows: staff } = useStaffProfiles();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = hasAdminRights(access);
  const headcount = (team: string) => staff.filter((p) => p.team === team).length;
  const roleCount = (team: string) => roles.filter((r) => r.team === team).length;

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (teams.some((t) => t.name.toLowerCase() === n.toLowerCase())) {
      toast.error(`"${n}" already exists.`);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    if (!supabase) return setBusy(false);
    const { data, error } = await supabase.from("teams").insert({ name: n }).select().single();
    setBusy(false);
    if (error || !data) {
      toast.error(`Couldn't add: ${error?.message ?? "unknown error"}`);
      return;
    }
    setTeams((prev) => [...prev, data as Team]);
    setName("");
  }

  async function renameTeam(team: Team, next: string) {
    const n = next.trim();
    if (!n || n === team.name) return;
    if (teams.some((t) => t.id !== team.id && t.name.toLowerCase() === n.toLowerCase())) {
      toast.error(`"${n}" already exists.`);
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, name: team.name } : t)));
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("teams").update({ name: n }).eq("id", team.id);
    if (error) {
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, name: team.name } : t)));
      toast.error(`Couldn't rename: ${error.message}`);
      return;
    }
    // Carry everyone and every role across, or they end up pointing at a team
    // name that no longer exists.
    await supabase.from("profiles").update({ team: n }).eq("team", team.name);
    await supabase.from("roles").update({ team: n }).eq("team", team.name);
    setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, name: n } : t)));
    setRoles((prev) => prev.map((r) => (r.team === team.name ? { ...r, team: n } : r)));
    toast.success(`Renamed to "${n}"`);
  }

  async function deleteTeam(team: Team) {
    const people = headcount(team.name);
    const jobs = roleCount(team.name);
    const affected = [
      people > 0 && `${people} ${people === 1 ? "person" : "people"}`,
      jobs > 0 && `${jobs} ${jobs === 1 ? "role" : "roles"}`,
    ].filter(Boolean).join(" and ");
    if (
      !confirm(
        affected
          ? `Delete "${team.name}"? ${affected} will be left without a team. Nobody is removed and no role is deleted.`
          : `Delete "${team.name}"?`
      )
    )
      return;

    const before = teams;
    setTeams((prev) => prev.filter((t) => t.id !== team.id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    if (error) {
      // This used to fail silently, which is how a delete looks like it did
      // nothing until you reload.
      setTeams(before);
      toast.error(`Couldn't delete: ${error.message}`);
      return;
    }
    await supabase.from("profiles").update({ team: null }).eq("team", team.name);
    await supabase.from("roles").update({ team: null }).eq("team", team.name);
    setRoles((prev) => prev.map((r) => (r.team === team.name ? { ...r, team: null } : r)));
    toast.success(`"${team.name}" deleted`);
  }

  if (!isAdmin) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold">Teams</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The groups roles and people belong to. Renaming one moves everybody on it.
      </p>

      <div className="mt-3.5 flex flex-col gap-1.5">
        {teams.length === 0 && (
          <p className="text-xs text-muted-foreground">No teams yet.</p>
        )}
        {teams.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-2"
          >
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-2" />
            <input
              defaultValue={t.name}
              onBlur={(e) => renameTeam(t, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = t.name;
                  e.currentTarget.blur();
                }
              }}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium hover:border-border focus:border-primary/60 focus:outline-none"
            />
            <span className="whitespace-nowrap text-[11px] text-muted-2">
              {headcount(t.name)} {headcount(t.name) === 1 ? "person" : "people"}
              {roleCount(t.name) > 0 && ` · ${roleCount(t.name)} role${roleCount(t.name) === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              aria-label={`Delete ${t.name}`}
              onClick={() => deleteTeam(t)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={addTeam} className="mt-3 flex items-center gap-2">
        <Input
          placeholder="New team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </form>
    </Card>
  );
}

function RolesCard() {
  const { access } = useAuth();
  const { rows: roles, setRows: setRoles } = useSupabaseTable<Role>("roles", {
    column: "sort_order",
    ascending: true,
  });
  const { rows: templates } = useSupabaseTable<OnboardingTemplate>("onboarding_templates");
  const { rows: staff } = useStaffProfiles();

  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const [openAccess, setOpenAccess] = useState<string | null>(null);

  // Admin by account type OR by a role carrying the flag — matches
  // current_is_admin() in the database, which is what actually gates the write.
  const isAdmin = hasAdminRights(access);

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
      // A new role starts with the baseline rather than nothing — an empty
      // grant list means whoever gets it signs in to an app with no sidebar.
      .insert({
        name: n,
        team: team.trim() || null,
        pages: ["projects", "schedule"],
        sort_order: roles.length,
      })
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

      {/*
        Was: five controls per row, all shouting at once — an unlabelled name
        field, two full-width dropdowns (one of which read "No checklist" five
        times), an access chip and a headcount. You couldn't scan the list
        because nothing in a row was quieter than anything else.

        Now: each role is one readable line, and editing lives behind a click.
        You open a role when you mean to change it, which is rare, and read the
        list the rest of the time, which is constant.
      */}
      <div className="mt-3.5 flex flex-col gap-1.5">
        {roles.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No roles yet. Add the jobs you hire for.
          </p>
        )}
        {roles.map((r) => {
          const open = openAccess === r.id;
          const pageCount = (r.pages ?? []).length;
          const people = headcount(r.id);
          const checklist = templates.find((t) => t.id === r.template_id) ?? null;
          return (
            <div
              key={r.id}
              className={cn(
                "overflow-hidden rounded-lg border transition-colors",
                open ? "border-border bg-white/[0.02]" : "border-border-subtle"
              )}
            >
              <button
                type="button"
                onClick={() => setOpenAccess(open ? null : r.id)}
                className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-white/[0.03]"
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform duration-200",
                    open && "rotate-90"
                  )}
                />
                <span className="min-w-0 truncate text-[13px] font-medium">{r.name}</span>

                {r.team ? (
                  <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {r.team}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-2">No team</span>
                )}

                {/* Only shown when set — five rows of "No checklist" was noise
                    pretending to be information. */}
                {checklist && (
                  <span className="hidden shrink-0 truncate text-[11px] text-muted-2 sm:inline">
                    {checklist.name}
                  </span>
                )}

                <span className="ml-auto flex shrink-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "flex items-center gap-1 whitespace-nowrap text-[11px]",
                      r.is_admin ? "text-warning" : "text-muted-foreground"
                    )}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {r.is_admin ? "Full admin" : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-muted-2">
                    {people} {people === 1 ? "person" : "people"}
                  </span>
                </span>
              </button>

              {open && (
                <div className="animate-row border-t border-border-subtle px-3 pb-3 pt-2.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <Label>Role name</Label>
                      <Input
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
                      />
                    </div>
                    <div>
                      <Label>Team</Label>
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
                      <Label>Onboarding checklist</Label>
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
                  </div>

                  <div className="mt-3.5 border-t border-border-subtle pt-2.5">
                    <Label>Pages</Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      What someone in this role sees in the sidebar. Pages marked{" "}
                      <span className="text-warning">enforced</span> are also locked in the
                      database — granting one hands over the data, not just the menu item.
                    </p>

                    <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                      {GRANTABLE_PAGES.map((page) => {
                        const locked = ALWAYS_GRANTED.includes(page);
                        const on = locked || (r.pages ?? []).includes(page);
                        return (
                          <Checkbox
                            key={page}
                            checked={on}
                            // Everyone keeps My Work and Settings — without them a
                            // person signs in to a dead app and can't even change
                            // their own password.
                            disabled={locked || r.is_admin}
                            onChange={(next) =>
                              updateRole(r.id, {
                                pages: next
                                  ? [...new Set([...(r.pages ?? []), page])]
                                  : (r.pages ?? []).filter((p) => p !== page),
                              })
                            }
                            label={
                              <span className="flex items-center gap-1 text-[12px]">
                                {PAGE_LABELS[page]}
                                {ENFORCED_PAGES.includes(page) && (
                                  <span className="text-[9px] uppercase tracking-wide text-warning">
                                    enforced
                                  </span>
                                )}
                                {page === PORTAL_PAGE && (
                                  <span className="text-[9px] uppercase tracking-wide text-muted-2">
                                    instead of the app
                                  </span>
                                )}
                              </span>
                            }
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-2.5">
                    <Checkbox
                      checked={r.is_admin}
                      onChange={(next) => {
                        if (
                          next &&
                          !confirm(
                            `Give everyone with the "${r.name}" role full admin rights? ` +
                              `They'll see what people are paid, and be able to change roles ` +
                              `and access — including yours.`
                          )
                        ) {
                          return;
                        }
                        updateRole(r.id, { is_admin: next });
                      }}
                      label={
                        <span className="text-[12px]">
                          Full admin rights
                          <span className="ml-1.5 text-[11px] text-muted-2">
                            every page, plus pay, roles and logins
                          </span>
                        </span>
                      }
                    />
                    <button
                      type="button"
                      onClick={() => deleteRole(r.id)}
                      className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" /> Delete role
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addRole();
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <Input
          placeholder="New role name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[10rem] flex-1"
        />
        <div className="w-44">
          <Dropdown
            value={team}
            placeholder="No team"
            options={[
              { value: "", label: "No team" },
              ...teams.map((t) => ({ value: t, label: t })),
            ]}
            onChange={setTeam}
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add role
        </Button>
      </form>
    </Card>
  );
}
