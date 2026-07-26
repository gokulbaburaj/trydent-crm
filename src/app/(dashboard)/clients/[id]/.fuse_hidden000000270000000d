"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { parseISO } from "date-fns";
import {
  Activity as ActivityIcon,
  Building2,
  CalendarDays,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  MonitorSmartphone,
  MoreHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { ClientPortalPanel } from "@/components/ClientPortalPanel";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate, initials } from "@/lib/format";
import { useCurrency } from "@/lib/currency";
import { useTabs } from "@/lib/tabs";
import type {
  Activity,
  Client,
  ClientPortal,
  CurrencyCode,
  Deal,
  PortalUpdate,
  Profile,
} from "@/lib/types";
import { CLIENT_STATUSES, LEAD_SOURCES } from "@/lib/types";

type PageTab = "overview" | "portal" | "deals" | "activity";

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { setTitle } = useTabs();
  const clientId = params.id;

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PageTab>("overview");

  const { format: formatCurrency, toBase, base } = useCurrency();
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: activities } = useSupabaseTable<Activity>("activities");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
  const { rows: portals, setRows: setPortals } = useSupabaseTable<ClientPortal>("client_portals");
  const { rows: updates, setRows: setUpdates } = useSupabaseTable<PortalUpdate>("portal_updates");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("clients").select("*").eq("id", clientId).single();
      const c = (data as Client) ?? null;
      setClient(c);
      if (c) setTitle(pathname, c.company);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const personName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? null;

  const clientDeals = useMemo(
    () => deals.filter((d) => d.client_id === clientId),
    [deals, clientId]
  );
  const clientActivities = useMemo(
    () =>
      activities
        .filter((a) => a.client_id === clientId)
        .sort((a, b) => parseISO(b.activity_date).getTime() - parseISO(a.activity_date).getTime()),
    [activities, clientId]
  );
  const portal = useMemo(
    () => portals.find((p) => p.client_id === clientId) ?? null,
    [portals, clientId]
  );

  const totalValue = clientDeals.reduce(
    (s, d) => s + toBase(Number(d.deal_value), (d.currency as CurrencyCode) ?? base),
    0
  );

  async function updateClient(patch: Partial<Client>) {
    if (!client) return;
    setClient({ ...client, ...patch });
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
  }

  async function deleteClient() {
    if (!client) return;
    if (!confirm("Delete this client? This will remove linked deals/activities.")) return;
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("clients").delete().eq("id", client.id);
    router.push("/clients");
  }

  function syncPortal(p: ClientPortal) {
    setPortals((prev) =>
      prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (!client) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Client not found.{" "}
        <Link href="/clients" className="text-primary hover:underline">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
          <Link href="/clients" className="rounded px-1 py-0.5 hover:bg-white/5 hover:text-foreground">
            Clients
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{client.company}</span>
        </div>
        <Popover
          align="right"
          trigger={
            <button className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          {(close) => (
            <MenuItem
              danger
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => {
                close();
                deleteClient();
              }}
            >
              Delete client
            </MenuItem>
          )}
        </Popover>
      </div>

      {/* Header card */}
      <Card className="rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <input
              value={client.company}
              onChange={(e) => setClient({ ...client, company: e.target.value })}
              onBlur={() => {
                const v = client.company.trim();
                if (v) updateClient({ company: v });
              }}
              className="min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-[24px] font-semibold tracking-tight text-foreground hover:border-border focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <StatusPicker
            align="right"
            value={client.status}
            options={CLIENT_STATUSES}
            onChange={(status) => updateClient({ status })}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Popover
            trigger={
              <button className="flex h-9 items-center gap-2 rounded-md border border-white/5 bg-white/5 px-2.5 text-xs font-medium text-foreground-secondary hover:bg-white/10">
                {client.account_owner ? (
                  <>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[8px] font-semibold text-primary">
                      {initials(personName(client.account_owner))}
                    </span>
                    {personName(client.account_owner)}
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3 text-muted-foreground" /> Assign owner
                  </>
                )}
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Account owner</MenuLabel>
                <MenuItem selected={!client.account_owner} onClick={() => { updateClient({ account_owner: null }); close(); }}>
                  Unassigned
                </MenuItem>
                {profiles.map((p) => (
                  <MenuItem
                    key={p.id}
                    selected={client.account_owner === p.id}
                    onClick={() => { updateClient({ account_owner: p.id }); close(); }}
                  >
                    {p.full_name}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
          {portal && (
            <span className="inline-flex items-center gap-1.5 rounded border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary">
              <MonitorSmartphone className="h-3 w-3 text-muted-foreground" /> Portal: {portal.status}
            </span>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex w-fit items-center gap-0.5 rounded-md border border-border bg-surface p-1">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={LayoutDashboard} label="Overview" />
        <TabButton active={tab === "portal"} onClick={() => setTab("portal")} icon={MonitorSmartphone} label="Portal" />
        <TabButton active={tab === "deals"} onClick={() => setTab("deals")} icon={CreditCard} label={`Deals (${clientDeals.length})`} />
        <TabButton active={tab === "activity"} onClick={() => setTab("activity")} icon={ActivityIcon} label={`Activity (${clientActivities.length})`} />
      </div>

      <div key={tab} className="animate-page">
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="rounded-xl p-5 shadow-sm lg:col-span-2">
              <h3 className="mb-4 text-sm font-semibold">Details</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Point of contact">
                  <Input
                    value={client.point_person ?? ""}
                    onChange={(e) => setClient({ ...client, point_person: e.target.value })}
                    onBlur={() => updateClient({ point_person: client.point_person || null })}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={client.email ?? ""}
                    onChange={(e) => setClient({ ...client, email: e.target.value })}
                    onBlur={() => updateClient({ email: client.email || null })}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={client.phone ?? ""}
                    onChange={(e) => setClient({ ...client, phone: e.target.value })}
                    onBlur={() => updateClient({ phone: client.phone || null })}
                  />
                </Field>
                <Field label="Lead source">
                  <Dropdown
                    value={client.lead_source ?? ""}
                    options={[
                      { value: "", label: "—" },
                      ...LEAD_SOURCES.map((s) => ({ value: s, label: s })),
                    ]}
                    onChange={(v) => updateClient({ lead_source: (v || null) as Client["lead_source"] })}
                  />
                </Field>
                <Field label="Last contact">
                  <DatePicker
                    value={client.last_contact}
                    onChange={(d) => updateClient({ last_contact: d })}
                  />
                </Field>
                <Field label="Address">
                  <Textarea
                    rows={1}
                    value={client.address ?? ""}
                    onChange={(e) => setClient({ ...client, address: e.target.value })}
                    onBlur={() => updateClient({ address: client.address || null })}
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Label>Tags</Label>
                <TagInput tags={client.tags ?? []} onChange={(tags) => updateClient({ tags })} />
              </div>
            </Card>

            <Card className="rounded-xl p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold">Summary</h3>
              <div className="flex flex-col gap-3">
                <SummaryRow icon={CreditCard} label="Deals" value={`${clientDeals.length}`} />
                <SummaryRow icon={CreditCard} label="Total value" value={formatCurrency(totalValue)} />
                <SummaryRow icon={ActivityIcon} label="Activities" value={`${clientActivities.length}`} />
                <SummaryRow icon={CalendarDays} label="Last contact" value={formatDate(client.last_contact)} />
                <SummaryRow icon={User} label="Owner" value={personName(client.account_owner) ?? "Unassigned"} />
                <SummaryRow icon={MonitorSmartphone} label="Portal" value={portal?.status ?? "Not set up"} />
              </div>
            </Card>
          </div>
        )}

        {tab === "portal" && (
          <ClientPortalPanel
            client={client}
            portal={portal}
            updates={updates}
            onPortalChange={syncPortal}
            onUpdatePosted={(u) => setUpdates((prev) => [u, ...prev])}
          />
        )}

        {tab === "deals" && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {clientDeals.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No deals linked.</p>
            )}
            {clientDeals.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle px-4 py-3 text-sm last:border-0"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{d.deal_name}</span>
                <Badge tone={statusTone(d.deal_stage)}>{d.deal_stage}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(Number(d.paid), (d.currency as CurrencyCode) ?? base)} of{" "}
                  {formatCurrency(Number(d.deal_value), (d.currency as CurrencyCode) ?? base)}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div className="flex flex-col gap-2">
            {clientActivities.length === 0 && (
              <Card className="rounded-xl shadow-sm">
                <p className="py-6 text-center text-sm text-muted-foreground">No activities linked.</p>
              </Card>
            )}
            {clientActivities.map((a) => (
              <Card key={a.id} className="rounded-xl shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">{a.description}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.activity_date)}</span>
                </div>
                {a.outcome && <p className="mt-1 text-xs text-muted-foreground">{a.outcome}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Pieces ---------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const t = draft.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-white/15 bg-transparent px-2 py-1.5 shadow-sm focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/20">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-xs text-foreground-secondary"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="rounded text-muted-foreground hover:text-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? "Type a tag, press Enter" : ""}
        className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none"
      />
    </div>
  );
}
