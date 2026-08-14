-- Migration 0006: Stories
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  image_path text not null,
  image_width integer not null check (image_width between 1 and 20000),
  image_height integer not null check (image_height between 1 and 20000),
  created_at timestamptz not null default now(),

  -- Die Ablaufzeit steht in der Zeile, statt sie beim Lesen aus
  -- created_at zu berechnen. So lässt sie sich indizieren, und eine
  -- spätere Änderung der Dauer betrifft nur neue Stories.
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index stories_expires_idx on public.stories (expires_at);
create index stories_author_created_idx
  on public.stories (author_id, created_at desc);

alter table public.stories enable row level security;

-- Abgelaufene Stories sind schlicht nicht mehr sichtbar. Das erledigt die
-- Zugriffsregel, nicht der Anwendungscode — damit hinkt die Anzeige nie
-- hinterher, auch wenn das Aufräumen später kommt.
create policy "stories_select_active"
  on public.stories
  for select to authenticated
  using (expires_at > now());

create policy "stories_insert_own"
  on public.stories
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

-- Löschen darf man auch abgelaufene eigene — sonst käme man an die
-- Aufräumarbeit gar nicht heran.
create policy "stories_delete_own"
  on public.stories
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- Eigener Bucket, damit sich Lebensdauer und Rechte getrennt regeln lassen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "stories_upload_own_folder"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stories'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "stories_delete_own_folder"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stories'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Liefert die eigenen abgelaufenen Stories, damit die App deren Dateien
-- aus dem Speicher entfernen kann. Postgres kann das nicht selbst — es
-- gibt keine Kaskadierung von der Datenbank in den Bildspeicher.
create or replace function public.own_expired_stories()
returns table (id uuid, image_path text)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, s.image_path
  from public.stories s
  where s.author_id = (select auth.uid())
    and s.expires_at <= now();
$$;
