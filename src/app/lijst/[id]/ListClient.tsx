"use client";

import { useEffect, useMemo, useState } from "react";
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

  const addItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from("list_items").insert({
      household_id: household.id,
      name: name.trim(),
      qty,
      added_by: userId,
    });
    if (!error) {
      setName("");
      setQty(1);
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
            ← Terug
          </Link>
          <h1 className="text-2xl font-bold text-brand-700 truncate">
            {household.name}
          </h1>
          <p className="text-xs text-slate-500">
            Code: <span className="font-mono">{household.invite_code}</span>
            {household.postal_code && (
              <>
                {" "}
                · {household.postal_code} · {household.radius_km} km
              </>
            )}
          </p>
        </div>
        <Link
          href={`/shop?h=${household.id}`}
          className="rounded-xl bg-brand-600 text-white px-3 py-2 text-sm font-semibold whitespace-nowrap"
        >
          Plan winkels →
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

      <form onSubmit={addItem} className="bg-white rounded-2xl shadow-sm p-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bijv. kipfilet gerookt"
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
                      <p className="text-xs text-slate-500">{it.qty}×</p>
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
                    ✓
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
