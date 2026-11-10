-- Adds an optional photo and description to staples (vaste items).
-- Run once in the Supabase SQL Editor after schema.sql. Safe to run again.

alter table public.staples add column if not exists description text not null default '';
alter table public.staples add column if not exists photo_path text;

-- Private bucket; each household's photos live under a folder named after its id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.photo_household(object_name text) returns uuid
language plpgsql immutable as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end $$;

drop policy if exists "household reads photos" on storage.objects;
create policy "household reads photos" on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and public.is_member(public.photo_household(name)));
drop policy if exists "household adds photos" on storage.objects;
create policy "household adds photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_member(public.photo_household(name)));
drop policy if exists "household changes photos" on storage.objects;
create policy "household changes photos" on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.is_member(public.photo_household(name)));
drop policy if exists "household removes photos" on storage.objects;
create policy "household removes photos" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_member(public.photo_household(name)));

-- Only signed-in people need the helper functions.
revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
revoke execute on function public.finish_week(uuid) from public, anon;
revoke execute on function public.new_invite_code(uuid) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
