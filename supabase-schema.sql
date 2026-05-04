-- Run this in Supabase SQL editor (Database -> SQL editor -> New query) to set up tables.
-- Then enable Email auth in Authentication -> Providers (it is on by default).

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  postal_code text,
  radius_km numeric not null default 5,
  created_at timestamptz default now()
);

-- Idempotent upgrade for existing schemas
alter table households add column if not exists postal_code text;
alter table households add column if not exists radius_km numeric not null default 5;

create table if not exists household_members (
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now(),
  primary key (household_id, user_id)
);

create table if not exists list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  qty int not null default 1,
  checked boolean not null default false,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists list_items_household_idx on list_items(household_id, checked, created_at);

-- Row Level Security
alter table households enable row level security;
alter table household_members enable row level security;
alter table list_items enable row level security;

-- Helper: is the current user a member of this household?
create or replace function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

drop policy if exists "members read households" on households;
create policy "members read households" on households
  for select using (public.is_member(id));

drop policy if exists "users create households" on households;
create policy "users create households" on households
  for insert with check (auth.uid() is not null);

drop policy if exists "members update households" on households;
create policy "members update households" on households
  for update using (public.is_member(id));

drop policy if exists "members read membership" on household_members;
create policy "members read membership" on household_members
  for select using (user_id = auth.uid() or public.is_member(household_id));

drop policy if exists "users join households" on household_members;
create policy "users join households" on household_members
  for insert with check (user_id = auth.uid());

drop policy if exists "users leave households" on household_members;
create policy "users leave households" on household_members
  for delete using (user_id = auth.uid());

drop policy if exists "members read items" on list_items;
create policy "members read items" on list_items
  for select using (public.is_member(household_id));

drop policy if exists "members add items" on list_items;
create policy "members add items" on list_items
  for insert with check (public.is_member(household_id) and added_by = auth.uid());

drop policy if exists "members update items" on list_items;
create policy "members update items" on list_items
  for update using (public.is_member(household_id));

drop policy if exists "members delete items" on list_items;
create policy "members delete items" on list_items
  for delete using (public.is_member(household_id));

-- Realtime: enable replication for list_items so the app gets live updates
alter publication supabase_realtime add table list_items;

-- Join a household by its invite code. Bypasses the SELECT-only-members RLS
-- so users can join with a code they don't yet have access to.
create or replace function public.join_household_by_code(code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
begin
  select id into hid from households where invite_code = lower(code) limit 1;
  if hid is null then
    raise exception 'invalid invite code';
  end if;
  insert into household_members (household_id, user_id)
  values (hid, auth.uid())
  on conflict do nothing;
  return hid;
end;
$$;

grant execute on function public.join_household_by_code(text) to authenticated;
