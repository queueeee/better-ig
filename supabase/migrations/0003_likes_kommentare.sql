-- Migration 0003: Likes und Kommentare
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------

-- Kein eigener Schlüssel: Das Paar aus Beitrag und Nutzer IST der
-- Schlüssel. Damit kann niemand denselben Beitrag zweimal mögen, und
-- doppelte Klicks laufen ins Leere statt Duplikate zu erzeugen — die
-- Datenbank erzwingt die Idempotenz, nicht die Oberfläche.
create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Für „welche dieser Beiträge mag ich?" über eine Liste von Beiträgen.
create index likes_user_post_idx on public.likes (user_id, post_id);

alter table public.likes enable row level security;

create policy "likes_select_authenticated"
  on public.likes
  for select to authenticated
  using (true);

create policy "likes_insert_own"
  on public.likes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "likes_delete_own"
  on public.likes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- Kommentare
-- ---------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),

  constraint comments_body_length
    check (char_length(btrim(body)) between 1 and 1000)
);

-- Kommentare eines Beitrags in Reihenfolge.
create index comments_post_created_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

create policy "comments_select_authenticated"
  on public.comments
  for select to authenticated
  using (true);

create policy "comments_insert_own"
  on public.comments
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

-- Löschen darf der Verfasser des Kommentars — und der Urheber des
-- Beitrags, damit man unter dem eigenen Bild aufräumen kann.
create policy "comments_delete_own_or_post_owner"
  on public.comments
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.posts
      where posts.id = comments.post_id
        and posts.author_id = (select auth.uid())
    )
  );

-- Kein Update: Ein Kommentar bleibt, wie er geschrieben wurde. Wer sich
-- vertippt hat, löscht ihn und schreibt neu.
