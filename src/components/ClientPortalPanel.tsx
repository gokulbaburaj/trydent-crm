"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Paperclip,
  Eye,
  FolderOpen,
  KeyRound,
  Link2,
  Megaphone,
  MessageSquare,
  MonitorSmartphone,
  Plus,
  Receipt,
  Send,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/Button";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/Badge";
import { CURRENCIES, formatMoney, useBaseCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  MAX_FILE_BYTES,
  formatBytes,
  openStoredFile,
  removeStoredFile,
  uploadClientFile,
} from "@/lib/storage";
import { generatePassword } from "@/lib/password";
import type {
  Client,
  ClientDocument,
  ClientPortal,
  CurrencyCode,
  DocumentCategory,
  Invoice,
  InvoiceStatus,
  MeetingRequest,
  PortalMessage,
  PortalUpdate,
} from "@/lib/types";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_TONES,
  PORTAL_STATUSES,
  effectiveInvoiceStatus,
} from "@/lib/types";

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
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [msgDraft, setMsgDraft] = useState("");
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [docOpen, setDocOpen] = useState(false);
  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docCategory, setDocCategory] = useState<DocumentCategory>("proposal");
  const [docBusy, setDocBusy] = useState(false);
  const baseCurrency = useBaseCurrency();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [invNumber, setInvNumber] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invCurrency, setInvCurrency] = useState<CurrencyCode>(baseCurrency);
  const [invIssue, setInvIssue] = useState<string | null>(null);
  const [invDue, setInvDue] = useState<string | null>(null);
  const [invUrl, setInvUrl] = useState("");
  const [invFile, setInvFile] = useState<File | null>(null);
  const [invBusy, setInvBusy] = useState(false);
  const [requests, setRequests] = useState<MeetingRequest[]>([]);

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
      setMsgDraft("");
      setMessages([]);
      setDocuments([]);
      setDocOpen(false);
      setDocName("");
      setDocUrl("");
      setDocCategory("proposal");
      setInvoices([]);
      setInvOpen(false);
      setInvNumber("");
      setInvAmount("");
      setInvIssue(null);
      setInvDue(null);
      setInvUrl("");
      setRequests([]);
    });
    async function loadPanelData() {
      const supabase = createClient();
      if (!supabase) return;
      const [msgRes, docRes, invRes, reqRes] = await Promise.all([
        supabase
          .from("portal_messages")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true }),
        supabase
          .from("client_documents")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("invoices")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("meeting_requests")
          .select("*")
          .eq("client_id", clientId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);
      setMessages((msgRes.data as PortalMessage[]) ?? []);
      setDocuments((docRes.data as ClientDocument[]) ?? []);
      setInvoices((invRes.data as Invoice[]) ?? []);
      setRequests((reqRes.data as MeetingRequest[]) ?? []);
    }
    loadPanelData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const clientUpdates = useMemo(
    () => updates.filter((u) => u.client_id === client.id),
    [updates, client]
  );

  /** Documents in a stable category order, empty categories omitted. */
  const groupedDocs = useMemo(
    () =>
      DOCUMENT_CATEGORIES.map((c) => ({
        category: c,
        items: documents.filter((d) => d.category === c),
      })).filter((g) => g.items.length > 0),
    [documents]
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

  async function sendMessage() {
    if (!profile) return;
    const body = msgDraft.trim();
    if (!body) return;
    setMsgDraft("");
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("portal_messages")
      .insert({ client_id: client.id, author_id: profile.id, body })
      .select()
      .single();
    if (error) {
      toast.error(`Couldn't send: ${error.message}`);
      return;
    }
    setMessages((prev) => [...prev, data as PortalMessage]);
  }

  /**
   * Adds a document, either as an uploaded file or a link.
   *
   * A link is still allowed — sometimes the thing genuinely lives in a shared
   * Drive and copying it here would just make a second stale version. But
   * upload is now the default, because a link is only as durable as somebody
   * else's sharing settings.
   */
  async function addDocument() {
    const name = docName.trim() || docFile?.name.trim() || "";
    if (!name || !profile) return;
    if (!docFile && !docUrl.trim()) return;

    setDocBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setDocBusy(false);
      return;
    }

    let storage_path: string | null = null;
    let url: string | null = null;

    if (docFile) {
      try {
        const up = await uploadClientFile(client.id, docFile);
        storage_path = up.path;
      } catch (err) {
        setDocBusy(false);
        toast.error(err instanceof Error ? err.message : "Upload failed.");
        return;
      }
    } else {
      url = docUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    }

    const { data, error } = await supabase
      .from("client_documents")
      .insert({
        client_id: client.id,
        name,
        url,
        storage_path,
        category: docCategory,
        added_by: profile.id,
      })
      .select()
      .single();
    setDocBusy(false);
    if (error) {
      // The row failed but the object landed — clean up rather than leave a
      // file nothing points at.
      await removeStoredFile(storage_path);
      toast.error(`Couldn't add: ${error.message}`);
      return;
    }
    setDocuments((prev) => [data as ClientDocument, ...prev]);
    setDocName("");
    setDocUrl("");
    setDocFile(null);
    setDocOpen(false);
    toast.success("Document added to the client portal");
  }

  async function openDocument(d: ClientDocument) {
    if (d.storage_path) {
      const ok = await openStoredFile(d.storage_path);
      if (!ok) toast.error("Couldn't open that file. It may have been removed.");
      return;
    }
    if (d.url) window.open(d.url, "_blank", "noopener,noreferrer");
  }

  async function deleteDocument(id: string) {
    const doc = documents.find((d) => d.id === id) ?? null;
    const before = documents;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("client_documents").delete().eq("id", id);
    if (error) {
      setDocuments(before);
      toast.error(`Couldn't delete: ${error.message}`);
      return;
    }
    await removeStoredFile(doc?.storage_path);
  }

  async function openInvoice(inv: Invoice) {
    if (inv.storage_path) {
      const ok = await openStoredFile(inv.storage_path);
      if (!ok) toast.error("Couldn't open that file. It may have been removed.");
      return;
    }
    if (inv.document_url) window.open(inv.document_url, "_blank", "noopener,noreferrer");
  }

  async function addInvoice() {
    const number = invNumber.trim();
    const amount = Number(invAmount);
    if (!number || !profile || Number.isNaN(amount)) return;
    let url = invUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    setInvBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setInvBusy(false);
      return;
    }

    let storage_path: string | null = null;
    if (invFile) {
      try {
        const up = await uploadClientFile(client.id, invFile);
        storage_path = up.path;
      } catch (err) {
        setInvBusy(false);
        toast.error(err instanceof Error ? err.message : "Upload failed.");
        return;
      }
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        client_id: client.id,
        number,
        amount,
        currency: invCurrency,
        status: "draft",
        issue_date: invIssue,
        due_date: invDue,
        document_url: url || null,
        storage_path,
        created_by: profile.id,
      })
      .select()
      .single();
    setInvBusy(false);
    if (error) {
      await removeStoredFile(storage_path);
      toast.error(`Couldn't add: ${error.message}`);
      return;
    }
    setInvoices((prev) => [data as Invoice, ...prev]);
    setInvNumber("");
    setInvAmount("");
    setInvFile(null);
    setInvIssue(null);
    setInvDue(null);
    setInvUrl("");
    setInvOpen(false);
    toast.success("Invoice created as a draft — mark it Sent to show the client");
  }

  async function updateInvoice(id: string, patch: Partial<Invoice>) {
    const before = invoices;
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) {
      setInvoices(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function deleteInvoice(id: string) {
    const inv = invoices.find((i) => i.id === id) ?? null;
    const before = invoices;
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      setInvoices(before);
      toast.error(`Couldn't delete: ${error.message}`);
      return;
    }
    await removeStoredFile(inv?.storage_path);
  }

  /** Resolving a request only clears it from the queue — scheduling the actual
   *  meeting happens on the Schedule page, where the full form lives. */
  async function resolveRequest(id: string, status: "scheduled" | "declined") {
    const before = requests;
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("meeting_requests").update({ status }).eq("id", id);
    if (error) {
      setRequests(before);
      toast.error(`Couldn't update: ${error.message}`);
      return;
    }
    toast.success(status === "scheduled" ? "Marked as scheduled" : "Request declined");
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
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-hover px-3 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:bg-active hover:text-foreground"
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
      <div className="flex flex-col gap-3 rounded-md border border-border bg-raise p-3">
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
            <span className="rounded-md bg-hover px-1 py-0.5 font-medium text-foreground-secondary">
              {portal.portal_username}
            </span>{" "}
            — passwords aren&apos;t stored; use Reset to issue a new one anytime.
          </p>
        )}

        {loginCreated ? (
          <div className="flex flex-col gap-2 rounded-md border border-success/30 bg-success/10 p-3">
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
                <div className="flex h-9 items-center rounded-md border border-edge bg-surface-fill px-3 text-sm text-foreground-secondary">
                  {loginUsername}
                </div>
              </div>
              <div>
                <Label>Set a password</Label>
                {/* Generate rather than invent one. This gets read out over a
                    call or pasted into an email, and it's the only credential
                    protecting a client's whole account. */}
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Min 8 characters"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setLoginPassword(generatePassword())}
                  >
                    Generate
                  </Button>
                </div>
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
      <div className="flex flex-col gap-2 rounded-md border border-border bg-raise p-3">
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

      {/* Messages */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-raise p-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">Messages</span>
          <span className="text-[11px] text-muted-foreground">
            direct thread with {client.company}
          </span>
        </div>
        <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {messages.length === 0 && (
            <p className="py-3 text-center text-[12px] text-muted-foreground">
              No messages yet. Anything you send here appears on the client&apos;s portal.
            </p>
          )}
          {messages.map((m) => {
            const mine = m.author_id === profile?.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-lg px-2.5 py-1.5",
                  mine
                    ? "self-end bg-primary/15 text-foreground"
                    : "self-start border border-border-subtle bg-surface-fill"
                )}
              >
                <p className="text-[13px] leading-snug">{m.body}</p>
                <p className="mt-0.5 text-[10px] text-muted-2">
                  {mine ? "You" : client.company} ·{" "}
                  {formatDistanceToNow(parseISO(m.created_at), { addSuffix: true })}
                </p>
              </div>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-2"
        >
          <Input
            placeholder="Reply to the client..."
            value={msgDraft}
            onChange={(e) => setMsgDraft(e.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!msgDraft.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      {/* Call requests */}
      {requests.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-warning" />
            <span className="text-[13px] font-medium">Call requests</span>
            <span className="ml-auto rounded-full bg-warning/15 px-1.5 py-px text-[11px] font-medium text-warning">
              {requests.length}
            </span>
          </div>
          {requests.map((r) => (
            <div key={r.id} className="rounded-md border border-border-subtle bg-surface p-2.5">
              <p className="text-[13px] font-medium">{r.topic}</p>
              <p className="mt-0.5 text-[11px] text-muted-2">
                {r.preferred_date ? `Prefers ${formatDate(r.preferred_date)}` : "No date preference"}
                {" · "}
                {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
              </p>
              {r.note && (
                <p className="mt-1.5 text-[12px] text-foreground-secondary">{r.note}</p>
              )}
              <div className="mt-2 flex gap-2">
                <Link
                  href="/schedule"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-hover px-3 py-1.5 text-[11px] font-medium text-foreground-secondary transition-colors hover:bg-active hover:text-foreground"
                >
                  Open Schedule
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => resolveRequest(r.id, "scheduled")}
                >
                  Mark scheduled
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => resolveRequest(r.id, "declined")}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-raise p-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">Documents</span>
          <span className="text-[11px] text-muted-foreground">
            proposals, contracts, invoices
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setDocOpen((o) => !o)}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        {docOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addDocument();
            }}
            className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raise p-2.5"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Name</Label>
                <Input
                  placeholder="Q3 Proposal"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Dropdown
                  value={docCategory}
                  options={DOCUMENT_CATEGORIES.map((c) => ({
                    value: c,
                    label: DOCUMENT_CATEGORY_LABELS[c],
                  }))}
                  onChange={(v) => setDocCategory(v as DocumentCategory)}
                />
              </div>
            </div>
            <div>
              <Label>File</Label>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setDocFile(f);
                  // Save the typing — the file already has a name, and you can
                  // still overwrite it above.
                  if (f && !docName.trim()) setDocName(f.name.replace(/\.[^.]+$/, ""));
                }}
                className="block w-full cursor-pointer rounded-md border border-border bg-transparent px-2.5 py-1.5 text-[12.5px] text-muted-foreground file:mr-2.5 file:rounded-md file:border-0 file:bg-active file:px-2 file:py-1 file:text-[12px] file:text-foreground hover:file:bg-white/15"
              />
              {docFile && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-2">
                  {docFile.name} · {formatBytes(docFile.size)}
                  <button
                    type="button"
                    onClick={() => setDocFile(null)}
                    className="text-muted-foreground underline hover:text-foreground"
                  >
                    clear
                  </button>
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-2">
                Stored privately — the client sees it through a link that expires,
                not a public URL. Up to {formatBytes(MAX_FILE_BYTES)}.
              </p>
            </div>

            {/* A link is still allowed. Sometimes the thing genuinely lives in a
                shared Drive and copying it here would only create a second,
                staler version. */}
            {!docFile && (
              <div>
                <Label>Or a link instead</Label>
                <Input
                  placeholder="drive.google.com/..."
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-2">
                  Check it&apos;s shared with your client before posting it.
                </p>
              </div>
            )}

            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={
                docBusy ||
                !(docName.trim() || docFile) ||
                !(docFile || docUrl.trim())
              }
            >
              {docBusy ? (docFile ? "Uploading..." : "Adding...") : "Add document"}
            </Button>
          </form>
        )}

        {documents.length === 0 && !docOpen && (
          <p className="py-3 text-center text-[12px] text-muted-foreground">
            No documents yet. Anything you add here shows up in {client.company}&apos;s portal.
          </p>
        )}

        {groupedDocs.map(({ category, items }) => (
          <div key={category} className="flex flex-col gap-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-2">
              {DOCUMENT_CATEGORY_LABELS[category]}
            </p>
            {items.map((d) => (
              <div
                key={d.id}
                className="group flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => openDocument(d)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] hover:underline"
                >
                  <span className="min-w-0 truncate">{d.name}</span>
                  {d.storage_path ? (
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </button>
                <span className="shrink-0 text-[11px] text-muted-2">
                  {formatDate(d.created_at)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${d.name}`}
                  onClick={() => deleteDocument(d.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-hover hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Invoices */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-raise p-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">Invoices</span>
          <span className="text-[11px] text-muted-foreground">drafts stay hidden</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setInvOpen((o) => !o)}
          >
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>

        {invOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addInvoice();
            }}
            className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raise p-2.5"
          >
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Number</Label>
                <Input
                  placeholder="INV-001"
                  value={invNumber}
                  onChange={(e) => setInvNumber(e.target.value)}
                />
              </div>
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Dropdown
                  value={invCurrency}
                  options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
                  onChange={(v) => setInvCurrency(v as CurrencyCode)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Issued</Label>
                <DatePicker value={invIssue} onChange={setInvIssue} placeholder="Issue date" />
              </div>
              <div>
                <Label>Due</Label>
                <DatePicker value={invDue} onChange={setInvDue} placeholder="Due date" />
              </div>
            </div>
            <div>
              <Label>Invoice PDF (optional)</Label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setInvFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-md border border-border bg-transparent px-2.5 py-1.5 text-[12.5px] text-muted-foreground file:mr-2.5 file:rounded-md file:border-0 file:bg-active file:px-2 file:py-1 file:text-[12px] file:text-foreground hover:file:bg-white/15"
              />
              {invFile && (
                <p className="mt-1 text-[11px] text-muted-2">
                  {invFile.name} · {formatBytes(invFile.size)}
                </p>
              )}
              {/* Drafts stay invisible to the client, and so does their PDF —
                  the storage policy checks the invoice's status, not just the
                  folder it sits in. */}
              <p className="mt-1 text-[11px] text-muted-2">
                Only reaches the client once you mark the invoice Sent.
              </p>
            </div>
            {!invFile && (
              <div>
                <Label>Or a link instead</Label>
                <Input
                  placeholder="drive.google.com/..."
                  value={invUrl}
                  onChange={(e) => setInvUrl(e.target.value)}
                />
              </div>
            )}
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={invBusy || !invNumber.trim() || invAmount === ""}
            >
              {invBusy ? "Creating..." : "Create draft"}
            </Button>
          </form>
        )}

        {invoices.length === 0 && !invOpen && (
          <p className="py-3 text-center text-[12px] text-muted-foreground">
            No invoices yet. Create one, then mark it Sent to show it in the portal.
          </p>
        )}

        {invoices.map((inv) => {
          const display = effectiveInvoiceStatus(inv);
          return (
            <div
              key={inv.id}
              className="group flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-medium">
                  <span className="min-w-0 truncate">{inv.number}</span>
                  {(inv.storage_path || inv.document_url) && (
                    <button
                      type="button"
                      aria-label={`Open ${inv.number}`}
                      onClick={() => openInvoice(inv)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {inv.storage_path ? (
                        <Paperclip className="h-3 w-3" />
                      ) : (
                        <ExternalLink className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </p>
                <p className="text-[11px] text-muted-2">
                  {formatMoney(inv.amount, inv.currency)}
                  {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}
                </p>
              </div>
              <Badge tone={INVOICE_TONES[display]}>{INVOICE_STATUS_LABELS[display]}</Badge>
              <div className="w-[104px] shrink-0">
                <Dropdown
                  value={inv.status}
                  options={INVOICE_STATUSES.map((s) => ({
                    value: s,
                    label: INVOICE_STATUS_LABELS[s],
                  }))}
                  onChange={(v) => updateInvoice(inv.id, { status: v as InvoiceStatus })}
                />
              </div>
              <button
                type="button"
                aria-label={`Delete ${inv.number}`}
                onClick={() => deleteInvoice(inv.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-hover hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
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
