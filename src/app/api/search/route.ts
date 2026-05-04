import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/winkelmaatje";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json({ groups: [] });
  try {
    const groups = await searchProducts(q);
    return NextResponse.json({ groups });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "search failed" },
      { status: 502 },
    );
  }
}
