-- Meerstraat Boodschappen: database schema for Supabase.
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- It is safe to run again: it only creates what is missing.

create extension if not exists pgcrypto;

-- A household (gezin) groups the people who share one shopping list.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  current_week uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  started_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  cat text not null default 'other',
  shops text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  qty text not null default '',
  cat text not null default 'other',
  shops text[] not null default '{}',
  done boolean not null default false,
  done_shop text not null default '',
  added_by uuid references auth.users(id) on delete set null,
  done_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create index if not exists items_household_idx on public.items (household_id, week_id);
create index if not exists staples_household_idx on public.staples (household_id);
create index if not exists weeks_household_idx on public.weeks (household_id);

-- Membership check used by every policy. SECURITY DEFINER so it can read members without recursion.
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.weeks enable row level security;
alter table public.staples enable row level security;
alter table public.items enable row level security;

drop policy if exists "members read household" on public.households;
create policy "members read household" on public.households for select using (public.is_member(id));

drop policy if exists "members read members" on public.members;
create policy "members read members" on public.members for select using (public.is_member(household_id));
drop policy if exists "rename yourself" on public.members;
create policy "rename yourself" on public.members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members use weeks" on public.weeks;
create policy "members use weeks" on public.weeks for select using (public.is_member(household_id));

drop policy if exists "members use staples" on public.staples;
create policy "members use staples" on public.staples for all using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "members use items" on public.items;
create policy "members use items" on public.items for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Start a new household and its first week; the caller becomes its first member.
create or replace function public.create_household(household_name text, my_name text) returns public.households
language plpgsql security definer set search_path = public as $$
declare h households; w uuid;
begin
  if auth.uid() is null then raise exception 'Niet aangemeld'; end if;
  insert into households(name) values (coalesce(nullif(trim(household_name), ''), 'Ons gezin')) returning * into h;
  insert into members(household_id, user_id, display_name) values (h.id, auth.uid(), trim(my_name));
  insert into weeks(household_id) values (h.id) returning id into w;
  update households set current_week = w where id = h.id returning * into h;
  return h;
end $$;

-- Join an existing household with its invite code.
create or replace function public.join_household(code text, my_name text) returns public.households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'Niet aangemeld'; end if;
  select * into h from households where invite_code = upper(trim(code));
  if h.id is null then raise exception 'Onbekende gezinscode'; end if;
  insert into members(household_id, user_id, display_name) values (h.id, auth.uid(), trim(my_name))
    on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end $$;

-- Close the current week: bought items stay in history, unticked items move to the new week.
create or replace function public.finish_week(h uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare old uuid; nw uuid;
begin
  if not is_member(h) then raise exception 'Geen lid van dit gezin'; end if;
  select current_week into old from households where id = h for update;
  insert into weeks(household_id) values (h) returning id into nw;
  if old is not null then
    update weeks set closed_at = now() where id = old;
    update items set week_id = nw where week_id = old and not done;
  end if;
  update households set current_week = nw where id = h;
  return nw;
end $$;

-- Make a fresh invite code (e.g. after sharing the old one too widely).
create or replace function public.new_invite_code(h uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
begin
  if not is_member(h) then raise exception 'Geen lid van dit gezin'; end if;
  update households set invite_code = c where id = h;
  return c;
end $$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.finish_week(uuid) to authenticated;
grant execute on function public.new_invite_code(uuid) to authenticated;

-- Live updates in the app.
do $$ begin
  begin alter publication supabase_realtime add table public.items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.staples; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.households; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
end $$;
