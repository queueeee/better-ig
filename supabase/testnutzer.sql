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

-- SCHRITT 2 — Diese Datei im SQL-Editor ausführen. Nichts anzupassen.

-- Erst nachsehen, ob Schritt 1 erledigt ist. Ohne diese Prüfung scheitert
-- das Einfügen unten am Fremdschlüssel profiles_id_fkey — mit einer
-- Meldung, die nicht verrät, was zu tun ist.
do $$
begin
  if not exists (
    select 1 from auth.users where email = 'test@example.com'
  ) then
    -- Eine einzige Zeichenkette über mehrere Zeilen, nicht mehrere
    -- aneinandergereihte: RAISE erwartet ein Literal, keinen Ausdruck.
    raise exception 'Kein Konto mit test@example.com gefunden.
Erst Schritt 1 erledigen: Dashboard → Authentication → Users → „Add user"
→ „Create new user", E-Mail test@example.com, Haken bei „Auto Confirm User".
Danach diese Datei nochmal ausführen.';
  end if;
end
$$;

-- Die User-ID wird nachgeschlagen statt abgetippt. Der SQL-Editor läuft als
-- postgres und darf auth.users lesen; damit entfällt der Schritt, bei dem
-- man eine UUID von Hand herüberkopiert — und mit ihm die Möglichkeit, ihn
-- zu vergessen.
insert into public.profiles (id, handle, display_name)
select id, 'testkonto', 'Testkonto'
from auth.users
where email = 'test@example.com'
on conflict do nothing;

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

-- ZUM AUFRÄUMEN. Es genügt, die Ereignisse des Testkontos zu löschen —
-- die Benachrichtigungen verschwinden von selbst mit, weil sie per
-- Fremdschlüssel an ihnen hängen. Das ist zugleich die einfachste Probe,
-- dass die Kaskade wirklich greift: Vorher zählen, löschen, nachzählen.
--
--   select count(*) from public.notifications;
--
--   delete from public.likes l    using public.profiles p
--     where l.user_id   = p.id and p.handle = 'testkonto';
--   delete from public.comments c using public.profiles p
--     where c.author_id = p.id and p.handle = 'testkonto';
--   delete from public.follows f  using public.profiles p
--     where f.follower_id = p.id and p.handle = 'testkonto';
--
--   select count(*) from public.notifications;   -- muss 0 sein
--
-- auth.uid() ist im SQL-Editor null — eine Bedingung darauf trifft dort
-- nie zu und löscht lautlos nichts.
