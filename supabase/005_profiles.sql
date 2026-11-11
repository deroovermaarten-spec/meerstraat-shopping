-- Personal touch per family member: an emoji as profile picture, and what they'd rather not eat.
-- Run once in the Supabase SQL Editor after the other files. Safe to run again.
-- Everyone in the family can already read members; each person can only change their own row ("rename yourself" policy).

alter table public.members add column if not exists emoji text not null default '' check (char_length(emoji) <= 16);
alter table public.members add column if not exists dislikes text[] not null default '{}' check (cardinality(dislikes) <= 30);
