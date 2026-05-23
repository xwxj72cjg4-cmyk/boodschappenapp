import { NextResponse } from "next/server";
import { searchProducts, DELIVERY_ONLY_STORES } from "@/lib/winkelmaatje";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json({ groups: [] });
  const store = url.searchParams.get("store");
  // Bij een specifieke winkel halen we het hele assortiment van die winkel op;
  // anders een ruime greep over alle winkels zodat er genoeg variatie is.
  const stores = store ? [store] : undefined;
  const limit = store ? 100 : 80;
  // Bezorg-only webshops (Butlon e.d.) weren, tenzij je er expliciet op filtert.
  const excludeStores =
    store && DELIVERY_ONLY_STORES.includes(store)
      ? undefined
      : DELIVERY_ONLY_STORES;
  try {
    const groups = await searchProducts(q, { stores, limit, excludeStores });
    return NextResponse.json({ groups });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "search failed" },
      { status: 502 },
    );
  }
}
