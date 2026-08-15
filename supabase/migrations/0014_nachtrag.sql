-- Migration 0014: Nachtrag zu 0010 und Berichtigung von 0013
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
-- Die Datei als GANZES einfügen.
--
-- Diese Migration ist absichtlich WIEDERHOLBAR: Jede Anweisung darf
-- mehrfach laufen, ohne etwas kaputtzumachen. Sie räumt einen Zustand auf,
-- über den man sich nicht sicher sein kann.
--
-- ---------------------------------------------------------------------
-- Teil 1: Was von 0010 nie ankam
-- ---------------------------------------------------------------------
--
-- 0010 wurde nach einer Prüfung nachgebessert, angewendet wurde aber die
-- Fassung von davor. Aufgefallen ist das erst durch scripts/pruefe-regeln.mjs:
-- Dort liess sich die Lesemarke auf 'infinity' setzen, obwohl die Datei eine
-- Klemme dagegen enthält.
--
-- Das ist die eigentliche Lehre aus dieser Migration: Eine Datei im Repo ist
-- kein Beleg dafür, was in der Datenbank steht. Solange Migrationen von Hand
-- eingefügt werden, ist die einzige Wahrheit eine Abfrage.

-- --- Kaskaden-Indizes ------------------------------------------------
--
-- Postgres führt eine Kaskade als Suche über die Kindtabelle aus; ohne
-- Index ist das je ein vollständiger Scan. Entliken ist der häufigste
-- Schreibvorgang der App, und ein Beitrag mit 300 Likes löst beim Löschen
-- 300 Kaskaden in EINER Transaktion aus — gegen ein Zeitlimit von acht
-- Sekunden.
create index if not exists notifications_like_fk_idx
  on public.notifications (like_post_id, like_actor_id)
  where like_post_id is not null;

create index if not exists notifications_comment_idx
  on public.notifications (comment_id)
  where comment_id is not null;

create index if not exists notifications_follower_idx
  on public.notifications (follow_follower_id)
  where follow_follower_id is not null;

-- --- Formbedingung mit else ------------------------------------------
--
-- Ein case ohne else liefert bei einem unbekannten typ NULL, und CHECK
-- wertet NULL als ERFÜLLT. Heute unerreichbar, weil die Bedingung an typ
-- schon greift — aber wer später einen vierten Typ ergänzt und nur jene
-- erweitert, hätte für ihn still gar keine Formprüfung mehr.
alter table public.notifications
  drop constraint if exists notifications_shape;

alter table public.notifications
  add constraint notifications_shape check (
    case typ
      when 'like' then
        like_post_id is not null and like_actor_id is not null
        and comment_id is null and follow_follower_id is null
      when 'kommentar' then
        comment_id is not null
        and like_post_id is null and like_actor_id is null
        and follow_follower_id is null
      when 'folgt' then
        follow_follower_id is not null
        and like_post_id is null and like_actor_id is null
        and comment_id is null
      else false
    end
  );

-- --- Lesemarke: Klemme und Notausgang ---------------------------------
--
-- Ohne die Klemme setzt sich jeder seine Marke auf 'infinity' und hat
-- dauerhaft "alles gelesen" — ein Zustand, aus dem er ohne Hilfe nicht
-- mehr herauskommt. Genau das war in der Datenbank möglich.
drop policy if exists "notification_state_update_own" on public.notification_state;

create policy "notification_state_update_own"
  on public.notification_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and read_at <= now());

-- Anlegen darf man nur die eigene Zeile, und nur mit einer Marke in der
-- Vergangenheit. Im Normalfall braucht das niemand — der Trigger legt sie
-- beim Anlegen des Profils an. Die Regel ist der Notausgang, falls sie
-- doch einmal fehlt.
drop policy if exists "notification_state_insert_own" on public.notification_state;

create policy "notification_state_insert_own"
  on public.notification_state
  for insert to authenticated
  with check (user_id = (select auth.uid()) and read_at <= now());

-- Marken, die schon in der Zukunft stehen, zurückholen. Ohne das bliebe
-- die Glocke bei den Betroffenen für immer auf null.
update public.notification_state
set read_at = now()
where read_at > now();

-- --- Lesemarke als Upsert --------------------------------------------
--
-- Fehlte die Zeile, traf ein Update null Zeilen, PostgREST meldete
-- trotzdem Erfolg, und die Glocke stünde von da an dauerhaft auf
-- ungelesen — ohne dass der Nutzer sich selbst befreien könnte.
create or replace function public.benachrichtigungen_gelesen(bis timestamptz)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.notification_state (user_id, read_at)
  values ((select auth.uid()), bis)
  on conflict (user_id) do update
  set read_at = greatest(notification_state.read_at, excluded.read_at);
$$;

revoke all on function public.benachrichtigungen_gelesen(timestamptz)
  from public, anon;
grant execute on function public.benachrichtigungen_gelesen(timestamptz)
  to authenticated;

-- --- Nachrichtenzähler ab Beitritt ------------------------------------
--
-- last_read_at steht per Vorgabe auf 'epoch' (0007:57). Wer einer Gruppe
-- mit 5000 alten Nachrichten hinzugefügt wird, sähe sonst sofort "5000".
create or replace function public.ungelesene_nachrichten()
returns integer
language sql
security invoker
stable
set search_path = ''
as $$
  select count(*)::int
  from public.messages m
  join public.conversation_participants p
    on p.conversation_id = m.conversation_id
   and p.user_id = (select auth.uid())
  where m.created_at > greatest(p.last_read_at, p.joined_at)
    and m.sender_id <> (select auth.uid());
$$;

revoke all on function public.ungelesene_nachrichten() from public, anon;
grant execute on function public.ungelesene_nachrichten() to authenticated;

-- ---------------------------------------------------------------------
-- Teil 2: 0013 machte Kontolöschungen unmöglich
-- ---------------------------------------------------------------------
--
-- conversation_keys.sender_id hängt per "on delete set null" an profiles,
-- und profiles hängt per "on delete cascade" an auth.users (0001:11).
--
-- Löscht jemand sein Konto, führt Postgres auf jeder Schlüsselzeile, die
-- er abgelegt hat, ein "update ... set sender_id = null" aus. Dabei werden
-- CHECK-Bedingungen ausgewertet — signature bleibt aber stehen. Die
-- Bedingung aus 0013 lautete
--
--   check ((sender_id is null) = (signature is null))
--
-- und ergibt dann (true) = (false), also 23514. Die gesamte
-- Löschtransaktion bricht ab: Wer je auf "Nachricht" geklickt hat, kann
-- sein Konto nicht mehr löschen.
--
-- Die Bedingung muss also asymmetrisch sein. Verboten bleibt "Absender
-- ohne Unterschrift" — das war der Fall, um den es ging, denn eine solche
-- Zeile sähe im Browser aus wie Altbestand. Erlaubt wird "Unterschrift
-- ohne Absender", denn genau das ist der Zustand nach einer Kontolöschung:
-- die Unterschrift bleibt, nur nachrechnen kann sie niemand mehr.
alter table public.conversation_keys
  drop constraint if exists conversation_keys_herkunft_paarweise;

alter table public.conversation_keys
  add constraint conversation_keys_herkunft
  check (sender_id is null or signature is not null);

-- ---------------------------------------------------------------------
-- Danach prüfen
-- ---------------------------------------------------------------------
--
-- Nicht auf diese Datei vertrauen, sondern nachsehen:
--
--   npm run regeln
--
-- Erwartet: "Alle Regeln halten." Meldet es weiterhin die Lesemarke, ist
-- diese Migration nicht durchgelaufen.
--
-- Und im SQL-Editor, wenn du es genau wissen willst:
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid in ('public.notifications'::regclass,
--                      'public.conversation_keys'::regclass)
--     and contype = 'c';
--
--   select policyname, with_check from pg_policies
--   where tablename = 'notification_state';
--
--   select indexname from pg_indexes
--   where tablename = 'notifications' order by indexname;
