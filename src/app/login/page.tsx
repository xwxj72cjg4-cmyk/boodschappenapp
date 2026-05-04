"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split("@")[0] } },
        });
        if (error) throw error;
        setError("Check je mail om je account te bevestigen, log dan in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold text-brand-700">
          {mode === "signin" ? "Inloggen" : "Account aanmaken"}
        </h1>
        <p className="text-sm text-slate-600">
          {mode === "signin"
            ? "Log in om jullie gezamenlijke boodschappenlijst te zien."
            : "Maak een account aan en nodig je gezin straks uit met een code."}
        </p>
        {mode === "signup" && (
          <input
            type="text"
            placeholder="Je naam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
        )}
        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 text-white font-semibold py-3 disabled:opacity-60"
        >
          {loading ? "Bezig..." : mode === "signin" ? "Inloggen" : "Account aanmaken"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-sm text-brand-700 underline"
        >
          {mode === "signin"
            ? "Nog geen account? Maak er een aan"
            : "Al een account? Inloggen"}
        </button>
      </form>
    </main>
  );
}
