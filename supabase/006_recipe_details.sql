-- Richer recipes: a photo, the preparation steps, servings and time. Filled in by hand or by pasting a link.
-- Run once in the Supabase SQL Editor after 004_menu.sql. Safe to run again.

alter table public.recipes add column if not exists steps text[] not null default '{}' check (cardinality(steps) <= 60);
alter table public.recipes add column if not exists photo_url text not null default '' check (char_length(photo_url) <= 1000);
alter table public.recipes add column if not exists servings int check (servings between 1 and 99);
alter table public.recipes add column if not exists minutes int check (minutes between 1 and 2880);
