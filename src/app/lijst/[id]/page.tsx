import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import ListClient from "./ListClient";

export default async function ListPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hh } = await supabase
    .from("households")
    .select("id, name, invite_code, postal_code, radius_km")
    .eq("id", params.id)
    .maybeSingle();

  if (!hh) redirect("/");

  const { data: items } = await supabase
    .from("list_items")
    .select("id, name, qty, checked, added_by, created_at")
    .eq("household_id", hh.id)
    .order("checked", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <ListClient
      household={{
        id: hh.id,
        name: hh.name,
        invite_code: hh.invite_code,
        postal_code: hh.postal_code,
        radius_km: Number(hh.radius_km),
      }}
      initialItems={items ?? []}
      userId={user.id}
    />
  );
}
