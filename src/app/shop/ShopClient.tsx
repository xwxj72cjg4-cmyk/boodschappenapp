"use client";

import { useState } from "react";
import Link from "next/link";

type Item = { id: string; name: string; qty: number };
type Household = {
  id: string;
  name: string;
  postal_code: string | null;
  radius_km: number;
};

type Store = {
  id: string;
  name: string;
  logoUrl: string | null;
  serviceModel: string;
  distanceKm: number | null;
};

type ComboItem = {
  itemId: string;
  itemName: string;
  qty: number;
  storeId: string | null;
  productName: string | null;
  productImage: string | null;
  unitPrice: number | null;
  lineTotal: number;
  missing: boolean;
};

type OptimizeResponse = {
  stores: Store[];
  best: {
    storeIds: string[];
    total: number;
    perItem: ComboItem[];
    missingCount: number;
  } | null;
  error?: string;
};

const formatPrice = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

export default function ShopClient({
  household,
  items,
}: {
  household: Household;
  items: Item[];
}) {
  const [numStores, setNumStores] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);

  const optimize = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items,
          numStores,
          postalCode: household.postal_code,
          radiusKm: household.postal_code ? household.radius_km : null,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json: OptimizeResponse = await r.json();
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mislukt");
    } finally {
      setLoading(false);
    }
  };

  const storeMap = new Map(result?.stores.map((s) => [s.id, s]) ?? []);
  const grouped: Record<string, ComboItem[]> = {};
  if (result?.best) {
    for (const it of result.best.perItem) {
      const k = it.storeId || "_missing";
      (grouped[k] ||= []).push(it);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-5 space-y-5">
      <header>
        <Link href={`/lijst/${household.id}`} className="text-sm text-slate-500">
          ← Terug
        </Link>
        <h1 className="text-2xl font-bold text-brand-700">Winkelplan</h1>
        <p className="text-sm text-slate-500">
          {items.length} items · {household.name}
          {household.postal_code && (
            <>
              {" "}
              · binnen {household.radius_km} km van {household.postal_code}
            </>
          )}
        </p>
        {!household.postal_code && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
            Tip: stel je postcode in op de lijstpagina om alleen winkels in de buurt mee te tellen.
          </p>
        )}
      </header>

      <section className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="font-semibold">Hoeveel winkels wil je bezoeken?</h2>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNumStores(n)}
              className={`rounded-xl py-3 font-semibold border-2 ${
                numStores === n
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              {n} {n === 1 ? "winkel" : "winkels"}
            </button>
          ))}
        </div>
        <button
          onClick={optimize}
          disabled={loading || items.length === 0}
          className="w-full rounded-xl bg-brand-600 text-white font-semibold py-3 disabled:opacity-60"
        >
          {loading ? "Prijzen ophalen..." : "Bereken goedkoopste plan"}
        </button>
        {items.length === 0 && (
          <p className="text-sm text-slate-500">
            Voeg eerst items toe aan de lijst.
          </p>
        )}
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {result?.best && (
        <section className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm text-slate-500">Geschatte totaal</p>
            <p className="text-3xl font-bold text-brand-700">
              {formatPrice(result.best.total)}
            </p>
            {result.best.missingCount > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                ⚠️ {result.best.missingCount} item(s) niet gevonden
              </p>
            )}
          </div>

          {Object.entries(grouped).map(([sid, list]) => {
            if (sid === "_missing") return null;
            const store = storeMap.get(sid);
            const subTotal = list.reduce((s, i) => s + i.lineTotal, 0);
            return (
              <div
                key={sid}
                className="bg-white rounded-2xl shadow-sm overflow-hidden"
              >
                <div className="flex items-center gap-3 p-4 bg-brand-50">
                  {store?.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={store.logoUrl}
                      alt={store.name}
                      className="w-10 h-10 object-contain bg-white rounded-lg p-1"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{store?.name ?? sid}</p>
                    <p className="text-xs text-slate-500">
                      {list.length} items · {formatPrice(subTotal)}
                      {typeof store?.distanceKm === "number" && (
                        <> · {store.distanceKm.toFixed(1)} km</>
                      )}
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {list.map((it) => (
                    <li
                      key={it.itemId}
                      className="p-3 flex items-center gap-3"
                    >
                      <div className="w-12 h-12 shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                        {it.productImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.productImage}
                            alt=""
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-slate-300 text-2xl">·</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{it.itemName}</p>
                        {it.productName && (
                          <p className="text-xs text-slate-500 truncate">
                            {it.productName}
                            {it.qty > 1 ? ` · ${it.qty}×` : ""}
                          </p>
                        )}
                      </div>
                      <p className="font-mono text-sm whitespace-nowrap">
                        {formatPrice(it.lineTotal)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {grouped._missing && (
            <div className="bg-amber-50 rounded-2xl p-4">
              <p className="font-semibold text-amber-900 mb-2">Niet gevonden</p>
              <ul className="text-sm text-amber-800 list-disc pl-5">
                {grouped._missing.map((it) => (
                  <li key={it.itemId}>
                    {it.itemName} ({it.qty}×)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {result && !result.best && !error && (
        <p className="text-sm text-slate-600">
          Geen goede match gevonden. Probeer minder of duidelijkere itemnamen, of
          vergroot je straal in de instellingen.
        </p>
      )}
    </main>
  );
}
