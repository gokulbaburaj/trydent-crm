import { NextResponse } from "next/server";

const SUPPORTED = ["USD", "INR", "EUR", "CAD", "AUD", "AED"];

/**
 * GET /api/fx?base=USD
 * Live exchange rates for the app's base currency. Cached on the server for
 * 6 hours so page loads don't hammer the upstream service (rates move slowly
 * enough that this is plenty fresh for pipeline reporting).
 */
export async function GET(req: Request) {
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
