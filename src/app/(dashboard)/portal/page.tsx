"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Client, Deal, ClientPortal } from "@/lib/types";

export default function ClientPortalPage() {
  const { profile, signOut } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [portal, setPortal] = useState<ClientPortal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      if (!supabase || !profile?.client_id) {
        setLoading(false);
        return;
      }

      const [{ data: clientData }, { data: dealsData }, { data: portalData }] =
        await Promise.all([
          supabase.from("clients").select("*").eq("id", profile.client_id).single(),
          supabase.from("deals").select("*").eq("client_id", profile.client_id),
          supabase.from("client_portals").select("*").eq("client_id", profile.client_id).maybeSingle(),
        ]);

      setClient((clientData as Client) ?? null);
      setDeals((dealsData as Deal[]) ?? []);
      setPortal((portalData as ClientPortal) ?? null);
      setLoading(false);
    }
    load();
  }, [profile]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[11px] font-medium text-accent-foreground">
            TL
          </div>
          <span className="text-[13px] font-medium text-foreground">Trydent Labs Client Portal</span>
        </div>
        <button onClick={signOut} className="rounded p-2 text-muted hover:bg-surface-hover hover:text-foreground">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        {!client ? (
          <Card>
            <p className="text-sm text-muted">
              Your account isn&apos;t linked to a client record yet. Please contact your
              account manager at Trydent Labs.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <h2 className="text-lg font-semibold">{client.company}</h2>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone={statusTone(client.status)} dot>{client.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted">Point of Contact</p>
                  <p>{client.point_person || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Email</p>
                  <p>{client.email || "—"}</p>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-muted">Your Deals</h3>
              <div className="flex flex-col gap-2">
                {deals.map((d) => (
                  <div key={d.id} className="rounded border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{d.deal_name}</span>
                      <Badge tone={statusTone(d.deal_stage)}>{d.deal_stage}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                      <span>Value: {formatCurrency(Number(d.deal_value))}</span>
                      <span>Paid: {formatCurrency(Number(d.paid))}</span>
                      <span>Close: {formatDate(d.close_date)}</span>
                    </div>
                  </div>
                ))}
                {deals.length === 0 && <p className="text-sm text-muted">No deals yet.</p>}
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-muted">Portal Status</h3>
              {portal ? (
                <Badge tone={statusTone(portal.status)} dot>{portal.status}</Badge>
              ) : (
                <p className="text-sm text-muted">Not started yet.</p>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
