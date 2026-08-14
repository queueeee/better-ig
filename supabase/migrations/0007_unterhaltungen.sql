-- Migration 0007: Unterhaltungen und Teilnehmer
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
--
-- Die Nachrichten selbst kommen in der nächsten Migration, weil ihre Form
-- davon abhängt, ob und wie verschlüsselt wird.

-- ---------------------------------------------------------------------
-- Privates Schema für Hilfsfunktionen
-- ---------------------------------------------------------------------

-- Dieses Schema darf NICHT unter API → Exposed schemas stehen. Es enthält
-- Funktionen, die bewusst an den Zugriffsregeln vorbei arbeiten.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Unterhaltungen
-- ---------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text check (title is null or char_length(title) between 1 and 80),

  -- Für Zweiergespräche: die beiden Nutzer-IDs kanonisch sortiert und
  -- verkettet. Damit verhindert ein Index, dass dieselben zwei Personen
  -- zwei Unterhaltungen bekommen, wenn beide gleichzeitig schreiben.
  dm_key text,

  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Denormalisiert, damit die Übersicht ein einziger Aufruf bleibt statt
  -- einer Abfrage pro Unterhaltung.
  last_message_at timestamptz not null default now(),

  constraint conversations_dm_key_shape check (
    (is_group and dm_key is null) or (not is_group and dm_key is not null)
  )
);

create unique index conversations_dm_key_idx
  on public.conversations (dm_key) where dm_key is not null;
create index conversations_last_message_idx
  on public.conversations (last_message_at desc);

create table public.conversation_participants (
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),

  -- Ungelesen-Zustand: ein Zeitstempel pro Teilnehmer statt einer
  -- Lesemarke pro Nachricht. Das kostet eine Schreiboperation beim
  -- Öffnen statt einer pro Nachricht und Empfänger.
  last_read_at timestamptz not null default 'epoch',

  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx
  on public.conversation_participants (user_id);

-- ---------------------------------------------------------------------
-- Die Hilfsfunktion, ohne die nichts geht
-- ---------------------------------------------------------------------

-- Ohne sie läuft man in Fehler 42P17, unendliche Rekursion: Die Regel für
-- Teilnehmer müsste prüfen, ob man Teilnehmer ist — und diese Prüfung
-- unterliegt wieder derselben Regel. Postgres wendet Zugriffsregeln auch
-- auf Unterabfragen an.
--
-- security definer lässt die Funktion mit den Rechten ihres Eigentümers
-- laufen und damit an den Regeln vorbei. Genau deshalb liegt sie in einem
-- Schema, das die API nicht nach aussen gibt, und prüft ausschliesslich
-- die eigene Teilnahme.
create or replace function private.is_participant(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv
      and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_participant(uuid) from public, anon;
grant execute on function private.is_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Zugriffsregeln
-- ---------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;

create policy "conversations_select_participant"
  on public.conversations
  for select to authenticated
  using (private.is_participant(id));

create policy "conversations_insert_own"
  on public.conversations
  for insert to authenticated
  with check ((select auth.uid()) = created_by);

-- Teilnehmer sieht man nur in eigenen Unterhaltungen.
create policy "participants_select_own_conversations"
  on public.conversation_participants
  for select to authenticated
  using (private.is_participant(conversation_id));

-- Hinzufügen darf man sich selbst — und andere zu Unterhaltungen, in
-- denen man bereits ist. Damit kann niemand Fremde in fremde Gespräche
-- setzen, und das Anlegen einer neuen Unterhaltung funktioniert trotzdem.
create policy "participants_insert"
  on public.conversation_participants
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or private.is_participant(conversation_id)
  );

-- Gehen darf jeder aus eigenem Antrieb.
create policy "participants_delete_self"
  on public.conversation_participants
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Nur die eigene Lesemarke fortschreiben.
create policy "participants_update_own"
  on public.conversation_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Zweiergespräch finden oder anlegen
-- ---------------------------------------------------------------------

-- Als Funktion, weil dabei drei Zeilen in zwei Tabellen entstehen müssen
-- und zwei gleichzeitige Aufrufe sonst zwei Unterhaltungen erzeugen.
create or replace function public.get_or_create_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := (select auth.uid());
  key text;
  conv uuid;
begin
  if me is null then
    raise exception 'Nicht angemeldet';
  end if;
  if other_user = me then
    raise exception 'Mit sich selbst schreiben geht nicht';
  end if;
  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'Unbekanntes Profil';
  end if;

  -- Kanonisch sortiert, damit beide Richtungen denselben Schlüssel ergeben.
  key := least(me::text, other_user::text) || ':' ||
         greatest(me::text, other_user::text);

  select id into conv from public.conversations where dm_key = key;
  if conv is not null then
    return conv;
  end if;

  insert into public.conversations (is_group, dm_key, created_by)
  values (false, key, me)
  on conflict (dm_key) where dm_key is not null do nothing
  returning id into conv;

  -- Hat parallel jemand anderes angelegt, nehmen wir dessen Unterhaltung.
  if conv is null then
    select id into conv from public.conversations where dm_key = key;
    return conv;
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (conv, me), (conv, other_user);

  return conv;
end;
$$;

revoke all on function public.get_or_create_dm(uuid) from public, anon;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
