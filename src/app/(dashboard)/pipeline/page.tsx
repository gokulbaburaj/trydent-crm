"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
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
  const { currency, setCurrency, format: formatCurrency } = useCurrency();

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "Unknown";
  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

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
        <h2 className="text-sm text-muted">
          {deals.length} deal{deals.length !== 1 ? "s" : ""} in pipeline
        </h2>
        <div className="flex items-center gap-2">
          <Popover
            align="right"
            trigger={
              <button className="flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground-secondary hover:bg-white/5 hover:text-foreground">
                {CURRENCIES.find((c) => c.code === currency)?.symbol} {currency}
                <ChevronDown className="h-3 w-3 text-muted" />
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
                    icon={<span className="text-[11px] text-muted">{c.symbol}</span>}
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

      <KanbanBoard
        columns={DEAL_STAGES.map((s) => ({ id: s, label: s }))}
        items={deals}
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
            <p className="mt-0.5 text-xs text-muted">{clientName(d.client_id)}</p>
            <p className="mt-2 text-sm font-semibold text-accent">
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
              <Select
                required
                value={editing.client_id ?? ""}
                onChange={(e) => setEditing({ ...editing, client_id: e.target.value })}
              >
                <option value="" disabled>Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Stage</Label>
              <Select
                value={editing.deal_stage ?? "Lead"}
                onChange={(e) => setEditing({ ...editing, deal_stage: e.target.value as Deal["deal_stage"] })}
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Deal Value</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.deal_value ?? 0}
                  onChange={(e) => setEditing({ ...editing, deal_value: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Paid</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.paid ?? 0}
                  onChange={(e) => setEditing({ ...editing, paid: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Close Date</Label>
              <DatePicker
                value={editing.close_date}
                onChange={(d) => setEditing({ ...editing, close_date: d })}
              />
            </div>
            <div>
              <Label>Owner</Label>
              <Select
                value={editing.account_owner ?? ""}
                onChange={(e) => setEditing({ ...editing, account_owner: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
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
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
