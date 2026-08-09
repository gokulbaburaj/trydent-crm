"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Check, ChevronRight, GripVertical, ShieldCheck, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { isAdmin as hasAdminRights } from "@/lib/permissions";
import {
  VIEW_PREFERENCES,
  orderedViewPreferences,
  readViewOrder,
  readViewPreference,
  writeViewOrder,
  writeViewPreference,
} from "@/lib/useViewPreference";
import { useOrgAdmin } from "@/lib/useOrgAdmin";
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
                  : "border-border bg-surface text-foreground-secondary hover:bg-hover hover:text-foreground"
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

      {/*
        Roles is a table of rows, so it always wants the full width.

        `flex flex-col gap-5`, not a bare div: wrapping these to span both
        columns takes them out of the grid, and the grid's own `gap-5` stops
        applying between them. Without it the three cards in here stack flush
        while every card above is 20px apart.
      */}
      <div className="flex flex-col gap-5 xl:col-span-2">
        <DefaultViewsCard />
        <OrgSummaryCards />
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
  // Read once in the initialiser, same as the preferences above — reading it in
  // an effect renders the default order and then reshuffles.
  const [order, setOrderState] = useState<string[]>(() => readViewOrder());
  const ordered = useMemo(() => orderedViewPreferences(order), [order]);

  // Distance constraint so a click on the row still reaches the dropdown.
  /*
  KeyboardSensor alongside PointerSensor.

  Every drag surface in this app shipped pointer-only, which means reordering
  was impossible without a mouse — six surfaces, none of them keyboard
  reachable. dnd-kit is accessible by design, but only if you register this
  sensor; the accessibility isn't automatic, it's opt-in and we hadn't opted.

  `sortableKeyboardCoordinates` is what makes arrow keys move an item BY LIST
  POSITION rather than by pixels. Without it the default coordinate getter
  moves 25px per press, which on a sortable list means several presses to
  advance one row and no way to know when you've crossed a boundary.

  Interaction: Tab to the item, Space to lift, arrows to move, Space to drop,
  Escape to cancel. dnd-kit announces each step to screen readers using its
  built-in announcements.
*/
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // VIEW_PREFERENCES is `as const`, so `.key` is a literal union and
    // indexOf(string) won't typecheck against it. The dnd ids are plain
    // strings, so widen here rather than casting at every call.
    const keys: string[] = ordered.map((p) => p.key);
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = arrayMove(keys, from, to);
    setOrderState(next);
    writeViewOrder(next);
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold">Default views</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Which layout each page opens in. Switching view while you work is
        temporary — this is the one that sticks.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((p) => p.key)} strategy={verticalListSortingStrategy}>
          <div className="mt-3.5 flex flex-col gap-2">
            {ordered.map((pref) => (
              <SortableViewRow
                key={pref.key}
                id={pref.key}
                label={pref.label}
                value={prefs[pref.key]}
                options={pref.options.map((o) => ({ value: o.id, label: o.label }))}
                onChange={(v) => {
                  writeViewPreference(pref.key, v);
                  setPrefs((prev) => ({ ...prev, [pref.key]: v }));
                  toast.success(
                    `${pref.label} opens in ${
                      pref.options.find((o) => o.id === v)?.label ?? v
                    }`
                  );
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <p className="mt-3 text-[11px] text-muted-2">
        Saved on this device, order included. Preferences like this stay out of
        the database so a page never waits on the network to know what to draw.
      </p>
    </Card>
  );
}

/**
 * One draggable preference row.
 *
 * Listeners go on the grip only, not the whole row. The Sidebar spreads them
 * across the entire item because the item is a link and a 5px distance
 * threshold is enough to tell a click from a drag — but this row contains a
 * Radix dropdown, and a pointerdown captured by dnd-kit before Radix sees it
 * means the menu never opens.
 */
function SortableViewRow({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-border-subtle px-2.5 py-2 sm:grid-cols-[auto_1fr_11rem]",
        isDragging && "relative z-10 border-border bg-surface opacity-90 shadow-lg shadow-black/30"
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label}`}
        className="touch-none cursor-grab rounded-md p-0.5 text-muted-2 transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-[13px] font-medium">{label}</span>
      <Dropdown value={value} options={options} onChange={onChange} />
    </div>
  );
}

/**
 * Teams and roles, as summaries.
 *
 * These used to be full editors sitting inside Settings — a rename field, two
 * dropdowns, a page-permission grid and a delete button, all inline. That put
 * the most consequential controls in the app (who can see what) in the same
 * visual weight as the accent picker, and forced everything to fit one row.
 *
 * They're now their own pages. Settings keeps the count and a way in, which is
 * all you need when you're here to change your password.
 */
function OrgSummaryCards() {
  const { access } = useAuth();
  const { loading, teams, roles, staff } = useOrgAdmin();

  if (!hasAdminRights(access)) return null;

  const unassigned = staff.filter((p) => !p.team).length;
  const adminRoles = roles.filter((r) => r.is_admin).length;

  return (
    <>
      <SummaryCard
        href="/settings/teams"
        icon={Users}
        title="Teams"
        description="The groups roles and people belong to."
        loading={loading}
        stats={[
          `${teams.length} ${teams.length === 1 ? "team" : "teams"}`,
          unassigned > 0
            ? `${unassigned} ${unassigned === 1 ? "person" : "people"} unassigned`
            : null,
        ]}
      />
      <SummaryCard
        href="/settings/roles"
        icon={ShieldCheck}
        title="Company roles"
        description="The job list your app reads from, and what each one can open."
        loading={loading}
        stats={[
          `${roles.length} ${roles.length === 1 ? "role" : "roles"}`,
          adminRoles > 0
            ? `${adminRoles} with full admin`
            : null,
        ]}
      />
    </>
  );
}

function SummaryCard({
  href,
  icon: Icon,
  title,
  description,
  stats,
  loading,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  stats: (string | null)[];
  loading: boolean;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="transition-colors group-hover:border-border group-hover:bg-raise">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          {/* truncate on both lines, not just min-w-0 on the wrapper. min-w-0
              lets the column shrink below its content; without truncate the
              text then overflows and runs under the stats on the right. */}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{title}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          </div>
          <span className="hidden shrink-0 items-center gap-2 text-[11.5px] text-muted-2 sm:flex">
            {loading
              ? "\u2014"
              : stats.filter(Boolean).map((sIt, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {/* Wrapped in braces so this is a JS string literal. As a bare JSX
                        text child, "\\u00b7" renders as six literal
                        characters — which is exactly what shipped. */}
                    {i > 0 && <span className="mr-2 text-muted-2">{"\u00b7"}</span>}
                    {sIt}
                  </span>
                ))}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}
