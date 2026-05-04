import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import ShopClient from "./ShopClient";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { h?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdId = searchParams.h;
  if (!householdId) redirect("/");

  const { data: hh } = await supabase
    .from("households")
    .select("id, name, postal_code, radius_km")
    .eq("id", householdId)
    .maybeSingle();
  if (!hh) redirect("/");

  const { data: items } = await supabase
    .from("list_items")
    .select("id, name, qty, checked")
    .eq("household_id", hh.id)
    .eq("checked", false);

  return (
    <ShopClient
      household={{
        id: hh.id,
        name: hh.name,
        postal_code: hh.postal_code,
        radius_km: Number(hh.radius_km),
      }}
      items={(items ?? []).map((i) => ({ id: i.id, name: i.name, qty: i.qty }))}
    />
  );
}
