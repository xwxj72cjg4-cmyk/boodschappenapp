import { NextResponse } from "next/server";
import { searchProducts, listStores } from "@/lib/winkelmaatje";
import { buildItemQuote, optimize } from "@/lib/optimizer";

export const runtime = "nodejs";

type Body = {
  items: { id: string; name: string; qty: number }[];
  numStores: 1 | 2 | 3;
  postalCode?: string | null;
  radiusKm?: number | null;
  storeIds?: string[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const items = (body.items || []).filter((i) => i.name?.trim());
  if (!items.length) return NextResponse.json({ error: "no items" }, { status: 400 });
  const n = ([1, 2, 3].includes(body.numStores) ? body.numStores : 1) as 1 | 2 | 3;
  const postalCode = body.postalCode || null;
  const radiusKm = body.radiusKm || null;

  const allStores = await listStores({ postalCode, radiusKm });

  // Filter to stores that have a physical location and (when postcode set) are
  // within radius. Delivery-only services are still included if no radius given.
  const inRange = allStores.filter((s) => {
    if (body.storeIds?.length && !body.storeIds.includes(s.id)) return false;
    if (postalCode && radiusKm) {
      if (s.serviceModel === "physical_store") {
        return s.distanceKm !== null && s.distanceKm <= radiusKm;
      }
      // delivery-only stores ignore radius (they deliver everywhere)
      return true;
    }
    return true;
  });

  const storePool = inRange.map((s) => s.id);
  if (!storePool.length) {
    return NextResponse.json({
      stores: [],
      best: null,
      error: "Geen winkels binnen de opgegeven straal.",
    });
  }

  // Search each item in parallel.
  const quotes = await Promise.all(
    items.map(async (it) => {
      try {
        const groups = await searchProducts(it.name, { postalCode, radiusKm });
        return buildItemQuote(it.id, it.name, Math.max(1, it.qty || 1), groups);
      } catch {
        return buildItemQuote(it.id, it.name, Math.max(1, it.qty || 1), []);
      }
    }),
  );

  const best = optimize(quotes, storePool, n);
  return NextResponse.json({ stores: inRange, best });
}
