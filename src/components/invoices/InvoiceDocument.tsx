import { addressLines, invoiceTotals, lineAmount } from "@/lib/invoiceDoc";
import type { AppSettings, Client, Invoice, InvoiceLine } from "@/lib/types";

/**
 * The invoice, as a printable page.
 *
 * ── Why this isn't the Figma output ─────────────────────────────────────────
 *
 * `get_design_context` returns the frame absolutely positioned at 2550px wide
 * with every value hardcoded — `left-[2164px]`, `text-[40px]`, `top-[2679px]`.
 * That's a faithful description of one artboard and a useless component: it
 * can't take a second line item, and every number is wrong at any other size.
 *
 * So the geometry is rebuilt in flow layout at real page units, matched to the
 * template by proportion rather than by pixel. The frame is 2550 × 3300, which
 * is US Letter at 300 DPI — so 300px in Figma is 1 inch here, and the type
 * scale divides down cleanly: 104px → 26pt, 40px → 10pt, 30px → 7.5pt.
 *
 * ── Print, not screen ───────────────────────────────────────────────────────
 *
 * Sized in `in`/`pt` rather than rem. A rem is relative to a root font size
 * that changes with the user's browser settings, which is right for the app
 * and wrong for a document that must come out identical on every machine.
 *
 * Colours are literal hex, not the app's tokens, for the same reason: this
 * page has no dark mode and must not acquire one. A client opening a dark-mode
 * PDF of an invoice is a bug, and `--surface-1` would give them one.
 */

const BRAND = "#0e33ca";
const INK = "#212121";
const RULE = "#a6a6a6";

export function InvoiceDocument({
  invoice,
  lines,
  client,
  settings,
  subject,
  formatMoney,
  qrDataUrl,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  client: Client | null;
  settings: AppSettings | null;
  /** The line under "Invoice" — a project or deal name. */
  subject?: string | null;
  /** Passed in so the document doesn't reach for the currency hook. */
  formatMoney: (value: number) => string;
  /**
   * A rendered QR image for the UPI string. Optional: without a QR library the
   * footer degrades to the UPI ID in text, which is still payable.
   */
  qrDataUrl?: string | null;
}) {
  const totals = invoiceTotals(lines);
  const from = addressLines(settings?.company_address);
  const to = addressLines(client?.address);

  return (
    <div
      className="invoice-page"
      style={{
        width: "8.5in",
        minHeight: "11in",
        background: "#fff",
        color: INK,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: "10pt",
        lineHeight: 1.2,
      }}
    >
      <header
        style={{
          background: BRAND,
          color: "#fff",
          display: "flex",
          minHeight: "2.2in",
          borderBottom: "3px solid #fff",
        }}
      >
        <div style={{ flex: 1, padding: "0.4in", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "13pt", fontWeight: 700, letterSpacing: "0.02em" }}>
            {settings?.company_name ?? "Trydent Labs"}
          </div>
          <div style={{ marginTop: "auto" }}>
            <div style={{ fontSize: "26pt", fontWeight: 700, letterSpacing: "-0.04em" }}>
              Invoice
            </div>
            {subject && <div style={{ fontSize: "10pt", marginTop: "0.06in" }}>{subject}</div>}
          </div>
        </div>

        {/* The vertical rule and the right column are one unit in the template. */}
        <div
          style={{
            width: "2.7in",
            borderLeft: "2px solid rgba(255,255,255,0.9)",
            padding: "0.4in",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            fontSize: "10pt",
          }}
        >
          <Meta label="Invoice #" value={invoice.number} />
          <Meta label="Issue Date" value={fmtDate(invoice.issue_date)} />
          <Meta label="Due Date" value={fmtDate(invoice.due_date)} />
        </div>
      </header>

      <section style={{ padding: "0.4in 0.4in 0", display: "flex", gap: "0.2in" }}>
        <Party title="Bill From:" name={settings?.company_name} lines={from} />
        <Party title="Bill To:" name={client?.company} lines={to} />
        <div style={{ width: "2.5in", textAlign: "right" }}>
          <div style={{ fontWeight: 500 }}>Total Due:</div>
          <div
            style={{
              fontSize: "26pt",
              fontWeight: 500,
              letterSpacing: "-0.04em",
              marginTop: "0.08in",
            }}
          >
            {formatMoney(totals.total)}
          </div>
        </div>
      </section>

      <section style={{ padding: "0.35in 0.4in 0" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: `2px solid rgba(33,33,33,0.4)`,
          }}
        >
          <thead>
            <tr>
              {/* "ITEM" follows the most recent artwork; both Figma frames
                  still say "CHARGES". One word, one place to change it. */}
              <Th align="left">Item</Th>
              <Th align="left" width="1.4in">
                Quantity
              </Th>
              <Th align="right" width="1.6in">
                Total
              </Th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <Td colSpan={3} muted>
                  No line items
                </Td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <Td>{line.description}</Td>
                <Td>{trimZeros(line.quantity)}</Td>
                <Td align="right">{formatMoney(lineAmount(line))}</Td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.3in" }}>
          <div
            style={{
              width: "3.4in",
              border: `2px solid rgba(33,33,33,0.4)`,
              padding: "0.22in",
            }}
          >
            <TotalRow label="Subtotal" value={formatMoney(totals.subtotal)} />
            {/* The template carries a hidden row here for tax or a discount.
                Rendered only when non-zero so the box doesn't grow a blank
                line on every ordinary invoice. */}
            {totals.adjustment !== 0 && (
              <TotalRow label="Adjustment" value={formatMoney(totals.adjustment)} />
            )}
            <div style={{ borderTop: `2px solid ${INK}`, margin: "0.12in 0" }} />
            <TotalRow label="Total" value={formatMoney(totals.total)} bold />
          </div>
        </div>
      </section>

      {/* Pushes the footer to the bottom of the page however few lines there
          are — the template has a large deliberate gap here. */}
      <div style={{ flex: 1, minHeight: "0.5in" }} />

      <footer
        style={{
          borderTop: `2px solid ${RULE}`,
          display: "flex",
          fontSize: "8.5pt",
        }}
      >
        <div style={{ flex: 1, padding: "0.28in 0.4in" }}>
          <div style={{ fontSize: "12pt", fontWeight: 700 }}>{settings?.company_name}</div>
          {from.map((l) => (
            <div key={l} style={{ marginTop: "0.03in" }}>
              {l}
            </div>
          ))}
          {settings?.company_email && (
            <div style={{ marginTop: "0.03in" }}>{settings.company_email}</div>
          )}

          {settings?.invoice_footer_note && (
            <div style={{ color: BRAND, margin: "0.16in 0 0" }}>
              {settings.invoice_footer_note}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.35in", marginTop: "0.18in" }}>
            <FooterField label="Contact number" value={settings?.company_phone} />
            <FooterField label="Bank account number" value={settings?.bank_account_number} />
            <FooterField label="Branch" value={settings?.bank_branch} />
          </div>
          <div style={{ display: "flex", gap: "0.35in", marginTop: "0.14in" }}>
            <FooterField label="UPI ID" value={settings?.upi_id} />
            <FooterField label="IFSC code" value={settings?.bank_ifsc} />
          </div>
        </div>

        <div
          style={{
            width: "2.2in",
            borderLeft: `2px solid ${RULE}`,
            padding: "0.28in",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 500, fontSize: "10pt" }}>Scan to Pay:</div>
          {qrDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`UPI QR code for ${settings?.upi_id ?? "payment"}`}
                style={{ width: "1.3in", height: "1.3in", margin: "0.12in auto 0" }}
              />
              <div style={{ fontSize: "6pt", marginTop: "0.06in" }}>
                UPI ID: {settings?.upi_id}
              </div>
            </>
          ) : (
            /*
              No QR library is installed, so rather than ship a stale PNG of one
              specific address the footer falls back to the ID in text. An
              image can't notice when the UPI ID beside it changes; this can't
              go wrong that way.
            */
            <div style={{ marginTop: "0.5in", fontSize: "9pt" }}>{settings?.upi_id}</div>
          )}
        </div>
      </footer>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.2in" }}>
      <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Party({
  title,
  name,
  lines,
}: {
  title: string;
  name?: string | null;
  lines: string[];
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 500 }}>{title}</div>
      <div style={{ marginTop: "0.06in" }}>{name ?? "—"}</div>
      {lines.map((l) => (
        <div key={l} style={{ marginTop: "0.04in" }}>
          {l}
        </div>
      ))}
    </div>
  );
}

function Th({
  children,
  align = "left",
  width,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  return (
    <th
      style={{
        textAlign: align,
        width,
        padding: "0.18in 0.2in",
        fontSize: "7.5pt",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderRight: align === "right" ? undefined : `2px solid ${RULE}`,
        borderBottom: `2px solid ${RULE}`,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
  muted,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
  muted?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align,
        padding: "0.18in 0.2in",
        color: muted ? RULE : INK,
        borderRight: align === "right" ? undefined : `2px solid ${RULE}`,
      }}
    >
      {children}
    </td>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontWeight: bold ? 700 : 400,
        padding: "0.04in 0",
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function FooterField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ color: BRAND, fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      {value.split("\n").map((l) => (
        <div key={l} style={{ marginTop: "0.02in" }}>
          {l}
        </div>
      ))}
    </div>
  );
}

/** "1" not "1.00", but "1.5" survives. */
function trimZeros(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(Number(n.toFixed(2)));
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  // Parsed at noon so the printed date can't shift a day by timezone — the
  // same trap fixed in lib/goalPace.ts.
  const d = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
