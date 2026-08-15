# Benachrichtigungen

Stand 2026-08-15. Entwurf, freigegeben, noch nicht umgesetzt.

Bisher erfährt niemand, dass sein Bild gefällt, jemand kommentiert hat oder ihm
gefolgt ist. Das ist die letzte grössere Funktion, die vollständig fehlt.

## Was gebaut wird

Eine Glocke in der Kopfzeile mit einem Zähler, der sich in Echtzeit
aktualisiert, und eine Seite `/benachrichtigungen`, die zeigt, was passiert ist.
Vier Anlässe: Like auf einen eigenen Beitrag, Kommentar unter einem eigenen
Beitrag, ein neuer Follower, eine neue Direktnachricht.

Gleichartige Ereignisse werden zusammengefasst — „anna, ben und 3 weitere mögen
dein Bild" statt fünf fast gleicher Zeilen.

Der vierte Anlass, die Direktnachricht, bekommt **keine** Zeile in der neuen
Tabelle. Sonst gäbe es zwei konkurrierende Lesemarken für denselben Sachverhalt,
die auseinanderlaufen, sobald man einen Chat öffnet, ohne die Glocke
anzuklicken. Ihr Anteil am Zähler kommt weiterhin aus `messages` gegen
`conversation_participants.last_read_at`; die Liste unter `/benachrichtigungen`
zeigt sie nicht, dafür bleibt die Übersicht unter `/nachrichten` ihr Ort.

## Warum atomar und nicht verdichtet

Zwei Datenmodelle standen zur Wahl: eine Zeile **pro Ereignis**, die erst beim
Lesen gruppiert wird, oder eine **verdichtete Zeile pro Bezug** mit Zähler, die
ein Trigger per `on conflict do update` hochzählt. Es wird die atomare Variante,
aus drei Gründen.

**Der Echtzeitzähler funktioniert nur so.** Bei Standard-Replica-Identity trägt
`payload.old` eines Realtime-Ereignisses nur die Schlüsselspalten, nicht den
alten Zählerstand. Aus einem UPDATE lässt sich damit kein Delta ableiten — der
Browser müsste eine vollständige Karte aller ungelesenen Zeilen mitführen und
bei jedem Seitenwechsel neu aufbauen. Bei atomaren Zeilen bedeutet jedes
Ereignis genau „+1".

**„Neuer Follower" hätte keinen Verdichtungsschlüssel.** Das Bezugsobjekt wäre
`null`, und ein Unique-Index behandelt `null`-Werte als voneinander verschieden.
Der Upsert verdichtete dort still gar nicht — und mit einem einzigen Testkonto
fiele das nie auf.

**Aufräumen kostet nichts.** Zusammengesetzte Fremdschlüssel auf die
Quelltabellen erledigen es: Like zurückgenommen, Kommentar gelöscht, Beitrag
gelöscht, Konto gelöscht — die Benachrichtigung verschwindet mit. Beim
verdichteten Modell müsste ein Dekrement-Trigger den Urheber in einem gekappten
Array wiederfinden, was nicht zuverlässig geht.

Gegen die atomare Variante sprach ein Einwand: Lösch-Ereignisse durchlaufen die
Zugriffsregeln nicht, könnten also bei Clients ankommen, die die Zeile nie sehen
durften. Der Einwand trägt nicht, weil das Leck erst mit `replica identity full`
entsteht — und die wird nicht gesetzt. Bei Standardeinstellung enthält ein
Lösch-Ereignis nur eine nichtssagende UUID. Dieselbe Abwägung steht bereits in
`0009_nachrichten.sql:117-130`.

---

## Datenbank — Migration `0010_benachrichtigungen.sql`

### Tabelle `notifications`

Surrogat-UUID als Primärschlüssel. Pro Ereignistyp ein eigener Spaltensatz, der
per Fremdschlüssel an seiner Quelle hängt:

| `typ` | Spalten | Fremdschlüssel |
|---|---|---|
| `like` | `like_post_id`, `like_actor_id` | → `likes (post_id, user_id)` `on delete cascade` |
| `kommentar` | `comment_id` | → `comments (id)` `on delete cascade` |
| `folgt` | `follow_follower_id` | → `profiles (id)` `on delete cascade` |

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  typ text not null check (typ in ('like', 'kommentar', 'folgt')),
  created_at timestamptz not null default now(),

  like_post_id uuid,
  like_actor_id uuid,
  comment_id uuid references public.comments (id) on delete cascade,
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
    end
  )
);
```

`follow_follower_id` zeigt bewusst auf `profiles` und **nicht** auf `follows`:
Entfolgen soll die Benachrichtigung nicht rückwirkend löschen. „ben ist dir
gefolgt" bleibt wahr, es ist passiert.

Zwei Indizes:

```sql
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Für die 24-Stunden-Sperre beim Folgen.
create index notifications_folgt_idx
  on public.notifications (user_id, follow_follower_id, created_at desc)
  where typ = 'folgt';
```

**Keine `text`-Spalte.** Der Kommentar dazu gehört direkt neben die
Spaltenliste, denn genau hier baut später jemand eine Vorschau ein — und bei
einer Direktnachricht stünde damit der Klartext einer Ende-zu-Ende-verschlüsselten
Nachricht in der Datenbank. Anzeigetexte werden beim Lesen aus den Quelltabellen
geholt.

### Zugriffsregeln

```sql
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications_delete_own"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
```

Kein `insert`, kein `update` für Clients — Zeilen entstehen ausschliesslich per
Trigger. Das weicht vom Hausmuster `using (true)` ab, das fünf der acht
bestehenden Tabellen verwenden. Die Begründung gehört als Kommentar daneben,
sonst „korrigiert" es jemand später zurück.

### Die drei Trigger

`after insert` auf `likes`, `comments` und `follows`. **Nie
`after insert or update`**: `app/actions.ts:37` und `:119` benutzen `upsert`, ein
`or update` erzeugte also bei jedem zweiten Klick auf denselben Knopf eine neue
Zeile.

Alle drei `security definer` mit `set search_path = ''` und voll qualifizierten
Namen. Nicht `set search_path = public` wie in `0005:89` und `0006:80` — das
lässt `pg_temp` implizit zuerst durchsuchen. Bei jenen beiden ist es harmlos
(`security invoker`), hier wäre es es nicht.

Der Urheber kommt **immer aus `NEW.*`**, nie aus `auth.uid()`. Dass `auth.uid()`
in einem `security definer`-Trigger den Auslösenden liefert, ist nirgends
dokumentiert. Der Nebeneffekt ist wertvoll: Der SQL-Editor wird damit zum
vollwertigen Testwerkzeug, denn dort ist `auth.uid()` null.

```sql
create or replace function public.notify_like()
returns trigger language plpgsql security definer set search_path = '' as $$
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
```

`notify_kommentar()` analog über `new.post_id` und `new.author_id`.

`notify_folgt()` braucht keinen Selbstfall — `follows_not_self` (`0004:14`) deckt
ihn schon ab —, dafür die 24-Stunden-Sperre:

```sql
if exists (
  select 1 from public.notifications
  where user_id = new.following_id
    and typ = 'folgt'
    and follow_follower_id = new.follower_id
    and created_at > now() - interval '24 hours'
) then
  return new;
end if;
```

**Kein `exception`-Handler.** Ein stiller Handler liesse Benachrichtigungen
spurlos verschwinden, und in einer App ohne Testverzeichnis wäre das nicht zu
finden. Der Preis ist, dass ein Fehler im Trigger das Liken bricht. Das ist
vertretbar: Es sind zehn Zeilen deterministisches SQL, und kein Trigger berührt
den Nachrichtenpfad.

### Lesemarke `notification_state`

```sql
create table public.notification_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  read_at timestamptz not null default 'epoch'
);
```

Bewusst eine eigene Tabelle und keine Spalte auf `profiles`: dort gilt
`select using (true)` (`0001:33-36`), die Marke wäre also ein für jeden
Angemeldeten abfragbares Anwesenheitsprotokoll — und über `profiles_update_own`
vom Nutzer selbst in die Zukunft setzbar.

Regeln: `select` und `update` auf die eigene Zeile, **kein `insert`**. Die Zeile
legt ein Trigger beim Anlegen des Profils an; ohne INSERT-Regel kann sich
niemand die eigene Zeile vorab mit `read_at = 'infinity'` anlegen und wäre
dauerhaft „gelesen".

```sql
create or replace function public.notification_state_anlegen()
returns trigger language plpgsql security definer set search_path = '' as $$
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
```

### Fortschreiben der Lesemarken

Beide Marken werden **monoton** fortgeschrieben: `greatest(alt, neu)`, nie aus
`now()`. Zeitstempel folgen nicht der Commit-Reihenfolge — mit `now()`
verschluckt man dauerhaft die Ereignisse, die zwischen Lesen und Schreiben
committen. `greatest()` schützt zugleich gegen zwei offene Tabs.

Über PostgREST lässt sich `greatest()` nicht formulieren, deshalb zwei
Funktionen. Beide `security invoker` — damit greifen die bestehenden
Zugriffsregeln, und `auth.uid()` verhält sich wie überall sonst. `security
definer` wird hier ausdrücklich **nicht** gebraucht:

```sql
create or replace function public.benachrichtigungen_gelesen(bis timestamptz)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_state
  set read_at = greatest(read_at, bis)
  where user_id = (select auth.uid());
$$;

create or replace function public.unterhaltung_gelesen(
  conv uuid, bis timestamptz
) returns void language sql security invoker set search_path = '' as $$
  update public.conversation_participants
  set last_read_at = greatest(last_read_at, bis)
  where conversation_id = conv and user_id = (select auth.uid());
$$;
```

Die zweite behebt einen bestehenden Fehler: `last_read_at` wird heute nur
gelesen (`lib/nachrichten.ts:50,104`) und nirgends geschrieben. Der
Ungelesen-Punkt neben jeder Unterhaltung steht deshalb dauerhaft an.

### Ungelesene Nachrichten zählen

```sql
create or replace function public.ungelesene_nachrichten()
returns integer language sql security invoker stable set search_path = '' as $$
  select count(*)::int
  from public.messages m
  join public.conversation_participants p
    on p.conversation_id = m.conversation_id
   and p.user_id = (select auth.uid())
  where m.created_at > p.last_read_at
    and m.sender_id <> (select auth.uid());
$$;
```

`security invoker`, damit die Regel `messages_select_participant` greift. Eigene
Nachrichten zählen nicht mit — sonst erhöhte das Senden den eigenen Zähler.

### Echtzeit

```sql
alter publication supabase_realtime add table public.notifications;
```

`replica identity` bleibt auf `default`. Das ist keine Auslassung, sondern die
Bedingung dafür, dass ein Lösch-Ereignis nur eine nichtssagende UUID trägt. Der
Kommentar dazu gehört in die Migration.

---

## Anwendung

### `lib/benachrichtigungen.ts` (neu, `server-only`)

Fehlende Tabellen werden wie überall über `PGRST205 / 42P01 / PGRST200`
abgefangen und als leeres Ergebnis behandelt (`lib/feed.ts:19-21`).

```ts
export type BenachrichtigungsGruppe = {
  schluessel: string;
  typ: "like" | "kommentar" | "folgt";
  urheber: { handle: string; displayName: string | null }[];
  weitere: number;              // Urheber über die ersten drei hinaus
  neuestesAm: string;
  beitrag: { id: string; caption: string | null } | null;
  kommentarText: string | null; // nur bei typ === "kommentar"
  ungelesen: boolean;
};
```

- `getBenachrichtigungen(userId)` — höchstens **200** Zeilen, mit den
  Quelltabellen gejoint, absteigend nach `created_at`. Gruppiert wird **in
  TypeScript**, wie es `lib/nachrichten.ts:80-96` bereits vormacht.
- `getUngeleseneAnzahl(userId)` — `count` auf `notifications` mit
  `created_at > read_at`, plus `ungelesene_nachrichten()`. Eine Zahl.
- `aufraeumen(userId)` — beim Öffnen der Seite: liest das `created_at` der
  201. Zeile (`order by created_at desc, offset 200, limit 1`) und löscht alles
  Ältere über die `delete`-eigene-Regel. Gibt es keine 201. Zeile, passiert
  nichts. Nach dem Muster `cleanupOwnExpiredStories` (`lib/stories.ts`).
  Kein Kappungs-Trigger:
  der löschte bei naheliegender Formulierung Zeilen fremder Nutzer und erzeugte
  eine Flut ungeprüfter Lösch-Ereignisse. Kein `pg_cron`.

**Keine View** — Supabase legt Views als `postgres` an, und eine vergessene
Zeile `with (security_invoker = on)` gäbe den gesamten Beziehungsgraphen frei.
**Keine Gruppierungs-RPC** — eine `security definer`-Funktion mit `set`-Klausel
kann Postgres nicht inlinen, PostgREST-Filter greifen dann erst nach
vollständiger Materialisierung; ein Cursor wäre reine Kosmetik.

### Gruppierungsregel

Gruppenschlüssel ist `(typ, Bezug, Kalendertag)`:

| `typ` | Bezug | Anzeige |
|---|---|---|
| `like` | `post_id` | „anna, ben und 3 weitere mögen dein Bild" |
| `kommentar` | `post_id` | Text des neuesten Kommentars, dazu „und 2 weitere" |
| `folgt` | keiner | „ben und 2 weitere folgen dir jetzt" |

**Pro Kalendertag**, nicht unbegrenzt. Sonst springt ein Bild vom Januar im
August mit „anna, ben und 46 weitere" nach oben, während die Glocke korrekt „+1"
sagt.

Höchstens drei Urheber werden namentlich genannt, der Rest wird gezählt.

### `app/glocke.tsx` (neu, `"use client"`)

Props: `startwert: number`, `userId: string`.

Basis und Delta werden **getrennt** geführt. `useState(startwert)` friert den
Startwert ein, und Layouts rendern beim Navigieren nicht neu
(`layout.md:152-156`); der Server-Prop ist die Basis, der Zustand hält nur das
Delta seit dem Einhängen. Angezeigt wird die Summe.

Ein Kanal `benachrichtigungen:${userId}`, zwei Bindungen:

1. `postgres_changes` INSERT auf `notifications`, `filter: user_id=eq.${userId}`
2. `postgres_changes` INSERT auf `messages`, **ungefiltert** — WALRUS prüft pro
   Abonnent gegen `private.is_participant`. Ereignisse mit
   `sender_id === userId` werden verworfen.

Beide `.on()` **vor** `.subscribe()`; seit supabase-js 2.101 wirft eine Bindung
danach. Kein DELETE-Abo. Aufräumen im Cleanup über `removeChannel`, genau wie
`chat.tsx:117-119`.

Darstellung: Glockensymbol mit Zahl, `bg-accent` / `text-paper`, ab 99 als
„99+". Der Zähler bekommt `aria-live="polite"` und ein `aria-label`, das die
Zahl in Worte fasst.

### `app/benachrichtigungen/page.tsx` (neu)

Server Component nach dem Muster der übrigen Seiten: `getOwnProfile()`,
`no-session` → `/login`, `table-missing` → `<SetupHinweis />`, kein Profil →
`/willkommen`.

Als gelesen markiert wird **nicht im Rendern**. Prefetching führt
Server-Renderings aus (`prefetching.md:227-231`) — schon das Überfahren des
Glockenlinks leerte sonst den Zähler. Stattdessen ruft eine kleine
Client-Komponente beim Einhängen eine Server Action auf, die
`benachrichtigungen_gelesen(<grösstes created_at der gezeigten Liste>)`
ausführt.

Leerzustand in der Tonlage des Projekts: ein Satz, der sagt, was passieren wird,
keine Entschuldigung.

Bei `typ === 'folgt'` steht ein „Zurückfolgen"-Knopf in der Zeile, der die
bestehende `setFollow`-Action benutzt.

### `app/kopfzeile.tsx` (erweitert)

Neue Eigenschaft `variante: "voll" | "schmal"`. Die Glocke sitzt in beiden in
der Aktionszeile rechts, zwischen „Nachrichten" und „@handle".

- **voll** — wie bisher: Wortzeichen, „Bild hochladen", „Nachrichten", Glocke,
  „@handle", darunter die drei Reiter. Bleibt auf `/`, `/entdecken`, `/suche`,
  `/tag/[tag]`.
- **schmal** — Wortzeichen als Link auf `/`, rechts „Nachrichten", Glocke,
  „@handle". Kein „Bild hochladen"-Knopf, keine Reiterzeile. Optional ein
  `kontext`-Element, das die Seite als zusätzlichen Link einhängt — damit
  überlebt etwa „Jemanden anschreiben" auf `/nachrichten`.

Die schmale Variante ersetzt **sechs** handgebaute Kopfzeilen: `/p/[id]`,
`/u/[handle]`, `/nachrichten`, `/nachrichten/[id]`, `/profil` und `/hochladen`.

Bei `/hochladen` verschwinden damit `items-baseline` und der fehlende
`border-b` — beides war beiläufig, nicht beabsichtigt. Der grössere Abstand
(`py-16`) bleibt, er gehört ohnehin an das `<main>` und nicht an die Kopfzeile.

Die Kopfzeile kommt **nicht** in `app/layout.tsx`. Layouts rendern beim
Navigieren nicht neu, der serverseitige Startwert veraltete dort, und nach
Zurück/Vorwärts lieferte der Client-Zwischenspeicher alte Werte.

Jede Seite, die die Kopfzeile rendert, holt den Startwert über
`getUngeleseneAnzahl` — parallel zu ihren übrigen Abfragen, nicht davor.

### `app/nachrichten/[id]` (Änderung)

Beim Öffnen einer Unterhaltung wird `unterhaltung_gelesen(id, <jetzt>)`
aufgerufen — nach demselben Muster wie oben, aus einer Client-Komponente beim
Einhängen, nicht im Rendern.

### `supabase/testnutzer.sql` (erweitert)

Kopierfertige `insert`-Anweisungen, die im SQL-Editor Likes, Kommentare und
Follows im Namen der Testprofile erzeugen. Weil die Trigger den Urheber aus
`NEW.*` lesen und nicht aus `auth.uid()`, lösen sie dort echte
Benachrichtigungen aus.

---

## Was das nicht kann

**Ein zurückgenommenes Like senkt die Glocke erst beim nächsten
Server-Rendern.** Lösch-Ereignisse werden bewusst nicht abonniert, weil sie die
Zugriffsregeln nicht durchlaufen. Die Zeile verschwindet sofort aus der
Datenbank; nur die Zahl im Browser hinkt bis zur nächsten Navigation hinterher.

**Die Zahl an der Glocke zählt Ereignisse, die Liste zeigt Gruppen.** Bei fünf
Likes auf dasselbe Bild steht an der Glocke „5", in der Liste eine Zeile. Das
ist Absicht: Nur ein Ereignis-Zähler lässt sich aus einem Realtime-Ereignis ohne
Server-Rundreise fortschreiben.

**Mit einem Konto lässt sich über die Oberfläche keine einzige Benachrichtigung
auslösen**, weil die Trigger den Selbstfall unterdrücken. Prüfen geht nur über
den SQL-Editor oder mit weiteren Konten; für „anna, ben und 3 weitere" braucht
es fünf.

**Kein Blocken, kein Stummschalten.** Die Glocke macht aus der passiven Ablage
unter `/nachrichten` einen aktiven Zustellkanal, den jeder beliebig oft bedienen
kann. `get_or_create_dm` prüft heute nur Existenz und Selbstfall. Das ist ein
eigenes Vorhaben, aber es sollte vor der ersten Auslieferung an Fremde kommen.

**Kein Blättern.** 200 Zeilen sind das Fenster, ältere werden beim Lesen
gelöscht. Ohne Kappung pro Typ kann jemand mit vielen Kommentaren ältere
Einträge verdrängen.

**`postgres_changes` statt Broadcast**, aus denselben Gründen wie bei den
Nachrichten (`0009_nachrichten.sql:117-130`). Ein späterer Umstieg ändert die
Form der Nutzlast (`record`/`old_record` statt `new`/`old`) und erzwingt eine
Anpassung im Browser.

## Reihenfolge der Umsetzung

1. Migration `0010` schreiben, im SQL-Editor anwenden, Trigger dort direkt prüfen
2. `lib/benachrichtigungen.ts` samt Gruppierung
3. `app/glocke.tsx` und die Erweiterung der Kopfzeile
4. Die sechs handgebauten Kopfzeilen durch die schmale Variante ersetzen
5. `app/benachrichtigungen/page.tsx` und das Markieren als gelesen
6. `unterhaltung_gelesen` in `/nachrichten/[id]` einhängen
7. `supabase/testnutzer.sql`, README und SETUP nachziehen

`npm run check` muss die neue Migration erkennen — das Skript prüft die
Vollständigkeit der Einrichtung und braucht den neuen Tabellennamen.
