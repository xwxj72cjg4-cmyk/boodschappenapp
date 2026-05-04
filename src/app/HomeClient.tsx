"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

type Household = { id: string; name: string; invite_code: string };

export default function HomeClient({
  userEmail,
  userId,
  households,
}: {
  userEmail: string;
  userId: string;
  households: Household[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const createHousehold = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.rpc("create_household", {
        hname: newName.trim(),
      });
      if (e1) throw e1;
      router.refresh();
      setNewName("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as Record<string, unknown>).message) : JSON.stringify(e);
      setError(msg || "Aanmaken mislukt");
    } finally {
      setBusy(false);
    }
  };

  const joinHousehold = async () => {
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      // Look up household by invite_code. RLS only allows reading households
      // you're a member of, so we use an RPC-style filter: insert membership
      // first by code-based lookup via a public function would be cleaner,
      // but for simplicity we let the user self-join by code if it exists.
      const { error: e1 } = await supabase.rpc("join_household_by_code", { code });
      if (e1) throw e1;
      router.refresh();
      setJoinCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Joinen mislukt");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <main className="max-w-xl mx-auto p-5 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">Boodschappen</h1>
          <p className="text-xs text-slate-500">{userEmail}</p>
        </div>
        <button onClick={signOut} className="text-sm text-slate-500 underline">
          Uitloggen
        </button>
      </header>

      <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="font-semibold">Mijn gezinnen</h2>
        {households.length === 0 ? (
          <p className="text-sm text-slate-500">
            Je zit nog niet in een gezin. Maak er een aan, of join met een code.
          </p>
        ) : (
          <ul className="space-y-2">
            {households.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/lijst/${h.id}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 active:bg-slate-100"
                >
                  <span className="font-medium">{h.name}</span>
                  <span className="text-xs text-slate-500">
                    code: {h.invite_code}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="font-semibold">Nieuw gezin</h2>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Bijv. De Familie Braam"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
          />
          <button
            disabled={busy}
            onClick={createHousehold}
            className="rounded-xl bg-brand-600 text-white px-4 py-2 font-semibold disabled:opacity-60"
          >
            Maak
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="font-semibold">Word lid met code</h2>
        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="bijv. a1b2c3d4"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
          />
          <button
            disabled={busy}
            onClick={joinHousehold}
            className="rounded-xl bg-slate-800 text-white px-4 py-2 font-semibold disabled:opacity-60"
          >
            Join
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
