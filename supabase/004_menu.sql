-- Weekmenu: a family list of favourite recipes, and per day which one you eat.
-- Run once in the Supabase SQL Editor after schema.sql (and the other numbered files). Safe to run again.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  ingredients text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 1000),
  link text not null default '' check (char_length(link) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists recipes_household_idx on public.recipes (household_id);

-- One evening meal per day: a recipe from the list, or a short free text ("restjes", "uit eten").
create table if not exists public.meals (
  household_id uuid not null references public.households(id) on delete cascade,
  day date not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  note text not null default '' check (char_length(note) <= 80),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, day)
);
create index if not exists meals_recipe_idx on public.meals (recipe_id);

alter table public.recipes enable row level security;
alter table public.meals enable row level security;

-- Everyone in the household can read and change the recipes and the menu.
drop policy if exists "members use recipes" on public.recipes;
create policy "members use recipes" on public.recipes for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists "members use meals" on public.meals;
create policy "members use meals" on public.meals for all to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id)
    and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = meals.household_id)));

-- Live updates in the app.
do $$ begin
  begin alter publication supabase_realtime add table public.recipes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.meals; exception when duplicate_object then null; end;
end $$;
