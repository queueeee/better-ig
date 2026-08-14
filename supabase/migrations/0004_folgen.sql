-- Migration 0004: Folgen
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (follower_id, following_id),

  -- Sich selbst zu folgen ergibt keinen Sinn und würde den eigenen Feed
  -- doppelt füllen, weil eigene Beiträge ohnehin erscheinen.
  constraint follows_not_self check (follower_id <> following_id)
);

-- „Wem folge ich?" für den Feed, „wer folgt mir?" fürs Profil.
create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

create policy "follows_select_authenticated"
  on public.follows
  for select to authenticated
  using (true);

create policy "follows_insert_own"
  on public.follows
  for insert to authenticated
  with check ((select auth.uid()) = follower_id);

create policy "follows_delete_own"
  on public.follows
  for delete to authenticated
  using ((select auth.uid()) = follower_id);
