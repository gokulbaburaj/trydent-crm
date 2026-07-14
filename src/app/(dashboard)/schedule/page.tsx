"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, List, Plus, User } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/utils";
import type { Activity, Client, Deal, Profile } from "@/lib/types";

type Tab = "all" | "mine" | "calendar";

const emptyForm: Partial<Activity> = {
  description: "",
  outcome: "",
  location: "",
  follow_up_required: false,
  client_id: null,
  deal_id: null,
  assigned_to: null,
  activity_date: new Date().toISOString().slice(0, 16),
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function SchedulePage() {
  const { profile } = useAuth();
  const { rows: activities, setRows } = useSupabaseTable<Activity>(
    "activities",
    { column: "activity_date", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.company ?? "—";
  const assigneeName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const filtered = useMemo(
    () => (tab === "mine" && profile ? activities.filter((a) => a.assigned_to === profile.id) : activities),
    [activities, tab, profile]
  );

  const columns: Column<Activity>[] = [
    { header: "Description", render: (a) => <span className="font-medium">{a.description}</span> },
    { header: "Client", render: (a) => clientName(a.client_id) },
    { header: "Assigned To", render: (a) => assigneeName(a.assigned_to) },
    { header: "Date", render: (a) => formatDate(a.activity_date) },
    {
      header: "Follow-up",
      render: (a) =>
        a.follow_up_required ? (
          <Badge tone="yellow" dot>Required</Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    if (editing.id) {
      const { data, error } = await supabase
        .from("activities")
        .update(editing)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) setRows((prev) => prev.map((a) => (a.id === data.id ? (data as Activity) : a)));
    } else {
      const { data, error } = await supabase.from("activities").insert(editing).select().single();
      if (!error && data) setRows((prev) => [data as Activity, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this schedule item?")) return;
    await supabase.from("activities").delete().eq("id", id);
    setRows((prev) => prev.filter((a) => a.id !== id));
    setEditing(null);
  }

  const monthGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const key = format(parseISO(a.activity_date), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [activities]);

  const dayEvents = (day: Date) => eventsByDay.get(format(day, "yyyy-MM-dd")) ?? [];

  const upcomingOrSelected = useMemo(() => {
    if (selectedDay) return dayEvents(selectedDay);
    const now = new Date();
    return activities
      .filter((a) => parseISO(a.activity_date) >= now)
      .sort((a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime())
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, activities, eventsByDay]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
          <TabButton active={tab === "all"} onClick={() => setTab("all")} icon={List} label="All" />
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")} icon={User} label="Mine" />
          <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={Calendar} label="Calendar" />
        </div>
        <Button size="sm" onClick={() => setEditing({ ...emptyForm })}>
          <Plus className="h-4 w-4" /> New Schedule Item
        </Button>
      </div>

      {tab !== "calendar" ? (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(a) => a.id}
          onRowClick={setEditing}
          emptyMessage="No schedule items yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setMonth((m) => subMonths(m, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold">{format(month, "MMMM yyyy")}</h3>
              <Button size="sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid.map((day) => {
                const inMonth = isSameMonth(day, month);
                const hasEvents = dayEvents(day).length > 0;
                const selected = !!selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() =>
                      setSelectedDay(selectedDay && isSameDay(day, selectedDay) ? null : day)
                    }
                    className={dayCellClass(inMonth, isToday(day), selected)}
                  >
                    <span className="relative">
                      {format(day, "d")}
                      {hasEvents && (
                        <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-muted">
              {selectedDay ? format(selectedDay, "MMMM d, yyyy") : "Upcoming"}
            </h3>
            <div className="flex flex-col divide-y divide-border">
              {upcomingOrSelected.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">No events.</p>
              )}
              {upcomingOrSelected.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setEditing(a)}
                  className="flex items-center gap-3 py-3 text-left hover:bg-surface-hover"
                >
                  <div className="flex w-11 shrink-0 flex-col items-center rounded bg-surface-raised py-1.5">
                    <span className="text-sm font-bold">{format(parseISO(a.activity_date), "d")}</span>
                    <span className="text-[10px] uppercase text-muted">
                      {format(parseISO(a.activity_date), "EEE")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.description}</p>
                    <p className="truncate text-xs text-muted">{clientName(a.client_id)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {format(parseISO(a.activity_date), "h:mm a")}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Schedule Item" : "New Schedule Item"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Description</Label>
              <Textarea
                required
                rows={2}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Outcome</Label>
              <Input
                value={editing.outcome ?? ""}
                onChange={(e) => setEditing({ ...editing, outcome: e.target.value })}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={editing.location ?? ""}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
            </div>
            <div>
              <Label>Client</Label>
              <Select
                value={editing.client_id ?? ""}
                onChange={(e) => setEditing({ ...editing, client_id: e.target.value || null })}
              >
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Deal</Label>
              <Select
                value={editing.deal_id ?? ""}
                onChange={(e) => setEditing({ ...editing, deal_id: e.target.value || null })}
              >
                <option value="">—</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.deal_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select
                value={editing.assigned_to ?? ""}
                onChange={(e) => setEditing({ ...editing, assigned_to: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="datetime-local"
                value={
                  editing.activity_date
                    ? new Date(editing.activity_date).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) => setEditing({ ...editing, activity_date: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.follow_up_required}
                onChange={(e) => setEditing({ ...editing, follow_up_required: e.target.checked })}
                className="h-4 w-4 rounded accent-accent"
              />
              Follow-up required
            </label>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save"}
              </Button>
              {editing.id && (
                <Button type="button" variant="danger" onClick={() => handleDelete(editing.id as string)}>
                  Delete
                </Button>
              )}
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
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
        active ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground-secondary"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function dayCellClass(inMonth: boolean, today: boolean, selected: boolean) {
  const base = "flex h-10 items-center justify-center rounded text-sm transition-colors";
  if (selected) return `${base} bg-accent text-accent-foreground font-semibold`;
  if (today) return `${base} border border-accent text-accent font-semibold`;
  if (!inMonth) return `${base} text-muted/40 hover:bg-surface-hover`;
  return `${base} text-foreground hover:bg-surface-hover`;
}
