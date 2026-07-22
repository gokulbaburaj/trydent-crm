"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Eye, KeyRound, Link2, Megaphone, MonitorSmartphone } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/Button";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import type { Client, ClientPortal, PortalUpdate } from "@/lib/types";
import { PORTAL_STATUSES } from "@/lib/types";

/**
 * Portal management for a single client: status, login provisioning + reset,
 * updates feed, preview, notes. Used on the client detail page's Portal tab.
 */
export function ClientPortalPanel({
  client,
  portal,
  updates,
  onPortalChange,
  onUpdatePosted,
}: {
  client: Client;
  portal: ClientPortal | null;
  updates: PortalUpdate[];
  onPortalChange: (portal: ClientPortal) => void;
  onUpdatePosted: (update: PortalUpdate) => void;
}) {
  const { profile } = useAuth();

  const [notes, setNotes] = useState("");
  const [updateDraft, setUpdateDraft] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginCreated, setLoginCreated] = useState<{ username: string; password: string; reset?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const genUsername = useMemo(
    () => (withSuffix = false) => {
      const base = (client.company ?? "client")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 20);
      const slug = base.length >= 3 ? base : `${base}portal`;
      return withSuffix ? `${slug}${Math.floor(10 + Math.random() * 90)}` : slug;
    },
    [client]
  );

  const clientId = client.id;
  useEffect(() => {
    queueMicrotask(() => {
      setNotes(portal?.notes ?? "");
      setUpdateDraft("");
      setLoginUsername(genUsername());
      setLoginPassword("");
      setLoginError(null);
      setLoginCreated(null);
      setCopied(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const clientUpdates = useMemo(
    () => updates.filter((u) => u.client_id === client.id),
    [updates, client]
  );

  async function setupPortal() {
    setPortalBusy(true);
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("client_portals")
      .insert({ client_id: client.id, status: "Not Started" })
      .select()
      .single();
    setPortalBusy(false);
    if (error) {
      toast.error(`Couldn't set up portal: ${error.message}`);
      return;
    }
    onPortalChange(data as ClientPortal);
    toast.success("Portal created");
  }

  async function updatePortal(patch: Partial<ClientPortal>) {
    if (!portal) return;
    onPortalChange({ ...portal, ...patch });
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("client_portals").update(patch).eq("id", portal.id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
  }

  async function createLogin() {
    if (!portal?.id) return;
    setLoginBusy(true);
    setLoginError(null);
    const res = await fetch("/api/portal-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsername,
        password: loginPassword,
        client_id: client.id,
        portal_id: portal.id,
        full_name: client.company,
      }),
    });
    const json = await res.json();
    setLoginBusy(false);
    if (!res.ok) {
      setLoginError(json.error ?? "Something went wrong.");
      if (String(json.error ?? "").includes("taken")) setLoginUsername(genUsername(true));
      return;
    }
    setLoginCreated({ username: json.username, password: loginPassword, reset: json.reset });
    onPortalChange({ ...portal, portal_username: json.username });
  }

  async function postUpdate() {
    if (!profile) return;
    const body = updateDraft.trim();
    if (!body) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("portal_updates")
      .insert({ client_id: client.id, author_id: profile.id, body })
      .select()
      .single();
    if (error) {
      toast.error(`Couldn't post: ${error.message}`);
      return;
    }
    onUpdatePosted(data as PortalUpdate);
    setUpdateDraft("");
    toast.success("Update posted to the client portal");
  }

  function copyCredentials() {
    if (!loginCreated) return;
    navigator.clipboard.writeText(
      `Trydent Labs Client Portal\nURL: ${window.location.origin}/login\nUsername: ${loginCreated.username}\nPassword: ${loginCreated.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!portal) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Client Portal</span>
        </div>
        <p className="text-sm text-muted-foreground">
          No portal yet. Set one up to give {client.company} a login, share updates, and track
          progress.
        </p>
        <Button size="sm" variant="secondary" disabled={portalBusy} onClick={setupPortal}>
          <MonitorSmartphone className="h-3.5 w-3.5" />
          {portalBusy ? "Setting up..." : "Set up portal"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Portal status</span>
        </div>
        <StatusPicker
          align="right"
          value={portal.status}
          options={PORTAL_STATUSES}
          label="Portal status"
          onChange={(status) => updatePortal({ status })}
        />
      </div>

      {/* Preview + link */}
      <div className="flex items-center gap-2">
        <Link
          href={`/portal?client=${client.id}`}
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

      {/* Login provisioning */}
      <div className="flex flex-col gap-3 rounded border border-border bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">Portal login</span>
          {portal.last_opened_at && (
            <span className="ml-auto text-[11px] text-success">
              Opened {formatDate(portal.last_opened_at)}
            </span>
          )}
        </div>

        {portal.portal_username && !loginCreated && (
          <p className="text-xs text-muted-foreground">
            Signs in with username{" "}
            <span className="rounded bg-white/5 px-1 py-0.5 font-medium text-foreground-secondary">
              {portal.portal_username}
            </span>{" "}
            — passwords aren&apos;t stored; use Reset to issue a new one anytime.
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
                <div className="flex h-9 items-center rounded-md border border-white/15 bg-white/[0.03] px-3 text-sm text-foreground-secondary">
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
                : portal.portal_username
                  ? "Reset password / new login"
                  : "Create login"}
            </Button>
          </>
        )}
      </div>

      {/* Updates */}
      <div className="flex flex-col gap-2 rounded border border-border bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">Portal updates</span>
        </div>
        <Textarea
          rows={2}
          placeholder="Post an update your client will see on their portal..."
          value={updateDraft}
          onChange={(e) => setUpdateDraft(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!updateDraft.trim()}
          onClick={postUpdate}
        >
          Post update
        </Button>
        {clientUpdates.slice(0, 5).map((u) => (
          <div key={u.id} className="rounded-md border border-border-subtle px-2.5 py-2">
            <p className="text-[13px] leading-snug">{u.body}</p>
            <p className="mt-1 text-[11px] text-muted-2">
              {formatDistanceToNow(parseISO(u.created_at), { addSuffix: true })}
            </p>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div>
        <Label>Portal notes</Label>
        <Textarea
          rows={2}
          placeholder="Internal notes about this portal..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (portal.notes ?? "")) updatePortal({ notes });
          }}
        />
      </div>
    </div>
  );
}
