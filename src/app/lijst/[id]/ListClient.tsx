"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SwipeRow } from "@/components/SwipeRow";

type Item = {
  id: string;
  name: string;
  qty: number;
  checked: boolean;
  added_by: string | null;
  created_at: string;
};

type Household = {
  id: string;
  name: string;
  invite_code: string;
  postal_code: string | null;
  radius_km: number;
};

type SearchOffer = {
  storeId: string;
  storeName: string;
  price: number;
  imageUrl: string | null;
  isCheapest: boolean;
};

type SearchGroup = {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  lowestPrice: number | null;
  offers: SearchOffer[];
};

const formatPrice = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

export default function ListClient({
  household: initialHousehold,
  initialItems,
  userId,
}: {
  household: Household;
  initialItems: Item[];
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [household, setHousehold] = useState(initialHousehold);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [postal, setPostal] = useState(household.postal_code ?? "");
  const [radius, setRadius] = useState(household.radius_km);
  const [savingSettings, setSavingSettings] = useState(false);

  // Product search state
  const [searchResults, setSearchResults] = useState<SearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [preferredStore, setPreferredStore] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Collect available store names from search results for filter buttons
  const availableStores = useMemo(() => {
    const storeMap = new Map<string, string>();
    for (const g of searchResults) {
      for (const o of g.offers) {
        if (!storeMap.has(o.storeId)) storeMap.set(o.storeId, o.storeName);
      }
    }
    return Array.from(storeMap.entries()).map(([id, name]) => ({ id, name }));
  }, [searchResults]);

  // Filter and sort results based on preferred store
  const filteredResults = useMemo(() => {
    let results = [...searchResults];
    if (preferredStore) {
      // Only show products available at the preferred store
      results = results
        .map((g) => ({
          ...g,
          offers: g.offers.filter((o) => o.storeId === preferredStore),
          lowestPrice: g.offers
            .filter((o) => o.storeId === preferredStore)
            .reduce((min, o) => (o.price < min ? o.price : min), Infinity),
        }))
        .filter((g) => g.offers.length > 0)
        .map((g) => ({
          ...g,
          lowestPrice: g.lowestPrice === Infinity ? null : g.lowestPrice,
        }));
    }
    return results.sort(
      (a, b) => (a.lowestPrice ?? Infinity) - (b.lowestPrice ?? Infinity),
    );
  }, [searchResults, preferredStore]);

  useEffect(() => {
    const channel = supabase
      .channel(`items:${household.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_items",
          filter: `household_id=eq.${household.id}`,
        },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === "INSERT") {
              const next = [...prev, payload.new as Item];
              return next.sort((a, b) =>
                a.checked === b.checked
                  ? a.created_at.localeCompare(b.created_at)
                  : a.checked
                    ? 1
                    : -1,
              );
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((i) =>
                i.id === (payload.new as Item).id ? (payload.new as Item) : i,
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((i) => i.id !== (payload.old as Item).id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, household.id]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      });
      if (!r.ok) throw new Error("search failed");
      const json = await r.json();
      setSearchResults(json.groups || []);
      setShowResults(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setSearchResults([]);
      }
    } finally {
      setSearching(false);
    }
  }, []);

  const handleNameChange = (val: string) => {
    setName(val);
    // Debounce search
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.trim().length >= 2) {
      searchTimeout.current = setTimeout(() => searchProducts(val.trim()), 400);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const addItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setShowResults(false);
    const { error } = await supabase.from("list_items").insert({
      household_id: household.id,
      name: name.trim(),
      qty,
      added_by: userId,
    });
    if (!error) {
      setName("");
      setQty(1);
      setSearchResults([]);
    }
    setBusy(false);
  };

  const addFromSearch = async (group: SearchGroup) => {
    const productName = group.brand
      ? `${group.brand} ${group.name}`
      : group.name;
    setBusy(true);
    setShowResults(false);
    const { error } = await supabase.from("list_items").insert({
      household_id: household.id,
      name: productName,
      qty,
      added_by: userId,
    });
    if (!error) {
      setName("");
      setQty(1);
      setSearchResults([]);
    }
    setBusy(false);
  };

  const toggle = async (it: Item) => {
    setItems((prev) =>
      prev.map((i) => (i.id === it.id ? { ...i, checked: !i.checked } : i)),
    );
    await supabase
      .from("list_items")
      .update({ checked: !it.checked })
      .eq("id", it.id);
  };

  const remove = async (it: Item) => {
    setItems((prev) => prev.filter((i) => i.id !== it.id));
    await supabase.from("list_items").delete().eq("id", it.id);
  };

  const clearChecked = async () => {
    const ids = items.filter((i) => i.checked).map((i) => i.id);
    if (!ids.length) return;
    setItems((prev) => prev.filter((i) => !i.checked));
    await supabase.from("list_items").delete().in("id", ids);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const cleanedPostal = postal.replace(/\s+/g, "").toUpperCase() || null;
    const cleanedRadius = Math.max(1, Math.min(50, Number(radius) || 5));
    const { error } = await supabase
      .from("households")
      .update({ postal_code: cleanedPostal, radius_km: cleanedRadius })
      .eq("id", household.id);
    if (!error) {
      setHousehold({
        ...household,
        postal_code: cleanedPostal,
        radius_km: cleanedRadius,
      });
      setShowSettings(false);
      router.refresh();
    }
    setSavingSettings(false);
  };

  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  return (
    <main className="max-w-xl mx-auto p-5 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-slate-500">
            &larr; Terug
          </Link>
          <h1 className="text-2xl font-bold text-brand-700 truncate">
            {household.name}
          </h1>
          <p className="text-xs text-slate-500">
            Code: <span className="font-mono">{household.invite_code}</span>
            {household.postal_code && (
              <>
                {" "}
                &middot; {household.postal_code} &middot; {household.radius_km} km
              </>
            )}
          </p>
        </div>
        <Link
          href={`/shop?h=${household.id}`}
          className="rounded-xl bg-brand-600 text-white px-3 py-2 text-sm font-semibold whitespace-nowrap"
        >
          Plan winkels &rarr;
        </Link>
      </header>

      <button
        onClick={() => setShowSettings((s) => !s)}
        className="w-full text-left text-sm text-slate-600 underline"
      >
        {showSettings ? "Verberg" : "Locatie-instellingen"}
      </button>

      {showSettings && (
        <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold">Postcode & afstand</h2>
          <p className="text-xs text-slate-500">
            Hiermee filteren we naar winkels binnen je gekozen straal.
          </p>
          <div className="flex gap-2">
            <input
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="bijv. 1011AB"
              maxLength={7}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 uppercase"
            />
            <input
              type="number"
              min={1}
              max={50}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-center"
            />
            <span className="self-center text-sm text-slate-500">km</span>
          </div>
          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="w-full rounded-xl bg-brand-600 text-white font-semibold py-2 disabled:opacity-60"
          >
            {savingSettings ? "Opslaan..." : "Opslaan"}
          </button>
        </section>
      )}

      {/* Add item form with product search */}
      <div ref={resultsRef}>
        <form onSubmit={addItem} className="bg-white rounded-2xl shadow-sm p-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowResults(true);
            }}
            placeholder="Zoek product (bijv. melk, pasta, kaas)"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-3"
            autoFocus
          />
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
            className="w-16 rounded-xl border border-slate-200 px-2 py-3 text-center"
          />
          <button
            disabled={busy || !name.trim()}
            className="rounded-xl bg-brand-600 text-white px-4 font-semibold disabled:opacity-60"
          >
            +
          </button>
        </form>

        {/* Store filter buttons */}
        {availableStores.length > 0 && showResults && (
          <div className="flex gap-2 overflow-x-auto py-2 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setPreferredStore(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition-colors ${
                preferredStore === null
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-200 text-slate-600"
              }`}
            >
              Alle winkels
            </button>
            {availableStores.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setPreferredStore(s.id === preferredStore ? null : s.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition-colors ${
                  preferredStore === s.id
                    ? "bg-brand-600 border-brand-600 text-white"
                    : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Search results */}
        {showResults && (filteredResults.length > 0 || searching) && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-h-80 overflow-y-auto">
            {searching && filteredResults.length === 0 && (
              <div className="p-4 text-center text-sm text-slate-500">
                Zoeken...
              </div>
            )}
            {filteredResults.map((group) => {
              // Show cheapest offers from different stores
              const storeOffers = group.offers
                .sort((a, b) => a.price - b.price)
                .slice(0, 3);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => addFromSearch(group)}
                  className="w-full text-left p-3 flex items-start gap-3 hover:bg-slate-50 active:bg-slate-100 border-b border-slate-100 last:border-b-0"
                >
                  <div className="w-14 h-14 shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                    {group.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={group.imageUrl}
                        alt=""
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-slate-300 text-2xl">?</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight truncate">
                      {group.brand ? `${group.brand} ` : ""}
                      {group.name}
                    </p>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                      {storeOffers.map((offer, i) => (
                        <span
                          key={`${offer.storeId}-${i}`}
                          className={`text-xs ${
                            offer.isCheapest
                              ? "text-green-700 font-semibold"
                              : "text-slate-500"
                          }`}
                        >
                          {offer.storeName} {formatPrice(offer.price)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {group.lowestPrice !== null && (
                    <span className="text-sm font-semibold text-brand-700 whitespace-nowrap">
                      {formatPrice(group.lowestPrice)}
                    </span>
                  )}
                </button>
              );
            })}
            {!searching && filteredResults.length > 0 && (
              <div className="p-2 text-center">
                <button
                  type="button"
                  onClick={addItem}
                  className="text-xs text-slate-500 underline"
                >
                  Of voeg &quot;{name}&quot; handmatig toe
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {open.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Lijst is leeg, voeg iets toe.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {open.map((it) => (
              <SwipeRow key={it.id} onDelete={() => remove(it)}>
                <div className="flex items-center gap-3 p-3">
                  <button
                    onClick={() => toggle(it)}
                    className="w-6 h-6 rounded-full border-2 border-slate-300 shrink-0"
                    aria-label={`Vink ${it.name} af`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{it.name}</p>
                    {it.qty > 1 && (
                      <p className="text-xs text-slate-500">{it.qty}&times;</p>
                    )}
                  </div>
                </div>
              </SwipeRow>
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-sm font-semibold text-slate-500">
              Afgevinkt ({done.length})
            </h3>
            <button
              onClick={clearChecked}
              className="text-xs text-slate-500 underline"
            >
              Verwijder afgevinkte
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {done.map((it) => (
              <SwipeRow key={it.id} onDelete={() => remove(it)}>
                <div className="flex items-center gap-3 p-3 opacity-60">
                  <button
                    onClick={() => toggle(it)}
                    className="w-6 h-6 rounded-full bg-brand-500 text-white text-sm font-bold shrink-0"
                  >
                    &#10003;
                  </button>
                  <p className="flex-1 line-through truncate">{it.name}</p>
                </div>
              </SwipeRow>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-slate-400 text-center">
        Tip: veeg een item naar links om te verwijderen.
      </p>
    </main>
  );
}
