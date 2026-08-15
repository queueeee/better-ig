-- Migration 0010: Benachrichtigungen
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
--
-- Die Datei als GANZES einfügen, nicht abschnittsweise. Der SQL-Editor
-- packt ein Skript in eine Transaktion; bricht etwas ab, rollt alles
-- zurück und es bleibt kein halber Zustand übrig. Wer einzelne Blöcke
-- herauskopiert, verliert genau diese Garantie.
--
-- Ein zweiter Lauf bricht sofort an der ersten create-table-Anweisung ab
-- (42P07, Relation existiert bereits) und ändert nichts. Das ist gewollt.

-- ---------------------------------------------------------------------
-- Die Tabelle
-- ---------------------------------------------------------------------

-- Eine Zeile pro Ereignis, nicht eine verdichtete Zeile mit Zähler.
--
-- Der Grund ist der Echtzeitzähler: Ein Realtime-Ereignis liefert in
-- payload.old nur die Schlüsselspalten, nicht den alten Zählerstand. Aus
-- einem UPDATE lässt sich daher kein Delta ableiten. Eine Zeile pro
-- Ereignis bedeutet dagegen immer genau "+1".
--
-- Der zweite Grund: "neuer Follower" hat kein Bezugsobjekt. Beim
-- verdichteten Modell wäre der Verdichtungsschlüssel null, und ein
-- Unique-Index behandelt null-Werte als verschieden — der Upsert
-- verdichtete dort still gar nicht.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),

  -- Der Empfänger, nicht der Urheber.
  user_id uuid not null references public.profiles (id) on delete cascade,

  typ text not null check (typ in ('like', 'kommentar', 'folgt')),
  created_at timestamptz not null default now(),

  -- Pro Ereignisart ein eigener Spaltensatz, der an seiner Quelle hängt.
  -- Die Kaskaden erledigen das Aufräumen ohne eine Zeile Code: Like
  -- zurückgenommen, Kommentar gelöscht, Beitrag gelöscht, Konto gelöscht
  -- — die Benachrichtigung geht mit.
  like_post_id uuid,
  like_actor_id uuid,
  comment_id uuid references public.comments (id) on delete cascade,

  -- Zeigt bewusst auf profiles und NICHT auf follows: Entfolgen soll die
  -- Benachrichtigung nicht rückwirkend löschen. "ben ist dir gefolgt"
  -- bleibt wahr, es ist passiert.
  follow_follower_id uuid references public.profiles (id) on delete cascade,

  constraint notifications_like_fk
    foreign key (like_post_id, like_actor_id)
    references public.likes (post_id, user_id) on delete cascade,

  constraint notifications_shape check (
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
      -- Ohne dieses else liefert das case bei einem unbekannten typ NULL,
      -- und eine CHECK-Bedingung wertet NULL als ERFÜLLT. Heute kann das
      -- nicht eintreten, weil die Bedingung an typ oben schon auf drei
      -- Werte einschränkt. Wer aber später einen vierten Typ ergänzt und
      -- nur jene Bedingung erweitert, hätte für ihn still gar keine
      -- Formprüfung mehr — ohne Fehlermeldung, und nur an falschen Daten
      -- erkennbar.
      else false
    end
  )
);

-- KEINE Textspalte, und das ist Absicht.
--
-- Hier würde später jemand eine Vorschau einbauen ("anna schrieb: …").
-- Bei einer Direktnachricht stünde damit der Klartext einer
-- Ende-zu-Ende-verschlüsselten Nachricht in der Datenbank, und das
-- Versprechen der App wäre still gebrochen. Anzeigetexte werden beim
-- Lesen aus den Quelltabellen geholt.
comment on table public.notifications is
  'Ein Ereignis pro Zeile. Enthält bewusst keine Inhalte, nur Verweise.';

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Für die 24-Stunden-Sperre beim Folgen.
create index notifications_folgt_idx
  on public.notifications (user_id, follow_follower_id, created_at desc)
  where typ = 'folgt';

-- Ein Index je kaskadierendem Fremdschlüssel. Postgres führt eine Kaskade
-- als "delete from notifications where <spalte> = $1" aus, einmal pro
-- gelöschter Elternzeile — ohne Index also je ein vollständiger Scan.
--
-- Das Zurücknehmen eines Likes ist der häufigste Schreibvorgang dieser
-- App, und das Löschen eines Beitrags mit 300 Likes löst 300 solcher
-- Kaskaden in EINER Transaktion aus. Supabase deckelt Anweisungen der
-- Rolle authenticated bei acht Sekunden; ohne diese Indizes bricht
-- irgendwann das Entliken selbst ab.
--
-- notifications_folgt_idx hilft dabei nicht: Die Kaskade fragt ohne
-- "typ = 'folgt'" an, das Indexprädikat ist also nicht impliziert, und
-- follow_follower_id steht dort nicht an erster Stelle.
create index notifications_like_fk_idx
  on public.notifications (like_post_id, like_actor_id)
  where like_post_id is not null;

create index notifications_comment_idx
  on public.notifications (comment_id)
  where comment_id is not null;

create index notifications_follower_idx
  on public.notifications (follow_follower_id)
  where follow_follower_id is not null;

-- ---------------------------------------------------------------------
-- Zugriffsregeln
-- ---------------------------------------------------------------------

alter table public.notifications enable row level security;

-- Hier bewusst NICHT das Hausmuster "using (true)", das fünf der acht
-- übrigen Tabellen verwenden. Wer wen mag, wer wem folgt und wer wann
-- online war, ergäbe zusammen ein Bewegungsprofil. Bitte nicht
-- "vereinheitlichen".
create policy "notifications_select_own"
  on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Löschen darf man die eigenen — daran hängt das Aufräumen beim Lesen.
create policy "notifications_delete_own"
  on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Kein insert, kein update: Zeilen entstehen ausschliesslich per Trigger.

-- ---------------------------------------------------------------------
-- Die drei Trigger
-- ---------------------------------------------------------------------

-- security definer, weil die Zeile einem ANDEREN Nutzer gehört als dem,
-- der sie auslöst — unter dessen Rechten verbietet die Regel oben das
-- Einfügen.
--
-- Wichtig, damit niemand das falsch nachbaut: security definer umgeht die
-- Zugriffsregeln NICHT von sich aus. Es wechselt nur auf den Eigentümer,
-- hier postgres — und der ist von RLS ausgenommen, solange niemand
-- "force row level security" setzt. Der Insert gelingt also wegen der
-- EIGENTÜMERSCHAFT, nicht wegen security definer.
--
-- Daraus folgt eine Warnung: Ein "alter table public.notifications force
-- row level security" sieht nach sinnvoller Härtung aus (die Tabelle hat
-- ja keine insert-Regel) und würde alle drei Trigger sofort scheitern
-- lassen — damit wären Liken, Kommentieren und Folgen kaputt. Bei
-- notification_state bräche sogar die Profilanlage beim Registrieren.
--
-- search_path = '' statt = public: Bei "public" durchsucht Postgres
-- pg_temp implizit zuerst, und eine untergeschobene Tabelle dort würde
-- die echte verdecken. 0005:89 und 0006:80 machen das noch anders; dort
-- ist es harmlos (security invoker), hier wäre es es nicht. Nicht
-- kopieren.
--
-- Der Urheber kommt IMMER aus NEW.*, nie aus auth.uid(). Dass auth.uid()
-- in einem security-definer-Trigger den Auslösenden liefert, ist nirgends
-- dokumentiert. Der Nebeneffekt ist wertvoll: Damit lösen auch Einfügungen
-- aus dem SQL-Editor echte Benachrichtigungen aus, wo auth.uid() null ist.

create or replace function public.notify_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  empfaenger uuid;
begin
  select author_id into empfaenger
  from public.posts where id = new.post_id;

  -- Sich selbst zu benachrichtigen ergibt keinen Sinn.
  if empfaenger is null or empfaenger = new.user_id then
    return new;
  end if;

  insert into public.notifications (user_id, typ, like_post_id, like_actor_id)
  values (empfaenger, 'like', new.post_id, new.user_id);

  return new;
end;
$$;

create or replace function public.notify_kommentar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  empfaenger uuid;
begin
  select author_id into empfaenger
  from public.posts where id = new.post_id;

  if empfaenger is null or empfaenger = new.author_id then
    return new;
  end if;

  insert into public.notifications (user_id, typ, comment_id)
  values (empfaenger, 'kommentar', new.id);

  return new;
end;
$$;

create or replace function public.notify_folgt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Den Selbstfall deckt bereits die Bedingung follows_not_self (0004:14).

  -- Entfolgen räumt die Benachrichtigung nicht weg (siehe oben). Ohne
  -- Sperre erzeugte Entfolgen-und-wieder-Folgen in Schleife beliebig
  -- viele Einträge und liesse die Glocke jedes Mal hochspringen.
  if exists (
    select 1 from public.notifications
    where user_id = new.following_id
      and typ = 'folgt'
      and follow_follower_id = new.follower_id
      and created_at > now() - interval '24 hours'
  ) then
    return new;
  end if;

  insert into public.notifications (user_id, typ, follow_follower_id)
  values (new.following_id, 'folgt', new.follower_id);

  return new;
end;
$$;

-- Ausschliesslich "after insert", nie "after insert or update":
-- app/actions.ts:37 und :119 benutzen upsert, ein "or update" erzeugte
-- also bei jedem zweiten Klick auf denselben Knopf eine neue Zeile.
create trigger likes_notify_trigger
  after insert on public.likes
  for each row execute function public.notify_like();

create trigger comments_notify_trigger
  after insert on public.comments
  for each row execute function public.notify_kommentar();

create trigger follows_notify_trigger
  after insert on public.follows
  for each row execute function public.notify_folgt();

-- Diese drei Funktionen behalten bewusst ihr implizites execute für
-- PUBLIC, anders als die RPC-Funktionen weiter unten. Ausnutzbar ist es
-- nicht: Eine Funktion mit Rückgabetyp trigger lässt sich nicht aus einem
-- Ausdruck heraus aufrufen, und PostgREST nimmt sie gar nicht erst in
-- seinen Schema-Cache auf.
--
-- Entzogen wird es trotzdem nicht, weil sich hier ohne laufende Datenbank
-- nicht belegen liess, ob Postgres beim Auslösen eines Triggers das
-- execute-Recht des AUSLÖSENDEN prüft. Täte es das, bräche ein revoke das
-- Liken für alle — ein Risiko ohne Gegenwert.

-- Bewusst ohne "exception when others then return new": Ein stiller
-- Handler liesse Benachrichtigungen spurlos verschwinden, und in einer
-- App ohne Testverzeichnis wäre das nicht zu finden. Der Preis ist, dass
-- ein Fehler hier das Liken bricht — vertretbar bei zehn Zeilen
-- deterministischem SQL, das den Nachrichtenpfad nicht berührt.

-- ---------------------------------------------------------------------
-- Lesemarke
-- ---------------------------------------------------------------------

-- Eigene Tabelle statt einer Spalte auf profiles: dort gilt
-- "select using (true)" (0001:33-36). Die Marke wäre damit ein für jeden
-- Angemeldeten abfragbares Anwesenheitsprotokoll — und über
-- profiles_update_own vom Nutzer selbst in die Zukunft setzbar.
create table public.notification_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  read_at timestamptz not null default 'epoch'
);

alter table public.notification_state enable row level security;

create policy "notification_state_select_own"
  on public.notification_state
  for select to authenticated
  using (user_id = (select auth.uid()));

-- read_at <= now() ist die eigentliche Absicherung, nicht das Fehlen
-- einer INSERT-Regel.
--
-- Ohne diese Klemme könnte jeder seine eigene Marke per PATCH auf
-- 'infinity' setzen und hätte dauerhaft "alles gelesen". Das schadet nur
-- ihm selbst — fremde Zeilen sind unerreichbar, und die Benachrichtigungen
-- blieben lesbar —, aber es wäre ein Zustand, aus dem er ohne Hilfe nicht
-- mehr herauskäme.
create policy "notification_state_update_own"
  on public.notification_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and read_at <= now());

-- Anlegen darf man nur die eigene Zeile, und nur mit einer Marke in der
-- Vergangenheit. Im Normalfall braucht das niemand: Der Trigger unten legt
-- sie beim Anlegen des Profils an. Die Regel ist der Notausgang, falls
-- die Zeile doch einmal fehlt — ohne sie liefe benachrichtigungen_gelesen
-- still ins Leere, die Glocke stünde dauerhaft auf ungelesen, und niemand
-- könnte das reparieren.
create policy "notification_state_insert_own"
  on public.notification_state
  for insert to authenticated
  with check (user_id = (select auth.uid()) and read_at <= now());

create or replace function public.notification_state_anlegen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_notification_state_trigger
  after insert on public.profiles
  for each row execute function public.notification_state_anlegen();

-- Bestehende Profile nachziehen.
insert into public.notification_state (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- Lesemarken fortschreiben
-- ---------------------------------------------------------------------

-- Beide Marken wandern nur vorwärts. Nie aus now(): Zeitstempel folgen
-- nicht der Commit-Reihenfolge, und was zwischen Lesen und Schreiben
-- committet, wäre dauerhaft verschluckt. greatest() schützt zugleich
-- gegen zwei offene Tabs, die in unterschiedlicher Reihenfolge
-- zurückmelden.
--
-- Beide security INVOKER: Damit greifen die Regeln oben, und auth.uid()
-- verhält sich wie überall sonst. security definer wird hier nicht
-- gebraucht — über PostgREST liesse sich nur greatest() nicht ausdrücken.

-- Als Upsert und nicht als blosses Update: Fehlte die Zeile, träfe ein
-- Update null Zeilen, PostgREST meldete trotzdem Erfolg, und die Glocke
-- stünde von da an dauerhaft auf ungelesen — ein Fehler, aus dem sich der
-- Nutzer nicht selbst befreien könnte. Der Trigger unten und der Backfill
-- decken heute jedes Profil ab; das hier ist der Riegel dafür, dass eine
-- Lücke in dieser Annahme keine Einbahnstrasse wird.
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

-- Behebt nebenbei einen bestehenden Fehler: last_read_at wurde bisher nur
-- gelesen (lib/nachrichten.ts:50,104) und nirgends geschrieben. Der
-- Ungelesen-Punkt neben jeder Unterhaltung stand deshalb dauerhaft an.
create or replace function public.unterhaltung_gelesen(
  conv uuid,
  bis timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.conversation_participants
  set last_read_at = greatest(last_read_at, bis)
  where conversation_id = conv
    and user_id = (select auth.uid());
$$;

revoke all on function public.unterhaltung_gelesen(uuid, timestamptz)
  from public, anon;
grant execute on function public.unterhaltung_gelesen(uuid, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------
-- Ungelesene Nachrichten zählen
-- ---------------------------------------------------------------------

-- security invoker, damit die Regel messages_select_participant greift.
-- Eigene Nachrichten zählen nicht mit — sonst erhöhte das Senden den
-- eigenen Zähler.
--
-- greatest(last_read_at, joined_at) statt nur last_read_at: Die Lesemarke
-- steht per Vorgabe auf 'epoch' (0007:57). Wer einer Gruppe mit 5000
-- alten Nachrichten hinzugefügt wird, sähe sonst im selben Moment "5000"
-- an der Glocke — für ein Gespräch, das er gerade erst betreten hat.
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
-- Echtzeit
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.notifications;

-- replica identity bleibt auf "default". Das ist keine Auslassung,
-- sondern die Bedingung dafür, dass ein Lösch-Ereignis nur den
-- Primärschlüssel trägt — und der ist hier eine nichtssagende UUID.
--
-- Hintergrund: Lösch-Ereignisse durchlaufen die Zugriffsregeln NICHT und
-- können bei Clients ankommen, die die Zeile nie sehen durften. Mit
-- "replica identity full" stünden dort user_id und Urheber im Klartext.
-- Dieselbe Abwägung steht in 0009_nachrichten.sql:117-130.
