# Benachrichtigungen — Umsetzungsplan

> **Für Agenten:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für
> Aufgabe umzusetzen. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Eine Glocke in der Kopfzeile mit Echtzeitzähler und eine Seite
`/benachrichtigungen`, die zeigt, wer ein Bild mochte, kommentiert hat oder
gefolgt ist — zusammengefasst nach Bezug und Kalendertag.

**Architektur:** Eine Zeile pro Ereignis in `public.notifications`, geschrieben
von drei `security definer`-Triggern auf `likes`, `comments` und `follows`.
Zusammengefasst wird erst beim Lesen, in reinem TypeScript. Der Zähler läuft
über `postgres_changes` hoch; Basis (Server) und Delta (Abo) werden im Browser
getrennt geführt. Direktnachrichten bleiben in ihrer eigenen Lesemarke.

**Technik:** Next.js 16.3.1 (App Router), React 19.2, Tailwind 4, Supabase
(PostgREST, RLS, Realtime), TypeScript 5, Node 24.

**Grundlage:** [`docs/superpowers/specs/2026-08-15-benachrichtigungen-design.md`](../specs/2026-08-15-benachrichtigungen-design.md)

---

## Vorbemerkung: Wie hier geprüft wird

Dieses Projekt hat **kein Testverzeichnis und keinen Testläufer**. Migrationen
laufen von Hand über den SQL-Editor im Dashboard, weil kein Docker installiert
ist. Das ändert dieser Plan nur an einer Stelle, und zwar dort, wo es echten
Wert hat.

**Neu: echte Tests für die Gruppierung.** Node 24 führt TypeScript direkt aus
(Typen werden gestrippt), und `node --test` bringt einen Testläufer mit. Die
Gruppierungslogik ist reines TypeScript ohne Abhängigkeiten und damit die eine
Stelle, die sich ohne Datenbank und ohne zweites Konto beweisen lässt. Genau sie
ist sonst unbeweisbar, weil man dafür fünf Konten bräuchte. Beides wurde in
diesem Projekt verifiziert:

- `node --test "lib/**/*.test.ts"` läuft. Die **Verzeichnisform**
  (`node --test lib/`) läuft **nicht** — sie wirft `MODULE_NOT_FOUND`.
- Importe im Test brauchen die **Endung `.ts`** (`./modul.ts`). Ohne Endung
  findet Node das Modul nicht.
- Damit `tsc` diese Endung akzeptiert, muss `allowImportingTsExtensions` in
  `tsconfig.json` gesetzt sein (verifiziert: ohne den Schalter Fehler TS5097).
- Ohne `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` kommt bei jedem Lauf
  eine Warnung, weil `package.json` kein `"type": "module"` hat. Diesen Eintrag
  **nicht** setzen — er würde die `.mjs`/`.js`-Auflösung im ganzen Projekt
  umstellen.

**Alles andere wird so geprüft:**

| Werkzeug | Befehl | Erwartung |
|---|---|---|
| Typen | `npx tsc --noEmit` | keine Ausgabe |
| Regeln | `npm run lint` | **genau 3 Fehler**, siehe unten |
| Bau | `npm run build` | erfolgreich |
| Einrichtung | `npm run check` | alle Häkchen grün |
| Datenbank | SQL-Editor im Dashboard | die Abfragen aus Aufgabe 2 |

**Der Lint-Ausgangsstand ist nicht sauber.** Auf `main` meldet `npm run lint`
bereits **drei** Fehler der Regel `react-hooks/set-state-in-effect`:

- `app/feed-liste.tsx:83:5`
- `app/login/page.tsx:93:5`
- `app/passkeys.tsx:32:10`

Diese drei gehören nicht zu diesem Vorhaben und werden hier **nicht** behoben.
Die Messlatte lautet: **kein vierter Fehler.** Genau deshalb steht in Aufgabe 5
der ungewöhnliche Kniff, den Zustand während des Renderns anzupassen statt in
einem Effekt — ein `setDelta(0)` in einem `useEffect` verstiesse gegen dieselbe
Regel.

**Sprache:** Oberflächentexte, Code-Kommentare, Dokumentation und
Commit-Nachrichten auf Deutsch, Duzen, Sätze statt Stichworte. Fehlermeldungen
sagen, was zu tun ist, und entschuldigen sich nicht. Farben und Schriften
ausschliesslich über die Tokens aus `app/globals.css` — keine Hex-Werte in
Komponenten.

**Zweig:** Alle Arbeit auf `benachrichtigungen`. Die Spezifikation liegt dort
bereits als Commit `b6b4362`.

---

## Abweichung von der Spezifikation

Beim Ausmessen der Seiten hat sich eine Festlegung der Spezifikation als falsch
erwiesen. Sie ist hier korrigiert und muss dort nachgezogen werden (Aufgabe 10):

**`/nachrichten/[id]` behält seine eigene Kopfzeile.** Die Spezifikation
verlangt sechs Ersetzungen; es werden **fünf**. Die Kopfzeile des Chats trägt
kein Wortzeichen, sondern „Zurück" und den Namen des Gegenübers
(`app/nachrichten/[id]/page.tsx:32-40`). Sie ist eine Lese-Ansicht: Neue
Nachrichten zeigt der Chat darunter bereits live, und fünf Bedienelemente über
einer laufenden Unterhaltung machen sie schlechter, nicht besser.

**Höchstens zwei Urheber werden namentlich genannt**, nicht drei. Beide
Beispiele aus dem freigegebenen Entwurf rechnen so: „anna, ben und 3 weitere"
sind fünf Personen, „ben und 2 weitere" sind drei.

---

## Dateien

**Neu:**

| Pfad | Zuständigkeit |
|---|---|
| `supabase/migrations/0010_benachrichtigungen.sql` | Tabellen, Regeln, Trigger, Funktionen, Realtime |
| `lib/benachrichtigungen-gruppieren.ts` | **Reine** Gruppierung. Keine Importe, keine Datenbank. |
| `lib/benachrichtigungen-gruppieren.test.ts` | Tests dazu |
| `lib/benachrichtigungen.ts` | Abfragen, Aufräumen, Zähler (`server-only`) |
| `app/glocke.tsx` | Client-Komponente mit Echtzeitabo |
| `app/benachrichtigungen/page.tsx` | Die Liste |
| `app/benachrichtigungen/actions.ts` | Lesemarke fortschreiben |
| `app/benachrichtigungen/gelesen.tsx` | Ruft die Action beim Einhängen auf |
| `app/nachrichten/[id]/gelesen.tsx` | Dasselbe für eine Unterhaltung |

**Geändert:**

| Pfad | Was |
|---|---|
| `tsconfig.json` | `allowImportingTsExtensions` |
| `package.json` | Skript `test` |
| `app/kopfzeile.tsx` | Varianten `voll`/`schmal`, Glocke |
| `app/page.tsx`, `app/entdecken/page.tsx`, `app/suche/page.tsx`, `app/tag/[tag]/page.tsx` | Zähler durchreichen |
| `app/p/[id]/page.tsx`, `app/u/[handle]/page.tsx`, `app/nachrichten/page.tsx`, `app/profil/page.tsx`, `app/hochladen/page.tsx` | Handgebaute Kopfzeile ersetzen |
| `app/nachrichten/[id]/page.tsx` | Lesemarke setzen |
| `scripts/check-supabase.mjs` | Migration 0010 prüfen |
| `supabase/testnutzer.sql` | Ereignisse zum Auslösen |
| `README.md`, `SETUP.md`, Spezifikation | Nachziehen |

**Warum die Gruppierung eine eigene Datei bekommt:** `lib/benachrichtigungen.ts`
importiert `server-only` und den Supabase-Client. Beides kann `node --test`
nicht laden. Die reine Logik in einer Datei ohne jeden Import zu halten, ist
deshalb nicht Kosmetik, sondern die Bedingung dafür, dass sie überhaupt prüfbar
ist.

---

## Aufgabe 1: Testlauf ermöglichen

**Dateien:**
- Ändern: `tsconfig.json`
- Ändern: `package.json:5-11`

- [ ] **Schritt 1: `allowImportingTsExtensions` setzen**

In `tsconfig.json` innerhalb von `compilerOptions` hinter `"noEmit": true`
einfügen:

```json
    "allowImportingTsExtensions": true,
```

Der Schalter setzt `noEmit: true` voraus, das steht bereits da. Er erlaubt
Importe mit der Endung `.ts`, die Node zwingend braucht.

- [ ] **Schritt 2: Testskript eintragen**

In `package.json` in `scripts` hinter `"lint": "eslint",` einfügen:

```json
    "test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \"lib/**/*.test.ts\"",
```

- [ ] **Schritt 3: Prüfen, dass beides nichts kaputt macht**

```bash
npx tsc --noEmit
npm test
```

Erwartung `tsc`: keine Ausgabe.
Erwartung `npm test`: `tests 0`, `pass 0`, `fail 0` — es gibt noch keine
Testdatei. Ein `MODULE_NOT_FOUND` bedeutet, dass das Muster in Anführungszeichen
fehlt.

- [ ] **Schritt 4: Commit**

```bash
git add tsconfig.json package.json
git commit -m "Testläufer für reine Logik"
```

---

## Aufgabe 2: Migration 0010

**Dateien:**
- Neu: `supabase/migrations/0010_benachrichtigungen.sql`

- [ ] **Schritt 1: Migration schreiben**

Vollständiger Inhalt der Datei:

```sql
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
```

- [ ] **Schritt 2: Migration anwenden**

Dashboard → SQL Editor → New query → Inhalt der Datei einfügen → Run.

Erwartung: `Success. No rows returned`.

Bricht sie ab, ist nichts halb angelegt — der SQL-Editor fährt die ganze
Anweisungsfolge in einer Transaktion.

- [ ] **Schritt 3: Trigger im SQL-Editor prüfen**

Das ist der einzige Weg, die Trigger zu prüfen: Über die Oberfläche geht es
nicht, weil der Selbstfall unterdrückt wird und nur ein Konto existiert. Im
SQL-Editor ist `auth.uid()` null — genau deshalb liest der Trigger den Urheber
aus `NEW.*`.

Im SQL-Editor läuft man als `postgres` und damit an den Zugriffsregeln vorbei —
`delete from public.notifications` räumt dort alles ab, nicht nur Eigenes. Das
ist hier erwünscht, macht die Zählungen eindeutig, und ist der Grund, warum
diese Abfragen **niemals** in die Anwendung gehören.

Zuerst die Vorbedingung:

```sql
select
  (select count(*) from public.profiles) as profile,
  (select count(*) from public.posts) as beitraege;
```

Erwartung: `profile` >= 2 und `beitraege` >= 1. Steht bei `profile` eine 1,
zuerst `supabase/testnutzer.sql` im SQL-Editor ausführen.

- [ ] **Schritt 4: Ein Like auslösen und nachsehen**

```sql
delete from public.notifications;

-- Ein fremdes Profil mag den neuesten Beitrag.
insert into public.likes (post_id, user_id)
select po.id, pr.id
from public.posts po
join public.profiles pr on pr.id <> po.author_id
order by po.created_at desc, pr.created_at
limit 1
on conflict do nothing;

select n.typ, e.handle as empfaenger, u.handle as urheber
from public.notifications n
join public.profiles e on e.id = n.user_id
join public.profiles u on u.id = n.like_actor_id;
```

Erwartung: **genau eine** Zeile, `typ = 'like'`, `empfaenger` = dein Handle,
`urheber` = das Testprofil.

- [ ] **Schritt 5: Kaskade prüfen**

```sql
delete from public.likes l
using public.notifications n
where n.typ = 'like'
  and l.post_id = n.like_post_id
  and l.user_id = n.like_actor_id;

select count(*) as sollte_null_sein from public.notifications;
```

Erwartung: `0`. Damit ist bewiesen, dass der zusammengesetzte Fremdschlüssel
greift — ein zurückgenommenes Like räumt seine Benachrichtigung ohne eine Zeile
Anwendungscode weg.

- [ ] **Schritt 6: Selbstfall prüfen**

```sql
delete from public.notifications;

-- Der Urheber mag seinen eigenen Beitrag.
insert into public.likes (post_id, user_id)
select id, author_id from public.posts order by created_at desc limit 1
on conflict do nothing;

select count(*) as sollte_null_sein from public.notifications;
```

Erwartung: `0` — man benachrichtigt sich nicht selbst.

Danach aufräumen:

```sql
delete from public.likes l
using public.posts p
where l.post_id = p.id and l.user_id = p.author_id;
```

- [ ] **Schritt 7: 24-Stunden-Sperre prüfen**

```sql
delete from public.notifications;

create temporary table zwei as
select id, row_number() over (order by created_at) as n
from public.profiles
order by created_at
limit 2;

-- Folgen …
insert into public.follows (follower_id, following_id)
values (
  (select id from zwei where n = 2),
  (select id from zwei where n = 1)
) on conflict do nothing;

-- … entfolgen …
delete from public.follows
where follower_id = (select id from zwei where n = 2)
  and following_id = (select id from zwei where n = 1);

-- … und gleich wieder folgen.
insert into public.follows (follower_id, following_id)
values (
  (select id from zwei where n = 2),
  (select id from zwei where n = 1)
) on conflict do nothing;

select count(*) as sollte_eins_sein from public.notifications;

drop table zwei;
```

Erwartung: `1`. Zwei Ergebnisse zeigt das gleichzeitig: Das Entfolgen hat die
Benachrichtigung **nicht** gelöscht (sonst stünde dort auch 1, aber aus dem
zweiten Folgen), und das zweite Folgen hat **keine** zweite erzeugt. Steht dort
`2`, greift die Sperre nicht; steht dort `0`, kaskadiert `follow_follower_id`
fälschlich auf `follows` statt auf `profiles`.

- [ ] **Schritt 8: Aufräumen**

```sql
delete from public.notifications;
delete from public.follows
where follower_id in (select id from public.profiles order by created_at limit 2)
  and following_id in (select id from public.profiles order by created_at limit 2);
```

- [ ] **Schritt 9: Commit**

```bash
git add supabase/migrations/0010_benachrichtigungen.sql
git commit -m "Datenbank für Benachrichtigungen"
```

---

## Aufgabe 3: Gruppierung, testgetrieben

**Dateien:**
- Neu: `lib/benachrichtigungen-gruppieren.ts`
- Neu: `lib/benachrichtigungen-gruppieren.test.ts`

Diese Datei darf **keinen einzigen Import** haben — sonst kann `node --test`
sie nicht laden.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Vollständiger Inhalt von `lib/benachrichtigungen-gruppieren.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gruppieren,
  type RohBenachrichtigung,
} from "./benachrichtigungen-gruppieren.ts";

const like = (
  id: string,
  urheberId: string,
  beitragId: string,
  createdAt: string,
): RohBenachrichtigung => ({
  id,
  typ: "like",
  urheberId,
  beitragId,
  kommentarId: null,
  createdAt,
});

test("fasst Likes am selben Tag zum selben Beitrag zusammen", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "ben", "bild-a", "2026-08-15T09:00:00Z"),
      like("3", "carla", "bild-a", "2026-08-15T08:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 1);
  assert.equal(gruppen[0].anzahl, 3);
  assert.deepEqual(gruppen[0].urheberIds, ["anna", "ben", "carla"]);
  assert.equal(gruppen[0].neuestesAm, "2026-08-15T10:00:00Z");
});

test("trennt denselben Beitrag an verschiedenen Tagen", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "ben", "bild-a", "2026-08-14T10:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("trennt verschiedene Beiträge am selben Tag", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "anna", "bild-b", "2026-08-15T09:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("zählt dieselbe Person nur einmal als Urheber, aber zweimal in anzahl", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "anna", "bild-a", "2026-08-15T09:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 1);
  assert.deepEqual(gruppen[0].urheberIds, ["anna"]);
  assert.equal(gruppen[0].anzahl, 2);
});

test("die Tagesgrenze ist Berliner Zeit, nicht UTC", () => {
  // 22:30 UTC am 14.8. ist in Berlin bereits der 15.8. um 00:30.
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-14T22:30:00Z"),
      like("2", "ben", "bild-a", "2026-08-14T21:30:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("folgt-Ereignisse gruppieren ohne Bezug, aber pro Tag", () => {
  const folgt = (
    id: string,
    urheberId: string,
    createdAt: string,
  ): RohBenachrichtigung => ({
    id,
    typ: "folgt",
    urheberId,
    beitragId: null,
    kommentarId: null,
    createdAt,
  });

  const gruppen = gruppieren(
    [
      folgt("1", "anna", "2026-08-15T10:00:00Z"),
      folgt("2", "ben", "2026-08-15T09:00:00Z"),
      folgt("3", "carla", "2026-08-14T09:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
  assert.equal(gruppen[0].anzahl, 2);
  assert.equal(gruppen[1].anzahl, 1);
});

test("mischt Typen nicht, auch nicht beim selben Beitrag am selben Tag", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      {
        id: "2",
        typ: "kommentar",
        urheberId: "ben",
        beitragId: "bild-a",
        kommentarId: "k1",
        createdAt: "2026-08-15T09:00:00Z",
      },
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 2);
});

test("die Gruppe merkt sich den neuesten Kommentar, nicht den ältesten", () => {
  const gruppen = gruppieren(
    [
      {
        id: "1",
        typ: "kommentar",
        urheberId: "anna",
        beitragId: "bild-a",
        kommentarId: "neu",
        createdAt: "2026-08-15T10:00:00Z",
      },
      {
        id: "2",
        typ: "kommentar",
        urheberId: "ben",
        beitragId: "bild-a",
        kommentarId: "alt",
        createdAt: "2026-08-15T09:00:00Z",
      },
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen.length, 1);
  assert.equal(gruppen[0].kommentarId, "neu");
});

test("ungelesen richtet sich nach dem neuesten Ereignis der Gruppe", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-a", "2026-08-15T10:00:00Z"),
      like("2", "ben", "bild-b", "2026-08-15T08:00:00Z"),
    ],
    "2026-08-15T09:00:00Z",
  );

  assert.equal(gruppen[0].ungelesen, true);
  assert.equal(gruppen[1].ungelesen, false);
});

test("Gruppen kommen neueste zuerst, unabhängig von der Eingabereihenfolge", () => {
  const gruppen = gruppieren(
    [
      like("1", "anna", "bild-alt", "2026-08-10T10:00:00Z"),
      like("2", "ben", "bild-neu", "2026-08-15T10:00:00Z"),
    ],
    "1970-01-01T00:00:00Z",
  );

  assert.equal(gruppen[0].beitragId, "bild-neu");
  assert.equal(gruppen[1].beitragId, "bild-alt");
});

test("leere Eingabe ergibt eine leere Liste", () => {
  assert.deepEqual(gruppieren([], "1970-01-01T00:00:00Z"), []);
});
```

- [ ] **Schritt 2: Testlauf, der fehlschlagen muss**

```bash
npm test
```

Erwartung: Fehler `Cannot find module` für
`./benachrichtigungen-gruppieren.ts`. Läuft der Test stattdessen durch, wurde
die Implementierung versehentlich zuerst geschrieben.

- [ ] **Schritt 3: Die Implementierung schreiben**

Vollständiger Inhalt von `lib/benachrichtigungen-gruppieren.ts`:

```ts
/**
 * Fasst gleichartige Benachrichtigungen zusammen.
 *
 * Bewusst ohne jeden Import: Diese Datei muss von `node --test` direkt
 * ladbar bleiben. Sobald hier `server-only` oder der Supabase-Client
 * hereinkommt, ist die Logik nicht mehr prüfbar — und sie ist die einzige
 * Stelle des Vorhabens, die sich ohne Datenbank und ohne fünf Konten
 * beweisen lässt.
 */

export type Typ = "like" | "kommentar" | "folgt";

export type RohBenachrichtigung = {
  id: string;
  typ: Typ;
  /** Wer es ausgelöst hat. */
  urheberId: string;
  /** Bei Likes und Kommentaren der Beitrag, bei „folgt" null. */
  beitragId: string | null;
  /** Nur bei Kommentaren. */
  kommentarId: string | null;
  createdAt: string;
};

export type Gruppe = {
  schluessel: string;
  typ: Typ;
  /** Ohne Wiederholung, neuester zuerst. */
  urheberIds: string[];
  /** Alle Ereignisse der Gruppe, auch wiederholte derselben Person. */
  anzahl: number;
  neuestesAm: string;
  beitragId: string | null;
  /** Der neueste Kommentar der Gruppe. */
  kommentarId: string | null;
  ungelesen: boolean;
};

/**
 * Der Kalendertag in Berliner Zeit, nicht in UTC.
 *
 * Ohne Zeitzone fiele die Tagesgrenze für deutsche Nutzer im Sommer auf
 * 02:00 Uhr — was abends um halb elf passiert, gehörte dann schon zum
 * nächsten Tag. „sv-SE" liefert das Datum als YYYY-MM-DD.
 */
function tag(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  });
}

/**
 * @param zeilen  Roh-Ereignisse in beliebiger Reihenfolge.
 * @param gelesenBis  Lesemarke als ISO-Zeitstempel.
 * @returns Gruppen, neueste zuerst.
 */
export function gruppieren(
  zeilen: RohBenachrichtigung[],
  gelesenBis: string,
): Gruppe[] {
  // Neueste zuerst, damit „der neueste Kommentar" und die Reihenfolge der
  // Urheber ohne zweiten Durchlauf feststehen.
  const sortiert = [...zeilen].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  const gruppen = new Map<string, Gruppe>();

  for (const zeile of sortiert) {
    // „folgt" hat kein Bezugsobjekt — alle eines Tages bilden eine Gruppe.
    const bezug = zeile.typ === "folgt" ? "" : (zeile.beitragId ?? "");
    const schluessel = `${zeile.typ}|${bezug}|${tag(zeile.createdAt)}`;

    const vorhanden = gruppen.get(schluessel);
    if (!vorhanden) {
      gruppen.set(schluessel, {
        schluessel,
        typ: zeile.typ,
        urheberIds: [zeile.urheberId],
        anzahl: 1,
        neuestesAm: zeile.createdAt,
        beitragId: zeile.beitragId,
        kommentarId: zeile.kommentarId,
        ungelesen: zeile.createdAt > gelesenBis,
      });
      continue;
    }

    vorhanden.anzahl += 1;
    if (!vorhanden.urheberIds.includes(zeile.urheberId)) {
      vorhanden.urheberIds.push(zeile.urheberId);
    }
  }

  return [...gruppen.values()].sort((a, b) =>
    b.neuestesAm.localeCompare(a.neuestesAm),
  );
}

/**
 * „anna, ben und 3 weitere" — höchstens zwei Namen, der Rest wird gezählt.
 * `namen` muss dieselbe Reihenfolge haben wie `urheberIds`.
 */
export function urheberSatz(namen: string[]): string {
  if (namen.length === 0) return "Jemand";
  if (namen.length === 1) return namen[0];
  if (namen.length === 2) return `${namen[0]} und ${namen[1]}`;
  return `${namen[0]}, ${namen[1]} und ${namen.length - 2} weitere`;
}
```

- [ ] **Schritt 4: Testlauf, der bestehen muss**

```bash
npm test
```

Erwartung: `pass 11`, `fail 0`.

- [ ] **Schritt 5: Test für `urheberSatz` nachlegen**

Den Import oben in der Testdatei ersetzen durch:

```ts
import {
  gruppieren,
  urheberSatz,
  type RohBenachrichtigung,
} from "./benachrichtigungen-gruppieren.ts";
```

Und ans Ende der Datei anhängen:

```ts
test("urheberSatz nennt höchstens zwei Namen", () => {
  assert.equal(urheberSatz([]), "Jemand");
  assert.equal(urheberSatz(["anna"]), "anna");
  assert.equal(urheberSatz(["anna", "ben"]), "anna und ben");
  assert.equal(
    urheberSatz(["anna", "ben", "carla", "dora", "emil"]),
    "anna, ben und 3 weitere",
  );
});
```

- [ ] **Schritt 6: Testlauf**

```bash
npm test
npx tsc --noEmit
```

Erwartung: `pass 12`, `fail 0`. `tsc` ohne Ausgabe.

- [ ] **Schritt 7: Commit**

```bash
git add lib/benachrichtigungen-gruppieren.ts lib/benachrichtigungen-gruppieren.test.ts
git commit -m "Benachrichtigungen zusammenfassen"
```

---

## Aufgabe 4: Abfragen

**Dateien:**
- Neu: `lib/benachrichtigungen.ts`

- [ ] **Schritt 1: Die Datei schreiben**

Vier Rundreisen statt einer verschachtelten Abfrage: `like_actor_id` hängt per
**zusammengesetztem** Fremdschlüssel an `likes`, nicht an `profiles` — PostgREST
kann von dort aus kein Profil einbetten. Nachschlagen in einem Aufruf ist genau
das Muster aus `lib/nachrichten.ts:71-96`.

Vollständiger Inhalt von `lib/benachrichtigungen.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  gruppieren,
  type Gruppe,
  type RohBenachrichtigung,
} from "@/lib/benachrichtigungen-gruppieren";

/** Wie viele Roh-Ereignisse gelesen und behalten werden. */
export const FENSTER = 200;

const EPOCHE = "1970-01-01T00:00:00Z";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST200";
}

export type Person = { handle: string; displayName: string | null };

export type AnzeigeGruppe = Gruppe & {
  urheber: Person[];
  beitrag: { id: string; caption: string | null } | null;
  kommentarText: string | null;
};

/** Die Lesemarke des Nutzers. Fehlt die Zeile, gilt „noch nie gelesen". */
async function leseMarke(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_state")
    .select("read_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return EPOCHE;
  return (data.read_at as string) ?? EPOCHE;
}

/**
 * Die Zahl an der Glocke: ungelesene Ereignisse plus ungelesene
 * Nachrichten.
 *
 * Gezählt werden EREIGNISSE, nicht Gruppen. Fünf Likes auf dasselbe Bild
 * ergeben „5" an der Glocke und eine Zeile in der Liste. Das ist Absicht:
 * Nur ein Ereigniszähler lässt sich aus einem Realtime-Ereignis ohne
 * Server-Rundreise fortschreiben.
 */
export async function getUngeleseneAnzahl(userId: string): Promise<number> {
  const supabase = await createClient();
  const seit = await leseMarke(userId);

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", seit);

  if (error && !isMissing(error.code)) {
    throw new Error(`Benachrichtigungen nicht zählbar: ${error.message}`);
  }

  const { data: nachrichten } = await supabase.rpc("ungelesene_nachrichten");

  return (count ?? 0) + (typeof nachrichten === "number" ? nachrichten : 0);
}

/** Die Liste, fertig zusammengefasst und mit Namen versehen. */
export async function getBenachrichtigungen(
  userId: string,
): Promise<AnzeigeGruppe[]> {
  const supabase = await createClient();
  const seit = await leseMarke(userId);

  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, typ, created_at, like_post_id, like_actor_id, comment_id, follow_follower_id",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(FENSTER);

  if (error) {
    if (isMissing(error.code)) return [];
    throw new Error(`Benachrichtigungen nicht ladbar: ${error.message}`);
  }

  const zeilen = (data ?? []) as unknown as {
    id: string;
    typ: "like" | "kommentar" | "folgt";
    created_at: string;
    like_post_id: string | null;
    like_actor_id: string | null;
    comment_id: string | null;
    follow_follower_id: string | null;
  }[];

  if (zeilen.length === 0) return [];

  // Kommentare zuerst: Aus ihnen kommen sowohl der Text als auch der
  // Urheber und der Beitrag, die den Roh-Ereignissen noch fehlen.
  const kommentarIds = zeilen
    .map((z) => z.comment_id)
    .filter((id): id is string => id !== null);

  const kommentare = new Map<
    string,
    { body: string; authorId: string; postId: string }
  >();

  if (kommentarIds.length > 0) {
    const { data: rows } = await supabase
      .from("comments")
      .select("id, body, author_id, post_id")
      .in("id", kommentarIds);

    for (const row of (rows ?? []) as unknown as {
      id: string;
      body: string;
      author_id: string;
      post_id: string;
    }[]) {
      kommentare.set(row.id, {
        body: row.body,
        authorId: row.author_id,
        postId: row.post_id,
      });
    }
  }

  const roh: RohBenachrichtigung[] = [];
  for (const z of zeilen) {
    if (z.typ === "like" && z.like_actor_id && z.like_post_id) {
      roh.push({
        id: z.id,
        typ: "like",
        urheberId: z.like_actor_id,
        beitragId: z.like_post_id,
        kommentarId: null,
        createdAt: z.created_at,
      });
    } else if (z.typ === "kommentar" && z.comment_id) {
      const k = kommentare.get(z.comment_id);
      // Zwischen Lesen und Nachschlagen gelöscht — dann gibt es nichts
      // mehr anzuzeigen.
      if (!k) continue;
      roh.push({
        id: z.id,
        typ: "kommentar",
        urheberId: k.authorId,
        beitragId: k.postId,
        kommentarId: z.comment_id,
        createdAt: z.created_at,
      });
    } else if (z.typ === "folgt" && z.follow_follower_id) {
      roh.push({
        id: z.id,
        typ: "folgt",
        urheberId: z.follow_follower_id,
        beitragId: null,
        kommentarId: null,
        createdAt: z.created_at,
      });
    }
  }

  const gruppen = gruppieren(roh, seit);
  if (gruppen.length === 0) return [];

  // Profile und Beiträge in je einem Aufruf statt einem pro Gruppe.
  const personIds = [...new Set(gruppen.flatMap((g) => g.urheberIds))];
  const beitragIds = [
    ...new Set(
      gruppen
        .map((g) => g.beitragId)
        .filter((id): id is string => id !== null),
    ),
  ];

  // Bewusst nacheinander und nicht in einem Promise.all: Die zweite
  // Abfrage entfällt, wenn es keine Beiträge gibt, und ein Promise.all
  // über zwei unterschiedlich geformte Zweige ergibt einen Vereinigungstyp,
  // an dem der Typprüfer hängen bleibt.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .in("id", personIds);

  const personen = new Map<string, Person>();
  for (const row of (profile ?? []) as unknown as {
    id: string;
    handle: string;
    display_name: string | null;
  }[]) {
    personen.set(row.id, { handle: row.handle, displayName: row.display_name });
  }

  const posts = new Map<string, { id: string; caption: string | null }>();
  if (beitragIds.length > 0) {
    const { data: beitraege } = await supabase
      .from("posts")
      .select("id, caption")
      .in("id", beitragIds);

    for (const row of (beitraege ?? []) as {
      id: string;
      caption: string | null;
    }[]) {
      posts.set(row.id, row);
    }
  }

  return gruppen.map((gruppe) => ({
    ...gruppe,
    urheber: gruppe.urheberIds
      .map((id) => personen.get(id))
      .filter((p): p is Person => p !== undefined),
    beitrag: gruppe.beitragId ? (posts.get(gruppe.beitragId) ?? null) : null,
    kommentarText: gruppe.kommentarId
      ? (kommentare.get(gruppe.kommentarId)?.body ?? null)
      : null,
  }));
}

/**
 * Entfernt die eigenen Benachrichtigungen jenseits des Fensters.
 *
 * Aufgeräumt wird beim Lesen, nach dem Muster von
 * `cleanupOwnExpiredStories` (lib/stories.ts:115). Ein Kappungs-Trigger
 * wäre der naheliegende Weg und wäre falsch: Er löschte in der
 * naheliegenden Formulierung Zeilen fremder Nutzer mit und erzeugte eine
 * Flut von Lösch-Ereignissen, die die Zugriffsregeln nicht durchlaufen.
 */
export async function aufraeumen(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(FENSTER, FENSTER)
    .maybeSingle();

  // Weniger als FENSTER Zeilen: nichts zu tun.
  if (error || !data) return 0;

  const { count } = await supabase
    .from("notifications")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .lte("created_at", data.created_at as string);

  return count ?? 0;
}
```

- [ ] **Schritt 2: Typen prüfen**

```bash
npx tsc --noEmit
npm run lint
```

Erwartung: `tsc` ohne Ausgabe. `npm run lint`: weiterhin **genau 3** Fehler,
alle in `feed-liste.tsx`, `login/page.tsx`, `passkeys.tsx`.

- [ ] **Schritt 3: Commit**

```bash
git add lib/benachrichtigungen.ts
git commit -m "Benachrichtigungen lesen und aufräumen"
```

---

## Aufgabe 5: Die Glocke

**Dateien:**
- Neu: `app/glocke.tsx`

- [ ] **Schritt 1: Die Komponente schreiben**

Vollständiger Inhalt von `app/glocke.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  /** Vom Server gelesener Stand beim Rendern dieser Seite. */
  startwert: number;
  userId: string;
};

export function Glocke({ startwert, userId }: Props) {
  // Basis und Delta getrennt: useState(startwert) friert den Startwert
  // ein, und Layouts rendern beim Navigieren nicht neu. Der Server-Prop
  // ist die Basis, das Abo liefert nur, was seit dem Einhängen dazukam.
  const [basis, setBasis] = useState(startwert);
  const [delta, setDelta] = useState(0);

  // Anpassung während des Renderns statt in einem Effekt. Ein
  // setDelta(0) in useEffect verstiesse gegen react-hooks/
  // set-state-in-effect — und React kennt genau dafür dieses Muster:
  // Es rendert sofort neu, ohne den Zwischenstand anzuzeigen.
  if (basis !== startwert) {
    setBasis(startwert);
    setDelta(0);
  }

  useEffect(() => {
    const supabase = createClient();

    // Alle Bindungen VOR subscribe(): seit supabase-js 2.101 wirft ein
    // .on() nach dem Abonnieren.
    const kanal = supabase
      .channel(`benachrichtigungen:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setDelta((bisher) => bisher + 1),
      )
      .on(
        "postgres_changes",
        // Ungefiltert: Die Zugriffsregel messages_select_participant wird
        // pro Abonnent geprüft, es kommt also nur an, was man sehen darf.
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id?: string };
          // Eigene Nachrichten erhöhen den eigenen Zähler nicht.
          if (row.sender_id === userId) return;
          setDelta((bisher) => bisher + 1);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [userId]);

  const anzahl = basis + delta;

  return (
    <Link
      href="/benachrichtigungen"
      aria-label={
        anzahl === 0
          ? "Benachrichtigungen, nichts Neues"
          : `Benachrichtigungen, ${anzahl} neu`
      }
      className="relative inline-flex items-center text-muted transition-colors hover:text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>

      {anzahl > 0 ? (
        <span
          aria-live="polite"
          className="absolute -top-1.5 -right-2 min-w-[1.1rem] rounded-full bg-accent px-1 text-center text-[0.65rem] leading-[1.1rem] font-medium text-paper"
        >
          {anzahl > 99 ? "99+" : anzahl}
        </span>
      ) : null}
    </Link>
  );
}
```

- [ ] **Schritt 2: Regeln prüfen**

```bash
npx tsc --noEmit
npm run lint
```

Erwartung: `tsc` ohne Ausgabe, `npm run lint` weiterhin **genau 3** Fehler.
Kommt ein vierter in `app/glocke.tsx` dazu, wurde das Muster aus Schritt 1
(Anpassung während des Renderns) durch einen `useEffect` ersetzt.

- [ ] **Schritt 3: Commit**

```bash
git add app/glocke.tsx
git commit -m "Glocke mit Echtzeitzähler"
```

---

## Aufgabe 6: Kopfzeile mit Varianten

**Dateien:**
- Ändern: `app/kopfzeile.tsx` (vollständig ersetzen)
- Ändern: `app/page.tsx:38`, `app/entdecken/page.tsx:21`, `app/suche/page.tsx:46`, `app/tag/[tag]/page.tsx:26`

- [ ] **Schritt 1: Kopfzeile ersetzen**

Vollständiger neuer Inhalt von `app/kopfzeile.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { Glocke } from "@/app/glocke";

type Props = {
  handle: string;
  userId: string;
  /** Ungelesene Ereignisse plus Nachrichten, vom Server gelesen. */
  ungelesen: number;
  /**
   * „voll" trägt die Reiterzeile, „schmal" ersetzt die handgebauten
   * Kopfzeilen der übrigen Seiten.
   */
  variante?: "voll" | "schmal";
  /** Nur bei „voll": welcher Reiter ist aktiv? */
  active?: "feed" | "entdecken" | "suche";
  /**
   * Zusätzliches Bedienelement rechts, das nur zu dieser Seite gehört —
   * „Abbrechen" beim Hochladen, „Abmelden" im Profil.
   */
  kontext?: ReactNode;
};

export function Kopfzeile({
  handle,
  userId,
  ungelesen,
  variante = "voll",
  active,
  kontext,
}: Props) {
  const tab = (isActive: boolean) =>
    isActive
      ? "text-ink underline decoration-accent decoration-2 underline-offset-8"
      : "text-muted transition-colors hover:text-ink";

  const link =
    "text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink";

  return (
    <header className="border-b border-line pb-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent"
        >
          Bilder
        </Link>

        <nav className="flex items-center gap-5 text-[0.85rem]">
          {kontext}

          {variante === "voll" ? (
            <Link
              href="/hochladen"
              className="rounded-lg bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-strong"
            >
              Bild hochladen
            </Link>
          ) : null}

          <Link href="/nachrichten" className={link}>
            Nachrichten
          </Link>

          <Glocke startwert={ungelesen} userId={userId} />

          <Link href="/profil" className={link}>
            @{handle}
          </Link>
        </nav>
      </div>

      {variante === "voll" ? (
        <nav className="mt-5 flex items-center gap-6 text-[0.9rem]">
          <Link href="/" className={tab(active === "feed")}>
            Von dir gefolgt
          </Link>
          <Link href="/entdecken" className={tab(active === "entdecken")}>
            Entdecken
          </Link>
          <Link href="/suche" className={tab(active === "suche")}>
            Leute finden
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
```

- [ ] **Schritt 2: `app/page.tsx` anpassen**

Import ergänzen (nach `import { Kopfzeile } from "@/app/kopfzeile";`):

```tsx
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";
```

Den Aufruf in `Promise.all` (Zeile 31-34) erweitern:

```tsx
  const [posts, stories, ungelesen] = await Promise.all([
    getFeed(30, sichtbar),
    getStories(result.userId, sichtbar),
    getUngeleseneAnzahl(result.userId),
  ]);
```

Zeile 38 ersetzen:

```tsx
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        active="feed"
      />
```

- [ ] **Schritt 3: `app/entdecken/page.tsx`**

Import ergänzen:

```tsx
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";
```

Zeile 17 (`const posts = await getFeed();`) ersetzen durch:

```tsx
  const [posts, ungelesen] = await Promise.all([
    getFeed(),
    getUngeleseneAnzahl(result.userId),
  ]);
```

Zeile 21 ersetzen durch:

```tsx
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        active="entdecken"
      />
```

- [ ] **Schritt 4: `app/suche/page.tsx`**

Denselben Import ergänzen. Zeilen 33-37 ersetzen durch:

```tsx
  const [profile, posts, tags, ungelesen] = await Promise.all([
    reiter === "leute" ? searchProfiles(term, result.userId) : [],
    reiter === "beitraege" ? searchPosts(term) : [],
    term ? [] : getTopHashtags(15),
    getUngeleseneAnzahl(result.userId),
  ]);
```

Zeile 46 ersetzen durch:

```tsx
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        active="suche"
      />
```

- [ ] **Schritt 5: `app/tag/[tag]/page.tsx`**

Denselben Import ergänzen. Zeile 22
(`const posts = await getPostsByHashtag(decoded);`) ersetzen durch:

```tsx
  const [posts, ungelesen] = await Promise.all([
    getPostsByHashtag(decoded),
    getUngeleseneAnzahl(result.userId),
  ]);
```

Zeile 26 ersetzen durch:

```tsx
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        active="suche"
      />
```

- [ ] **Schritt 6: Bauen**

```bash
npx tsc --noEmit
npm run build
```

Erwartung: `tsc` ohne Ausgabe, Bau erfolgreich.

- [ ] **Schritt 7: Commit**

```bash
git add app/kopfzeile.tsx app/page.tsx app/entdecken/page.tsx app/suche/page.tsx "app/tag/[tag]/page.tsx"
git commit -m "Glocke in der Kopfzeile"
```

---

## Aufgabe 7: Die fünf handgebauten Kopfzeilen ersetzen

**Dateien:**
- Ändern: `app/p/[id]/page.tsx:32-45`
- Ändern: `app/u/[handle]/page.tsx:48-61`
- Ändern: `app/nachrichten/page.tsx:23-36`
- Ändern: `app/profil/page.tsx:25-48`
- Ändern: `app/hochladen/page.tsx:22-32`

`app/nachrichten/[id]/page.tsx` bleibt unangetastet — siehe „Abweichung von der
Spezifikation" oben.

Jede der fünf Seiten braucht denselben Import — einmal pro Datei ergänzen:

```tsx
import { Kopfzeile } from "@/app/kopfzeile";
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";
```

Der bestehende Import von `Link` bleibt überall stehen, weil ihn der übrige
Seiteninhalt weiter braucht.

- [ ] **Schritt 1: `app/p/[id]/page.tsx`**

Zeile 28 (`const comments = await getComments(id);`) ersetzen durch:

```tsx
  const [comments, ungelesen] = await Promise.all([
    getComments(id),
    getUngeleseneAnzahl(result.userId),
  ]);
```

Zeilen 32-45 (das ganze `<header>`) ersetzen durch:

```tsx
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <Link
            href="/"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Zurück zum Feed
          </Link>
        }
      />
```

- [ ] **Schritt 2: `app/u/[handle]/page.tsx`**

Nach dem `fremdeKeys`-Block (endet Zeile 44) einfügen — **`viewer.userId`**,
nicht `profile.id`; gezählt wird für den Betrachter, nicht für das betrachtete
Profil:

```tsx
  const ungelesen = await getUngeleseneAnzahl(viewer.userId);
```

Zeilen 48-61 ersetzen durch:

```tsx
      <Kopfzeile
        handle={viewer.profile.handle}
        userId={viewer.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <Link
            href="/"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Zurück zum Feed
          </Link>
        }
      />
```

- [ ] **Schritt 3: `app/nachrichten/page.tsx`**

`getUngeleseneAnzahl(result.userId)` in das bestehende `Promise.all`
(Zeilen 16-19) aufnehmen:

```tsx
  const [unterhaltungen, hatKeys, ungelesen] = await Promise.all([
    getUnterhaltungen(result.userId),
    hatSchluesselServerseitig(result.userId),
    getUngeleseneAnzahl(result.userId),
  ]);
```

Zeilen 23-36 ersetzen durch:

```tsx
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <Link
            href="/suche"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Jemanden anschreiben
          </Link>
        }
      />
```

- [ ] **Schritt 4: `app/profil/page.tsx`**

Zeilen 18-21 ersetzen durch:

```tsx
  const [posts, stats, ungelesen] = await Promise.all([
    getOwnPosts(result.userId),
    getPublicProfile(profile.handle, result.userId),
    getUngeleseneAnzahl(result.userId),
  ]);
```

Zeilen 25-48 ersetzen durch:

```tsx
      <Kopfzeile
        handle={profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <>
            <Link
              href="/hochladen"
              className="rounded-lg bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-strong"
            >
              Bild hochladen
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
              >
                Abmelden
              </button>
            </form>
          </>
        }
      />
```

Der `@handle`-Link zeigt auf `/profil`, also auf die Seite, auf der man steht.
Das ist bewusst so gelassen: eine Ausnahmeregel dafür wäre mehr Code als der
Schaden wert.

- [ ] **Schritt 5: `app/hochladen/page.tsx`**

Nach Zeile 18 (`if (!result.profile) redirect("/willkommen");`) einfügen:

```tsx
  const ungelesen = await getUngeleseneAnzahl(result.userId);
```

Zeilen 22-32 ersetzen durch:

```tsx
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <Link
            href="/"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Abbrechen
          </Link>
        }
      />
```

Diese Seite verliert dabei `items-baseline` und bekommt den unteren Rand der
Kopfzeile. Beides war beiläufig entstanden, nicht beabsichtigt. Der grössere
Aussenabstand (`py-16` am `<main>`) bleibt.

- [ ] **Schritt 6: Bauen und prüfen**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Erwartung: `tsc` ohne Ausgabe, `npm run lint` **genau 3** Fehler, Bau
erfolgreich. Meldet `tsc` einen ungenutzten `Link`-Import, kann er auf der
betroffenen Seite entfernt werden — vorher prüfen, ob der übrige Seiteninhalt
ihn noch braucht.

- [ ] **Schritt 7: Commit**

```bash
git add "app/p/[id]/page.tsx" "app/u/[handle]/page.tsx" app/nachrichten/page.tsx app/profil/page.tsx app/hochladen/page.tsx
git commit -m "Eine Kopfzeile für alle angemeldeten Seiten"
```

---

## Aufgabe 8: Die Seite

**Dateien:**
- Neu: `app/benachrichtigungen/actions.ts`
- Neu: `app/benachrichtigungen/gelesen.tsx`
- Neu: `app/benachrichtigungen/page.tsx`

- [ ] **Schritt 1: Die Server Action**

Vollständiger Inhalt von `app/benachrichtigungen/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Schreibt die Lesemarke bis zum übergebenen Zeitpunkt fort.
 *
 * `bis` ist ausdrücklich der Zeitstempel des neuesten ANGEZEIGTEN
 * Ereignisses, nicht `now()`. Zeitstempel folgen nicht der
 * Commit-Reihenfolge; mit `now()` wäre dauerhaft verschluckt, was
 * zwischen Lesen und Schreiben committet.
 */
export async function alsGelesenMarkieren(bis: string): Promise<void> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return;

  await supabase.rpc("benachrichtigungen_gelesen", { bis });
}
```

- [ ] **Schritt 2: Der Auslöser im Browser**

Vollständiger Inhalt von `app/benachrichtigungen/gelesen.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { alsGelesenMarkieren } from "./actions";

/**
 * Markiert beim Einhängen als gelesen — bewusst NICHT im Rendern der
 * Seite. Prefetching führt Server-Renderings aus: Schon das Überfahren
 * des Glockenlinks leerte sonst den Zähler, ohne dass jemand hingesehen
 * hat.
 */
export function Gelesen({ bis }: { bis: string | null }) {
  const router = useRouter();
  const erledigt = useRef(false);

  useEffect(() => {
    if (!bis || erledigt.current) return;
    erledigt.current = true;

    void alsGelesenMarkieren(bis).then(() => {
      // Damit die Glocke oben sofort auf den neuen Stand fällt. Der
      // Wächter oben verhindert, dass daraus eine Schleife wird.
      router.refresh();
    });
  }, [bis, router]);

  return null;
}
```

- [ ] **Schritt 3: Die Seite**

Vollständiger Inhalt von `app/benachrichtigungen/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import {
  aufraeumen,
  getBenachrichtigungen,
  getUngeleseneAnzahl,
  type AnzeigeGruppe,
} from "@/lib/benachrichtigungen";
import { urheberSatz } from "@/lib/benachrichtigungen-gruppieren";
import { relativeTime } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Kopfzeile } from "@/app/kopfzeile";
import { Gelesen } from "./gelesen";

function name(person: { handle: string; displayName: string | null }) {
  return person.displayName ?? `@${person.handle}`;
}

function satz(gruppe: AnzeigeGruppe) {
  const wer = urheberSatz(gruppe.urheber.map(name));
  const mehrere = gruppe.urheber.length > 1;

  if (gruppe.typ === "like") {
    return `${wer} ${mehrere ? "mögen" : "mag"} dein Bild`;
  }
  if (gruppe.typ === "kommentar") {
    return `${wer} ${mehrere ? "haben" : "hat"} kommentiert`;
  }
  return `${wer} ${mehrere ? "folgen" : "folgt"} dir jetzt`;
}

export default async function BenachrichtigungenPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  await aufraeumen(result.userId);

  const [gruppen, ungelesen] = await Promise.all([
    getBenachrichtigungen(result.userId),
    getUngeleseneAnzahl(result.userId),
  ]);

  const neuestes = gruppen[0]?.neuestesAm ?? null;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
      />

      <Gelesen bis={neuestes} />

      <h1 className="mt-10 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
        Was passiert ist
      </h1>

      {gruppen.length === 0 ? (
        <p className="mt-6 max-w-[46ch] text-[0.95rem] leading-relaxed text-muted">
          Hier steht, wer deine Bilder mag, wer kommentiert und wer dir folgt.
          Lade ein Bild hoch, dann füllt sich diese Seite von selbst.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {gruppen.map((gruppe) => (
            <li key={gruppe.schluessel} className="flex gap-3 py-4">
              <span
                aria-hidden="true"
                className={
                  gruppe.ungelesen
                    ? "mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"
                    : "mt-2 h-2 w-2 shrink-0"
                }
              />

              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] leading-relaxed">
                  {satz(gruppe)}
                  {gruppe.ungelesen ? (
                    <span className="sr-only"> — ungelesen</span>
                  ) : null}
                </p>

                {gruppe.typ === "kommentar" && gruppe.kommentarText ? (
                  <p className="mt-1 truncate text-[0.9rem] text-muted">
                    „{gruppe.kommentarText}“
                  </p>
                ) : null}

                {gruppe.beitrag ? (
                  <Link
                    href={`/p/${gruppe.beitrag.id}`}
                    className="mt-1 block truncate text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
                  >
                    {gruppe.beitrag.caption ?? "Zum Bild"}
                  </Link>
                ) : null}

                {gruppe.typ === "folgt" && gruppe.urheber.length === 1 ? (
                  <Link
                    href={`/u/${gruppe.urheber[0].handle}`}
                    className="mt-1 block text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
                  >
                    Profil ansehen
                  </Link>
                ) : null}

                <p className="mt-1 text-[0.8rem] text-muted">
                  {relativeTime(gruppe.neuestesAm)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-12 border-t border-line pt-6 text-[0.8rem] leading-relaxed text-muted">
        Neue Nachrichten zählt die Glocke mit, sie stehen aber unter
        Nachrichten — ihr Inhalt ist verschlüsselt und liegt nirgends im
        Klartext.
      </p>
    </main>
  );
}
```

- [ ] **Schritt 4: Prüfen**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Erwartung: `tsc` ohne Ausgabe, `npm run lint` **genau 3** Fehler, Bau
erfolgreich.

- [ ] **Schritt 5: Im Browser prüfen**

```bash
npm run dev
```

Im SQL-Editor ein Like des Testprofils auf einen eigenen Beitrag einfügen
(Abfrage aus Aufgabe 2, Schritt 4). Erwartung:

1. Die Zahl an der Glocke springt **ohne Neuladen** von 0 auf 1.
2. Ein Klick führt auf `/benachrichtigungen`, dort steht eine Zeile mit
   Akzentpunkt.
3. Die Glocke fällt kurz darauf auf 0.
4. Neu laden: Die Zeile steht noch da, jetzt ohne Punkt.

- [ ] **Schritt 6: Commit**

```bash
git add app/benachrichtigungen/
git commit -m "Seite für Benachrichtigungen"
```

---

## Aufgabe 9: Lesemarke für Unterhaltungen

Behebt den bestehenden Fehler, dass `last_read_at` nie geschrieben wird.

**Dateien:**
- Neu: `app/nachrichten/[id]/gelesen.tsx`
- Ändern: `app/nachrichten/[id]/page.tsx`

- [ ] **Schritt 1: Die Komponente**

Vollständiger Inhalt von `app/nachrichten/[id]/gelesen.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Setzt die Lesemarke der Unterhaltung beim Öffnen.
 *
 * Der Zeitstempel kommt aus der neuesten angezeigten Nachricht, nicht aus
 * der Uhr des Browsers — die kann falsch gehen, und greatest() in der
 * Datenbank machte einen Ausreisser in die Zukunft sonst dauerhaft.
 * Gibt es noch keine Nachricht, ist nichts zu markieren.
 */
export function Gelesen({
  conversationId,
  bis,
}: {
  conversationId: string;
  bis: string | null;
}) {
  const erledigt = useRef(false);

  useEffect(() => {
    if (!bis || erledigt.current) return;
    erledigt.current = true;

    const supabase = createClient();
    void supabase.rpc("unterhaltung_gelesen", {
      conv: conversationId,
      bis,
    });
  }, [conversationId, bis]);

  return null;
}
```

- [ ] **Schritt 2: Einhängen**

In `app/nachrichten/[id]/page.tsx` den Import ergänzen:

```tsx
import { Gelesen } from "./gelesen";
```

Und direkt vor `<Chat …>` (Zeile 42) einfügen:

```tsx
      <Gelesen
        conversationId={id}
        bis={nachrichten[nachrichten.length - 1]?.createdAt ?? null}
      />
```

- [ ] **Schritt 3: Prüfen**

```bash
npx tsc --noEmit
npm run lint
npm run dev
```

Im Browser: `/nachrichten` öffnen — bei einer Unterhaltung mit Nachrichten steht
der Punkt an. Die Unterhaltung öffnen, zurückgehen. Erwartung: Der Punkt ist
weg. Vor dieser Aufgabe blieb er dauerhaft stehen.

- [ ] **Schritt 4: Commit**

```bash
git add "app/nachrichten/[id]/gelesen.tsx" "app/nachrichten/[id]/page.tsx"
git commit -m "Unterhaltungen als gelesen markieren"
```

---

## Aufgabe 10: Prüfskript, Testdaten, Dokumentation

**Dateien:**
- Ändern: `scripts/check-supabase.mjs:129-138`
- Ändern: `supabase/testnutzer.sql`
- Ändern: `README.md`
- Ändern: `docs/superpowers/specs/2026-08-15-benachrichtigungen-design.md`

- [ ] **Schritt 1: Prüfskript**

In `scripts/check-supabase.mjs` das Array `tables` (Zeile 129-138) um eine Zeile
hinter `["messages", "0009_nachrichten.sql"],` ergänzen:

```js
      ["notifications", "0010_benachrichtigungen.sql"],
```

- [ ] **Schritt 2: Prüfen**

```bash
npm run check
```

Erwartung: Eine zusätzliche Zeile `✓ Tabelle „notifications" vorhanden`, alles
grün.

- [ ] **Schritt 3: Testdaten**

An `supabase/testnutzer.sql` anhängen:

```sql
-- ---------------------------------------------------------------------
-- Ereignisse zum Auslösen von Benachrichtigungen
-- ---------------------------------------------------------------------
--
-- Über die Oberfläche lässt sich mit einem Konto keine einzige
-- Benachrichtigung auslösen: Die Trigger unterdrücken den Selbstfall.
-- Hier geht es trotzdem, weil sie den Urheber aus NEW.* lesen und nicht
-- aus auth.uid() — im SQL-Editor ist auth.uid() null.
--
-- Einzeln ausführen und dazwischen im Browser nachsehen.

-- Das Testprofil mag deinen neuesten Beitrag.
insert into public.likes (post_id, user_id)
select po.id, tp.id
from public.posts po
cross join lateral (
  select id from public.profiles
  where id <> po.author_id
  order by created_at desc limit 1
) tp
order by po.created_at desc
limit 1
on conflict do nothing;

-- Das Testprofil kommentiert deinen neuesten Beitrag.
insert into public.comments (post_id, author_id, body)
select po.id, tp.id, 'Schönes Licht — wo war das?'
from public.posts po
cross join lateral (
  select id from public.profiles
  where id <> po.author_id
  order by created_at desc limit 1
) tp
order by po.created_at desc
limit 1;

-- Das Testprofil folgt dir.
insert into public.follows (follower_id, following_id)
select tp.id, po.author_id
from public.posts po
cross join lateral (
  select id from public.profiles
  where id <> po.author_id
  order by created_at desc limit 1
) tp
order by po.created_at desc
limit 1
on conflict do nothing;

-- Zum Aufräumen:
--   delete from public.notifications where user_id = auth.uid();
-- (im SQL-Editor stattdessen die eigene Nutzer-ID einsetzen)
```

- [ ] **Schritt 4: README**

In `README.md` in der Tabelle „Aufbau" hinter der Zeile zu `app/actions.ts`
ergänzen:

```markdown
| `app/glocke.tsx` | Zähler an der Glocke, in Echtzeit |
| `app/benachrichtigungen/` | Wer mag, kommentiert, folgt — zusammengefasst |
| `lib/benachrichtigungen-gruppieren.ts` | Reine Gruppierungslogik, mit Tests |
```

Und einen Abschnitt vor „Zurückgestellt" einfügen:

```markdown
## Benachrichtigungen

Eine Zeile pro Ereignis, zusammengefasst erst beim Anzeigen — nach Bezug und
Kalendertag. Geschrieben werden sie von Triggern in der Datenbank, nicht vom
Anwendungscode: Wer ein Like setzt, darf die Benachrichtigung des Empfängers
nicht selbst schreiben dürfen.

Die Zahl an der Glocke zählt Ereignisse, die Liste zeigt Gruppen. Fünf Likes
auf dasselbe Bild ergeben also „5" oben und eine Zeile unten. Anders ginge es
nicht, ohne bei jedem Ereignis den Server zu fragen.

Direktnachrichten zählen mit, stehen aber nicht in der Liste — ihr Inhalt ist
verschlüsselt, und in der Datenbank soll er auch nicht als Vorschau landen.

Tests: `npm test` (Node führt TypeScript direkt aus, kein Testwerkzeug nötig).
```

- [ ] **Schritt 5: Spezifikation nachziehen**

In `docs/superpowers/specs/2026-08-15-benachrichtigungen-design.md`:

1. Im Abschnitt „`app/kopfzeile.tsx` (erweitert)" „**sechs** handgebaute
   Kopfzeilen" auf **fünf** ändern und `/nachrichten/[id]` aus der Aufzählung
   entfernen, mit der Begründung aus diesem Plan.
2. In „Gruppierungsregel" „Höchstens drei Urheber" auf **zwei** ändern.
3. Unter „Reihenfolge der Umsetzung" den Verweis auf diesen Plan ergänzen.

`SETUP.md` bleibt unverändert, obwohl die Spezifikation es aufführt: Dort steht,
wie man Supabase einrichtet, und daran ändert sich nichts. Die neue Migration
findet `npm run check`, worauf `SETUP.md` bereits verweist. Auch diesen Punkt in
der Spezifikation streichen.

- [ ] **Schritt 6: Alles zusammen prüfen**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run check
```

Erwartung: `pass 12` / `fail 0`; `tsc` ohne Ausgabe; `npm run lint` **genau 3**
Fehler; Bau erfolgreich; `npm run check` durchgehend grün.

- [ ] **Schritt 7: Commit**

```bash
git add scripts/check-supabase.mjs supabase/testnutzer.sql README.md docs/superpowers/specs/2026-08-15-benachrichtigungen-design.md
git commit -m "Prüfskript, Testdaten und Doku für Benachrichtigungen"
```

---

## Abnahme

- [ ] `npm test` — 12 Tests grün
- [ ] `npx tsc --noEmit` — keine Ausgabe
- [ ] `npm run lint` — genau 3 Fehler, alle vorbestehend
- [ ] `npm run build` — erfolgreich
- [ ] `npm run check` — alles grün, `notifications` erkannt
- [ ] Glocke auf allen angemeldeten Seiten ausser `/nachrichten/[id]`
- [ ] Zähler springt ohne Neuladen hoch, wenn im SQL-Editor ein Like entsteht
- [ ] `/benachrichtigungen` fasst mehrere Likes desselben Tages zu einer Zeile
- [ ] Nach dem Öffnen fällt die Glocke auf 0, die Zeilen bleiben ohne Punkt
- [ ] Selbstlike erzeugt keine Benachrichtigung
- [ ] Like zurücknehmen entfernt die Zeile (nach Neuladen)
- [ ] Punkt neben einer Unterhaltung verschwindet nach dem Öffnen
