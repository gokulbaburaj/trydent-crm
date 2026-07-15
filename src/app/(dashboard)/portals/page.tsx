"use client";

import { useState } from "react";
import { Check, Copy, Eye, KeyRound, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/Toaster";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { ClientPortal, Client } from "@/lib/types";
import { PORTAL_STATUSES } from "@/lib/types";

const emptyForm: Partial<ClientPortal> = {
  client_id: "",
  status: "Not Started",
  notes: "",
};

export default function PortalsPage() {
  const { rows: portals, setRows } = useSupabaseTable<ClientPortal>(
    "client_portals",
    { column: "created_at", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");

  const [editing, setEditing] = useState<Partial<ClientPortal> | null>(null);
  const [saving, setSaving] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginCreated, setLoginCreated] = useState<{ username: string; password: string; reset?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "Unknown";

  /** Auto-generate a username from the client's company name. */
  function genUsername(clientId: string | undefined, withSuffix = false) {
    const base = (clients.find((c) => c.id === clientId)?.company ?? "client")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20);
    const slug = base.length >= 3 ? base : `${base}portal`;
    return withSuffix ? `${slug}${Math.floor(10 + Math.random() * 90)}` : slug;
  }

  function openEditor(p: Partial<ClientPortal>) {
    setLoginUsername(genUsername(p.client_id));
    setLoginPassword("");
    setLoginError(null);
    setLoginCreated(null);
    setCopied(false);
    setEditing(p);
  }

  async function createLogin() {
    if (!editing?.id || !editing.client_id) return;
    setLoginBusy(true);
    setLoginError(null);
    const res = await fetch("/api/portal-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsername,
        password: loginPassword,
        client_id: editing.client_id,
        portal_id: editing.id,
        full_name: clientName(editing.client_id),
      }),
    });
    const json = await res.json();
    setLoginBusy(false);
    if (!res.ok) {
      setLoginError(json.error ?? "Something went wrong.");
      // Username collision — generate a fresh one with a numeric suffix for the next try.
      if (String(json.error ?? "").includes("taken")) {
        setLoginUsername(genUsername(editing.client_id, true));
      }
      return;
    }
    setLoginCreated({ username: json.username, password: loginPassword, reset: json.reset });
    setEditing((prev) => (prev ? { ...prev, portal_username: json.username } : prev));
    setRows((prev) =>
      prev.map((p) => (p.id === editing.id ? { ...p, portal_username: json.username } : p))
    );
  }

  function copyCredentials() {
    if (!loginCreated) return;
    navigator.clipboard.writeText(
      `Trydent Labs Client Portal\nURL: ${window.location.origin}/login\nUsername: ${loginCreated.username}\nPassword: ${loginCreated.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const columns: Column<ClientPortal>[] = [
    { header: "Client", render: (p) => <span className="font-medium">{clientName(p.client_id)}</span> },
    {
      header: "Status",
      render: (p) => (
        <Badge tone={statusTone(p.status)} dot>
          {p.status}
        </Badge>
      ),
    },
    {
      header: "Login",
      render: (p) =>
        p.portal_username ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground-secondary">
            <KeyRound className="h-3 w-3 text-muted" />
            {p.portal_username}
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      header: "Last opened",
      render: (p) =>
        p.last_opened_at ? (
          <span className="text-xs text-success">{formatDate(p.last_opened_at)}</span>
        ) : (
          <span className="text-xs text-muted">Never</span>
        ),
    },
    { header: "Notes", render: (p) => p.notes || "—" },
    { header: "Updated", render: (p) => formatDate(p.updated_at) },
  ];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    if (editing.id) {
      const { data, error } = await supabase
        .from("client_portals")
        .update(editing)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) setRows((prev) => prev.map((p) => (p.id === data.id ? (data as ClientPortal) : p)));
    } else {
      const { data, error } = await supabase.from("client_portals").insert(editing).select().single();
      if (!error && data) setRows((prev) => [data as ClientPortal, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this portal?")) return;
    await supabase.from("client_portals").delete().eq("id", id);
    setRows((prev) => prev.filter((p) => p.id !== id));
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => openEditor({ ...emptyForm, client_id: clients[0]?.id ?? "" })}>
          <Plus className="h-4 w-4" /> New Portal
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={portals}
        rowKey={(p) => p.id}
        onRowClick={openEditor}
        emptyMessage="No client portals yet."
      />

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Portal" : "New Portal"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
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
              <Label>Status</Label>
              <Select
                value={editing.status ?? "Not Started"}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as ClientPortal["status"] })}
              >
                {PORTAL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </div>
            {editing.id && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/portal?client=${editing.client_id}`}
                  target="_blank"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-white/5 px-3 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <Eye className="h-3.5 w-3.5" /> Preview portal
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/login`);
                    toast.success("Client login link copied");
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" /> Copy client link
                </Button>
              </div>
            )}

            {editing.id && (
              <div className="flex flex-col gap-3 rounded border border-border bg-white/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-muted" />
                  <span className="text-[13px] font-medium">Portal login</span>
                  {editing.last_opened_at && (
                    <span className="ml-auto text-[11px] text-success">
                      Opened {formatDate(editing.last_opened_at)}
                    </span>
                  )}
                </div>

                {editing.portal_username && !loginCreated && (
                  <p className="text-xs text-muted">
                    This client signs in with username{" "}
                    <span className="rounded bg-white/5 px-1 py-0.5 font-medium text-foreground-secondary">
                      {editing.portal_username}
                    </span>
                  </p>
                )}

                {loginCreated ? (
                  <div className="flex flex-col gap-2 rounded border border-success/30 bg-success/10 p-3">
                    <p className="text-xs font-medium text-success">
                      {loginCreated.reset
                        ? "Password reset — share the new credentials with your client."
                        : "Login created — share these with your client."}{" "}
                      The password won&apos;t be shown again.
                    </p>
                    <p className="text-xs text-foreground-secondary">
                      Username: <span className="font-medium text-foreground">{loginCreated.username}</span>
                      <br />
                      Password: <span className="font-medium text-foreground">{loginCreated.password}</span>
                    </p>
                    <Button type="button" size="sm" variant="secondary" onClick={copyCredentials}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy credentials"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Username (auto-generated)</Label>
                        <div className="flex h-[38px] items-center rounded border border-border bg-white/[0.03] px-3 text-sm text-foreground-secondary">
                          {loginUsername}
                        </div>
                      </div>
                      <div>
                        <Label>Set a password</Label>
                        <Input
                          type="text"
                          placeholder="Min 8 characters"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                        />
                      </div>
                    </div>
                    {loginError && <p className="text-xs text-danger">{loginError}</p>}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={loginBusy || !loginUsername || loginPassword.length < 8}
                      onClick={createLogin}
                    >
                      {loginBusy
                        ? "Working..."
                        : editing.portal_username
                          ? "Reset password / new login"
                          : "Create login"}
                    </Button>
                  </>
                )}
              </div>
            )}

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
