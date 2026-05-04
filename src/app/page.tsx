import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("household_members")
    .select("household_id, display_name, households(id, name, invite_code)")
    .eq("user_id", user.id);

  type Row = {
    household_id: string;
    display_name: string | null;
    households: { id: string; name: string; invite_code: string } | null;
  };
  const households = (memberships as Row[] | null)
    ?.map((m) => m.households)
    .filter((h): h is { id: string; name: string; invite_code: string } => !!h) ?? [];

  return (
    <HomeClient
      userEmail={user.email ?? ""}
      userId={user.id}
      households={households}
    />
  );
}
