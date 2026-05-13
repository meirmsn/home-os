-- Migration 004 — `card-photos` private bucket + 4 storage.objects RLS policies.
-- Source: specs/supabase-schema-and-rls/spec.md § Data model changes § 004_storage.sql.
--
-- Decision D8: predicate ties bucket_id and first path segment (the user's
-- uuid) to the caller's auth.uid(). storage.foldername(name) returns text[]
-- with 1-based indexing — segment [1] is the leading directory in
-- "<user_uuid>/cards/<card_id>/touchpoints/<touchpoint_id>/<slot>.jpg".

-- Idempotent bucket insert. Re-running migrations against a stack that
-- already has the bucket (partial rollback, repeated `db reset`) is safe.
insert into storage.buckets (id, name, public)
values ('card-photos', 'card-photos', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase. Add bucket-scoped
-- per-action policies.
create policy card_photos_select_own on storage.objects
  for select
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy card_photos_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy card_photos_update_own on storage.objects
  for update
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy card_photos_delete_own on storage.objects
  for delete
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
