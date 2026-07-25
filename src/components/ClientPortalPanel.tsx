"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ExternalLink,
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
import type {
  Client,
  ClientDocument,
  ClientPortal,
  CurrencyCode,
  DocumentCategory,
  Invoice,
  InvoiceDisplayStatus,
  InvoiceStatus,
  PortalMessage,
  PortalUpdate,
} from "@/lib/types";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  PORTAL_STATUSES,
  effectiveInvoiceStatus,
} from "@/lib/types";

const INVOICE_TONES: Record<InvoiceDisplayStatus, "gray" | "blue" | "green" | "red"> = {
  draft: "gray",
  sent: "blue",
  paid: "green",
  overdue: "red",
};

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
  const [invBusy, setInvBusy] = useState(false);

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
    });
    async function loadPanelData() {
      const supabase = createClient();
      if (!supabase) return;
      const [msgRes, docRes, invRes] = await Promise.all([
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
      ]);
      setMessages((msgRes.data as PortalMessage[]) ?? []);
      setDocuments((docRes.data as ClientDocument[]) ?? []);
      setInvoices((invRes.data as Invoice[]) ?? []);
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

  async function addDocument() {
    const name = docName.trim();
    let url = docUrl.trim();
    if (!name || !url || !profile) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setDocBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setDocBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("client_documents")
      .insert({
        client_id: client.id,
        name,
        url,
        category: docCategory,
        added_by: profile.id,
      })
      .select()
      .single();
    setDocBusy(false);
    if (error) {
      toast.error(`Couldn't add: ${error.message}`);
      return;
    }
    setDocuments((prev) => [data as ClientDocument, ...prev]);
    setDocName("");
    setDocUrl("");
    setDocOpen(false);
    toast.success("Document added to the client portal");
  }

  async function deleteDocument(id: string) {
    const before = documents;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("client_documents").delete().eq("id", id);
    if (error) {
      setDocuments(before);
      toast.error(`Couldn't delete: ${error.message}`);
    }
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
        created_by: profile.id,
      })
      .select()
      .single();
    setInvBusy(false);
    if (error) {
      toast.error(`Couldn't add: ${error.message}`);
      return;
    }
    setInvoices((prev) => [data as Invoice, ...prev]);
    setInvNumber("");
    setInvAmount("");
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
    const before = invoices;
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      setInvoices(before);
      toast.error(`Couldn't delete: ${error.message}`);
    }
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

      {/* Messages */}
      <div className="flex flex-col gap-2 rounded border border-border bg-white/[0.02] p-3">
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
                    : "self-start border border-border-subtle bg-white/[0.03]"
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

      {/* Documents */}
      <div className="flex flex-col gap-2 rounded border border-border bg-white/[0.02] p-3">
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
            className="flex flex-col gap-2 rounded-md border border-border-subtle bg-white/[0.02] p-2.5"
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
              <Label>Link</Label>
              <Input
                placeholder="drive.google.com/..."
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-2">
                Make sure the link is shared with your client before posting it.
              </p>
            </div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={docBusy || !docName.trim() || !docUrl.trim()}
            >
              {docBusy ? "Adding..." : "Add document"}
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
                <a
                  href={d.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] hover:underline"
                >
                  <span className="min-w-0 truncate">{d.name}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
                <span className="shrink-0 text-[11px] text-muted-2">
                  {formatDate(d.created_at)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${d.name}`}
                  onClick={() => deleteDocument(d.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/5 hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Invoices */}
      <div className="flex flex-col gap-2 rounded border border-border bg-white/[0.02] p-3">
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
            className="flex flex-col gap-2 rounded-md border border-border-subtle bg-white/[0.02] p-2.5"
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
              <Label>Invoice link (optional)</Label>
              <Input
                placeholder="drive.google.com/..."
                value={invUrl}
                onChange={(e) => setInvUrl(e.target.value)}
              />
            </div>
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
                  {inv.document_url && (
                    <a
                      href={inv.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${inv.number}`}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
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
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/5 hover:text-danger group-hover:opacity-100"
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
