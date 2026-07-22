"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { FilterBar } from "@/components/FilterBar";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { Grid } from "@/components/charts/grid";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { Card } from "@/components/ui/Card";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { applyFilters, useStoredFilters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { CURRENCIES, useCurrency } from "@/lib/currency";
import type { Deal, Client, Profile } from "@/lib/types";
import { DEAL_STAGES } from "@/lib/types";

const emptyForm: Partial<Deal> = {
  deal_name: "",
  client_id: "",
  deal_stage: "Lead",
  deal_value: 0,
  paid: 0,
  close_date: null,
};

export default function PipelinePage() {
  const { rows: deals, setRows } = useSupabaseTable<Deal>(
    "deals",
    { column: "created_at", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [selected, setSelected] = useState<Deal | null>(null);
  const [editing, setEditing] = useState<Partial<Deal> | null>(null);
  const [saving, setSaving] = useState(false);
  const { currency, setCurrency, base, format: formatCurrency } = useCurrency();

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "Unknown";
  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const { filters, views, setFilters, setViews } = useStoredFilters("pipeline");

  /**
   * Deals sitting in each stage right now — exactly what the board shows.
   * We deliberately do NOT infer a funnel: without stage history there's no
   * way to know a deal ever passed through the stages it skipped, so any
   * "reached this stage" number would be a guess that contradicts the board.
   */
  const stageBars = useMemo(
    () =>
      DEAL_STAGES.map((stage) => {
        const inStage = deals.filter((d) => d.deal_stage === stage);
        return {
          stage,
          deals: inStage.length,
          value: inStage.reduce((sum, d) => sum + Number(d.deal_value), 0),
        };
      }),
    [deals]
  );

  const visibleDeals = useMemo(
    () =>
      applyFilters(deals, filters, {
        text: (d) => [
          d.deal_name,
          clients.find((c) => c.id === d.client_id)?.company,
        ],
        status: (d) => d.deal_stage,
        assignee: (d) => d.account_owner,
        due: (d) => d.close_date,
      }),
    [deals, filters, clients]
  );

  async function handleStageMove(deal: Deal, stage: string) {
    setRows((prev) => prev.map((d) => (d.id === deal.id ? { ...d, deal_stage: stage as Deal["deal_stage"] } : d)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("deals").update({ deal_stage: stage }).eq("id", deal.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    const payload = {
      ...editing,
      deal_value: Number(editing.deal_value) || 0,
      paid: Number(editing.paid) || 0,
    };

    if (editing.id) {
      const { data, error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setRows((prev) => prev.map((d) => (d.id === data.id ? (data as Deal) : d)));
        if (selected?.id === data.id) setSelected(data as Deal);
      }
    } else {
      const { data, error } = await supabase.from("deals").insert(payload).select().single();
      if (!error && data) setRows((prev) => [data as Deal, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this deal?")) return;
    await supabase.from("deals").delete().eq("id", id);
    setRows((prev) => prev.filter((d) => d.id !== id));
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-muted-foreground">
          {visibleDeals.length !== deals.length
            ? `${visibleDeals.length} of ${deals.length} deals shown`
            : `${deals.length} deal${deals.length !== 1 ? "s" : ""} in pipeline`}
        </h2>
        <div className="flex items-center gap-2">
          <Popover
            align="right"
            trigger={
              <button className="flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground-secondary hover:bg-white/5 hover:text-foreground">
                {CURRENCIES.find((c) => c.code === currency)?.symbol} {currency}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Display currency</MenuLabel>
                {CURRENCIES.map((c) => (
                  <MenuItem
                    key={c.code}
                    selected={c.code === currency}
                    icon={<span className="text-[11px] text-muted-foreground">{c.symbol}</span>}
                    onClick={() => {
                      setCurrency(c.code);
                      close();
                    }}
                  >
                    {c.label}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
          <Button
            size="sm"
            onClick={() => setEditing({ ...emptyForm, client_id: clients[0]?.id ?? "" })}
          >
            <Plus className="h-4 w-4" /> New Deal
          </Button>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        views={views}
        onViewsChange={setViews}
        statuses={DEAL_STAGES}
        statusLabel="Stage"
        assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
        showDue
        dueLabel="Close date"
        placeholder="Filter deals…"
      />

      {deals.length > 0 && (
        <Card className="rounded-xl shadow-sm">
          <h3 className="mb-1 text-sm font-semibold">Deals by stage</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            How many deals sit in each stage right now, and what they&apos;re worth.
          </p>
          <BarChart
            data={stageBars}
            xDataKey="stage"
            aspectRatio="7 / 2"
            barGap={0.3}
            margin={{ top: 24, right: 16, bottom: 36, left: 16 }}
          >
            <Grid horizontal vertical={false} />
            <Bar dataKey="deals" fill="var(--primary)" />
            <BarXAxis showAllLabels />
            <ChartTooltip
              content={({ point }) => (
                <div>
                  <p className="text-[11px] text-muted-foreground">{String(point.stage)}</p>
                  <p className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                    {Number(point.deals)} deal{Number(point.deals) === 1 ? "" : "s"}
                  </p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {formatCurrency(Number(point.value))}
                  </p>
                </div>
              )}
            />
          </BarChart>
        </Card>
      )}

      <KanbanBoard
        columns={DEAL_STAGES.map((s) => ({ id: s, label: s }))}
        items={visibleDeals}
        getColumnId={(d) => d.deal_stage}
        onMove={handleStageMove}
        columnMeta={(_, items) =>
          items.length > 0 ? (
            <span className="text-xs font-medium tabular-nums text-success">
              {formatCurrency(items.reduce((sum, d) => sum + Number(d.deal_value), 0))}
            </span>
          ) : null
        }
        renderCard={(d) => (
          <div onClick={() => setSelected(d)}>
            <p className="text-sm font-medium">{d.deal_name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{clientName(d.client_id)}</p>
            <p className="mt-2 text-sm font-semibold text-primary">
              {formatCurrency(Number(d.deal_value))}
            </p>
          </div>
        )}
      />

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.deal_name ?? ""}>
        {selected && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <Badge tone={statusTone(selected.deal_stage)} dot>
                {selected.deal_stage}
              </Badge>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(selected)}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(selected.id)}>
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Client" value={clientName(selected.client_id)} />
              <Info label="Owner" value={ownerName(selected.account_owner)} />
              <Info label="Deal Value" value={formatCurrency(Number(selected.deal_value))} />
              <Info label="Paid" value={formatCurrency(Number(selected.paid))} />
              <Info
                label="Remaining"
                value={formatCurrency(Number(selected.deal_value) - Number(selected.paid))}
              />
              <Info label="Close Date" value={formatDate(selected.close_date)} />
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Deal" : "New Deal"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Deal Name</Label>
              <Input
                required
                value={editing.deal_name ?? ""}
                onChange={(e) => setEditing({ ...editing, deal_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Client</Label>
              <Dropdown
                value={editing.client_id ?? ""}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.company }))}
                onChange={(v) => setEditing({ ...editing, client_id: v })}
              />
            </div>
            <div>
              <Label>Stage</Label>
              <Dropdown
                value={editing.deal_stage ?? "Lead"}
                options={DEAL_STAGES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setEditing({ ...editing, deal_stage: v as Deal["deal_stage"] })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Deal Value ({base})</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.deal_value ?? 0}
                  onChange={(e) => setEditing({ ...editing, deal_value: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Paid ({base})</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.paid ?? 0}
                  onChange={(e) => setEditing({ ...editing, paid: Number(e.target.value) })}
                />
              </div>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Amounts are stored in {base}, the base currency set in Settings.
            </p>
            <div>
              <Label>Close Date</Label>
              <DatePicker
                value={editing.close_date}
                onChange={(d) => setEditing({ ...editing, close_date: d })}
              />
            </div>
            <div>
              <Label>Owner</Label>
              <Dropdown
                value={editing.account_owner ?? ""}
                options={[
                  { value: "", label: "Unassigned" },
                  ...profiles.map((p) => ({ value: p.id, label: p.full_name })),
                ]}
                onChange={(v) => setEditing({ ...editing, account_owner: v || null })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
