import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

const SUPPORTED = ["USD", "INR", "EUR", "CAD", "AUD", "AED"];

/**
 * GET /api/fx?base=USD
 * Live exchange rates for the app's base currency. Cached on the server for
 * 6 hours so page loads don't hammer the upstream service (rates move slowly
 * enough that this is plenty fresh for pipeline reporting).
 *
 * ── Why a session check rather than a rate limiter ──────────────────────────
 *
 * This route was the only unauthenticated endpoint in the app. The upstream
 * was never the exposure — `revalidate: 21600` below means at most one call
 * per base currency per six hours however hard anyone hits this, so the
 * upstream ceiling is about 24 requests a day. What an anonymous loop DOES
 * cost is Vercel invocations, i.e. money.
 *
 * A per-IP token bucket is the reflex answer and it's close to useless here:
 * on serverless every cold start resets in-memory counters and concurrent
 * instances don't share them, so the limiter would look like protection while
 * providing roughly none. Real throttling needs Upstash or equivalent — a new
 * service and a new dependency for an endpoint that returns public exchange
 * rates.
 *
 * Requiring a session is the proportionate fix: these rates are only ever
 * consumed by the signed-in app, so gating removes anonymous abuse outright
 * and adds nothing to the stack. If this ever needs to serve logged-out users,
 * that's the point to reach for a real limiter.
 */
export async function GET(req: Request) {
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const base = (searchParams.get("base") ?? "USD").toUpperCase();
  if (!SUPPORTED.includes(base)) {
    return NextResponse.json({ error: "Unsupported base currency." }, { status: 400 });
  }

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      next: { revalidate: 21600 }, // 6 hours
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Rate service unavailable." }, { status: 502 });
    }
    const json = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
    };
    if (json.result !== "success" || !json.rates) {
      return NextResponse.json({ error: "Rate service returned no rates." }, { status: 502 });
    }

    // Only pass through the currencies we actually offer.
    const rates: Record<string, number> = {};
    for (const code of SUPPORTED) {
      if (typeof json.rates[code] === "number") rates[code] = json.rates[code];
    }

    return NextResponse.json({
      base,
      rates,
      fetchedAt: (json.time_last_update_unix ?? Math.floor(Date.now() / 1000)) * 1000,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the rate service." }, { status: 502 });
  }
}
