"use client";

import { use, useEffect, useMemo, useState } from "react";
import { InvoiceDocument } from "@/components/invoices/InvoiceDocument";
import { createClient } from "@/lib/supabase/client";
import type {
  AppSettings,
  Client,
  CurrencyCode,
  Invoice,
  InvoiceLine,
  Project,
} from "@/lib/types";

/**
 * A single invoice, alone on a page, ready to print.
 *
 * ── Why a print route rather than a PDF library ─────────────────────────────
 *
 * Generating the PDF server-side needs either Puppeteer (a headless Chromium
 * that doesn't fit a serverless function without @sparticuz/chromium) or a
 * drawing library like pdfkit, which means rebuilding the layout a second time
 * in a different primitive set and keeping the two in step forever.
 *
 * The browser already has a good PDF renderer. `@page` gives it the right
 * paper size and margins, and Cmd-P → Save as PDF produces a vector file with
 * selectable text — better output than a screenshot-based pipeline, and with
 * no dependency to install or keep patched.
 *
 * The cost is honest: it's a manual step, and it can't write the file back to
 * storage on its own. Automating that is a separate change and needs a package
 * this sandbox can't install.
 *
 * ── Why it lives outside (dashboard) ────────────────────────────────────────
 *
 * The dashboard layout wraps everything in a sidebar, tab strip and topbar.
 * None of that should print, and fighting it with `print:hidden` on someone
 * else's layout is more fragile than not being inside it.
 */
export default function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        setError("Not connected.");
        setLoading(false);
        return;
      }

      const { data: inv, error: invError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .single();

      if (cancelled) return;
      if (invError || !inv) {
        setError("That invoice couldn't be loaded.");
        setLoading(false);
        return;
      }

      const [lineRes, clientRes, settingsRes, projectRes] = await Promise.all([
        supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("sort_order"),
        supabase.from("clients").select("*").eq("id", inv.client_id).single(),
        supabase.from("app_settings").select("*").single(),
        // The subject line under "Invoice" — the project this was raised for,
        // when there is one. Falls back to nothing rather than inventing text.
        inv.deal_id
          ? supabase.from("projects").select("name").eq("deal_id", inv.deal_id).limit(1)
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;
      setInvoice(inv as Invoice);
      setLines((lineRes.data as InvoiceLine[]) ?? []);
      setClient((clientRes.data as Client) ?? null);
      setSettings((settingsRes.data as AppSettings) ?? null);
      const projects = projectRes.data as Pick<Project, "name">[] | null;
      setSubject(projects?.[0]?.name ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const money = useMemo(() => {
    // The invoice's OWN currency, never the viewer's display preference. A
    // document sent to a client must not change denomination depending on who
    // opened the app last.
    const code = (invoice?.currency as CurrencyCode) ?? "INR";
    /*
      Two decimals, unlike `formatMoney` in lib/currency.

      That helper pins maximumFractionDigits to 0, which is right everywhere it
      is used — a dashboard reading "₹1,84,508" is easier to scan than
      "₹1,84,508.00". On an invoice it's wrong: the template shows
      "₹10,000.00", and a document quoting a round figure where the real amount
      has paise understates what's owed. Rounding is a display choice on a
      summary and a defect on something a client pays against.
    */
    const fmt = new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (value: number) => fmt.format(value || 0);
  }, [invoice?.currency]);

  if (loading) {
    return <p style={{ padding: "2rem", fontFamily: "sans-serif" }}>Loading…</p>;
  }
  if (error || !invoice) {
    return <p style={{ padding: "2rem", fontFamily: "sans-serif" }}>{error}</p>;
  }

  return (
    <>
      <style>{`
        @page { size: 8.5in 11in; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
        }
        @media screen {
          body { background: #2b2b2b; }
          .invoice-page { box-shadow: 0 8px 40px rgba(0,0,0,0.35); margin: 24px auto; }
        }
        /* Chrome drops backgrounds when printing unless asked. Without this the
           blue header prints white and the document looks unfinished. */
        .invoice-page, .invoice-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="no-print" style={{ padding: "16px 24px", fontFamily: "sans-serif" }}>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            background: "#0e33ca",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Print / Save as PDF
        </button>
        <span style={{ color: "#bbb", marginLeft: 12, fontSize: 13 }}>
          Choose “Save as PDF” in the print dialog. Margins: None.
        </span>
      </div>

      <InvoiceDocument
        invoice={invoice}
        lines={lines}
        client={client}
        settings={settings}
        subject={subject}
        formatMoney={money}
      />
    </>
  );
}
