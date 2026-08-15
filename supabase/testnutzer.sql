-- Zweiter Nutzer zum Testen — nur für die Entwicklung.
--
-- Folgen, fremde Profile und Kommentare unter fremden Bildern lassen sich
-- mit einem einzigen Konto nicht ausprobieren. Solange in Resend keine
-- eigene Domain verifiziert ist, kommt an eine zweite Adresse aber keine
-- Anmeldemail. Dieser Weg umgeht den Mailversand.
--
-- Man kann sich als dieser Nutzer NICHT anmelden — er existiert nur, damit
-- es jemanden gibt, dem man folgen kann und dessen Profil man sieht.

-- SCHRITT 1 — Konto anlegen (im Dashboard, nicht hier):
--   Authentication → Users → „Add user" → „Create new user"
--   E-Mail: test@example.com, irgendein Passwort
--   Haken bei „Auto Confirm User" setzen
--   Danach die angezeigte User-ID (UUID) kopieren.

-- SCHRITT 2 — Profil dazu anlegen. UUID unten einsetzen:

insert into public.profiles (id, handle, display_name)
values (
  '00000000-0000-0000-0000-000000000000',  -- ← User-ID aus Schritt 1
  'testkonto',
  'Testkonto'
)
on conflict (id) do nothing;

-- SCHRITT 3 — Im Browser /u/testkonto aufrufen und auf „Folgen" klicken.
-- Danach zeigt der Hauptfeed, was dieses Profil hochlädt.

-- Bilder für das Testkonto gibt es auf diesem Weg nicht (dafür bräuchte es
-- einen echten Upload). Zum Prüfen von Folgen, Zählern und Profilseite
-- reicht es trotzdem.

-- AUFRÄUMEN, wenn nicht mehr gebraucht:
--   delete from public.profiles where handle = 'testkonto';
--   danach im Dashboard unter Authentication → Users das Konto löschen.

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
