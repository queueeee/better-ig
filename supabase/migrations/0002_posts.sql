-- Migration 0002: Beiträge und Bildspeicher
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------
-- Beiträge
-- ---------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,

  -- Pfad im Bucket, nicht die volle URL: Die Domain des Projekts gehört
  -- nicht in die Daten, sonst bricht ein Umzug jeden Beitrag.
  image_path text not null,

  -- Seitenverhältnis, damit der Feed die Fläche reservieren kann, bevor
  -- das Bild geladen ist. Ohne das springt beim Laden das halbe Layout.
  image_width integer not null check (image_width between 1 and 20000),
  image_height integer not null check (image_height between 1 and 20000),

  caption text check (caption is null or char_length(caption) <= 2200),
  created_at timestamptz not null default now()
);

-- Der Feed sortiert nach Zeit, absteigend.
create index posts_created_at_idx on public.posts (created_at desc);
create index posts_author_created_idx on public.posts (author_id, created_at desc);

alter table public.posts enable row level security;

create policy "posts_select_authenticated"
  on public.posts
  for select to authenticated
  using (true);

create policy "posts_insert_own"
  on public.posts
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

create policy "posts_delete_own"
  on public.posts
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- Kein Update: Ein Beitrag ist ein Beitrag. Wer die Bildunterschrift
-- ändern will, bekommt das später als eigene, eng gefasste Policy.

-- ---------------------------------------------------------------------
-- Bildspeicher
-- ---------------------------------------------------------------------

-- Öffentlicher Bucket: Die Bilder sind für alle Angemeldeten ohnehin
-- sichtbar, und öffentliche URLs sind zwischenspeicherbar. Signierte URLs
-- würden pro Bild einen Serveraufruf kosten und nach Ablauf brechen —
-- der Zugewinn wäre gering, weil der Pfad die einzige Hürde bliebe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posts',
  'posts',
  true,
  5242880, -- 5 MB; der Client verkleinert vorher auf 200-400 KB
  -- JPEG zuerst und als einziges Ausgabeformat des Clients: Safari kann
  -- canvas.toBlob mit image/webp bis heute nicht und fällt dabei still auf
  -- PNG zurück — was die Datei um ein Vielfaches vergrössert, statt sie zu
  -- verkleinern. PNG und WebP bleiben erlaubt, damit direkt hochgeladene
  -- Dateien anderer Herkunft nicht abgelehnt werden.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Schreiben nur in den eigenen Ordner. Der erste Pfadabschnitt ist die
-- Nutzer-ID: posts/<uid>/<dateiname>. storage.foldername() liefert die
-- Abschnitte als Array, [1] ist der erste.
create policy "posts_upload_own_folder"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "posts_delete_own_folder"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Lesen erlaubt der öffentliche Bucket bereits; eine select-Policy wäre
-- nur für einen privaten Bucket nötig.
