-- Gift wishlists (cadeaulijstjes): every family member keeps their own list, the others can see it.
-- Others can mark a wish as "ik koop dit"; the owner never sees those marks, so the surprise stays.
-- Run once in the Supabase SQL Editor after schema.sql and 002_photos.sql. Safe to run again.

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  note text not null default '' check (char_length(note) <= 500),
  link text not null default '' check (char_length(link) <= 1000),
  price text not null default '' check (char_length(price) <= 30),
  favourite boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists gifts_household_idx on public.gifts (household_id, owner_id);

-- Who is buying which wish. Kept apart from gifts so the owner can be kept out of it.
create table if not exists public.gift_claims (
  gift_id uuid primary key references public.gifts(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  claimed_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists gift_claims_household_idx on public.gift_claims (household_id);

-- Owner of a gift. SECURITY DEFINER so claim policies can check it without exposing more.
create or replace function public.gift_owner(g uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from gifts where id = g;
$$;
revoke execute on function public.gift_owner(uuid) from public, anon;
grant execute on function public.gift_owner(uuid) to authenticated;

alter table public.gifts enable row level security;
alter table public.gift_claims enable row level security;

-- Everyone in the household sees every list; only the owner adds, changes or removes their own wishes.
drop policy if exists "members read gifts" on public.gifts;
create policy "members read gifts" on public.gifts for select to authenticated using (public.is_member(household_id));
drop policy if exists "owner adds gifts" on public.gifts;
create policy "owner adds gifts" on public.gifts for insert to authenticated
  with check (owner_id = auth.uid() and public.is_member(household_id));
drop policy if exists "owner changes gifts" on public.gifts;
create policy "owner changes gifts" on public.gifts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_member(household_id));
drop policy if exists "owner removes gifts" on public.gifts;
create policy "owner removes gifts" on public.gifts for delete to authenticated using (owner_id = auth.uid());

-- Claims: visible to the household except the gift's owner. You claim for yourself, never your own wish.
drop policy if exists "others read claims" on public.gift_claims;
create policy "others read claims" on public.gift_claims for select to authenticated
  using (public.is_member(household_id) and public.gift_owner(gift_id) is distinct from auth.uid());
drop policy if exists "claim for yourself" on public.gift_claims;
create policy "claim for yourself" on public.gift_claims for insert to authenticated
  with check (claimed_by = auth.uid() and public.is_member(household_id)
    and public.gift_owner(gift_id) is distinct from auth.uid()
    and exists (select 1 from public.gifts g where g.id = gift_id and g.household_id = gift_claims.household_id));
drop policy if exists "drop your claim" on public.gift_claims;
create policy "drop your claim" on public.gift_claims for delete to authenticated using (claimed_by = auth.uid());

-- Live updates in the app.
do $$ begin
  begin alter publication supabase_realtime add table public.gifts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.gift_claims; exception when duplicate_object then null; end;
end $$;
