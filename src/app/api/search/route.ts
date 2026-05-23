import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/winkelmaatje";

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
  try {
    const groups = await searchProducts(q, { stores, limit });
    return NextResponse.json({ groups });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "search failed" },
      { status: 502 },
    );
  }
}
