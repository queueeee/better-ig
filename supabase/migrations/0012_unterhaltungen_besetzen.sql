-- Migration 0012: Das Besetzen von Unterhaltungen unterbinden
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
-- Die Datei als GANZES einfügen.
--
-- ---------------------------------------------------------------------
-- Was 0011 übersehen hat
-- ---------------------------------------------------------------------
--
-- 0011 hat verhindert, dass sich jemand in eine FREMDE Unterhaltung
-- einträgt. Es hat nicht verhindert, dass er sich vorher eine EIGENE
-- anlegt, die für zwei andere Leute gedacht ist.
--
-- Die Zusage in 0011 („Der INHALT bleibt sicher … es geht um Metadaten,
-- nicht um Klartext") war deshalb falsch. Hier steht, warum.
--
-- conversations_insert_own (0007:107-110) prüft nur created_by. Nicht
-- geprüft wird dm_key — und der ist es, der ein Zweiergespräch
-- identifiziert: die beiden Nutzer-IDs kanonisch sortiert und verkettet
-- (0007:170-171). Nutzer-IDs sind für jeden Angemeldeten lesbar
-- (profiles_select_authenticated, 0001:33-36).
--
-- Daraus wird folgende Kette:
--
--   1. Der Angreifer bildet den dm_key für zwei beliebige Personen A und B
--      und legt damit selbst eine Unterhaltung an. Der Unique-Index
--      conversations_dm_key_idx gehört ab jetzt ihm.
--   2. Er trägt sich selbst als Teilnehmer ein — und danach A und B, denn
--      wer dabei ist, darf weitere hinzufügen.
--   3. Er legt für A und B je eine conversation_keys-Zeile an, verschlüsselt
--      auf deren öffentliche Schlüssel, mit einem Unterhaltungsschlüssel,
--      den er selbst gewählt hat. Die Regel dort (0009:39-42) prüft nur, ob
--      er Teilnehmer ist, nicht für WEN er die Zeile anlegt.
--   4. Klickt A später auf „schreiben", findet get_or_create_dm die
--      vorhandene Zeile über den dm_key und gibt sie zurück, ohne
--      Teilnehmer nachzutragen (0007:173-176) — es sind ja schon welche da.
--   5. lib/schluesselbund.ts:257-261 nimmt die vorgefundene Schlüsselzeile,
--      ohne zu prüfen, wer sie geschrieben hat. A und B verschlüsseln
--      fortan mit dem Schlüssel des Angreifers.
--
-- Fälschen kann er nichts — Nachrichten sind signiert, und die
-- Signaturschlüssel liegen in user_keys. Mitlesen kann er alles.
--
-- Zwei Dinge begrenzen den Schaden, ohne ihn zu entschärfen: Die Kette
-- braucht 0011 nicht, sie funktioniert genauso unter 0007. Und sie
-- funktioniert nur, BEVOR die beiden je geschrieben haben — ist der dm_key
-- schon vergeben, scheitert Schritt 1 am Unique-Index. Bestehende
-- Unterhaltungen sind unberührt.

-- ---------------------------------------------------------------------
-- Schritt 1: Unterhaltungen entstehen nur noch über get_or_create_dm
-- ---------------------------------------------------------------------

-- Das ist der Riegel, der die ganze Kette an ihrem ersten Glied durchtrennt.
--
-- Er kostet nichts: Kein Anwendungscode legt je selbst eine Unterhaltung
-- an. Die einzigen Schreibzugriffe des Browsers gehen auf user_keys,
-- wrapped_keys, conversation_keys, posts, comments, profiles und messages
-- (geprüft über das gesamte app/ und lib/). Zweiergespräche entstehen
-- ausschliesslich über get_or_create_dm, und die Funktion ist security
-- definer — sie läuft an Regeln und Rechten vorbei und ist davon nicht
-- betroffen.
--
-- Wenn Gruppen eine Oberfläche bekommen, brauchen sie dasselbe: eine
-- eigene Funktion, die created_by und dm_key selbst setzt, statt dem
-- Browser das Anlegen zu erlauben. Das ist keine Einschränkung, sondern
-- die Lehre aus dieser Lücke.
drop policy "conversations_insert_own" on public.conversations;

revoke insert on public.conversations from authenticated, anon;

-- ---------------------------------------------------------------------
-- Schritt 2: In ein Zweiergespräch kommt niemand dazu
-- ---------------------------------------------------------------------

-- Auch ohne Schritt 1 wäre Schritt 2 der Kette zu eng zu fassen: Ein
-- Zweiergespräch hat per Definition zwei Teilnehmer — das steht im dm_key,
-- und die Bedingung conversations_dm_key_shape (0007:38-40) erzwingt, dass
-- genau die Nicht-Gruppen einen haben.
--
-- Wer jemanden hinzufügen darf, ist damit auf Gruppen beschränkt. Für
-- Zweiergespräche setzt allein get_or_create_dm die Teilnehmer, und zwar
-- beide auf einmal.
--
-- Nebenwirkung, die erwünscht ist: Bisher hätte man eine dritte Person in
-- sein eigenes Zweiergespräch holen können. Der Inhalt wäre für sie zwar
-- unlesbar gewesen, die Metadaten aber nicht.
drop policy "participants_insert_dabei_oder_ersteller"
  on public.conversation_participants;

create policy "participants_insert_nur_gruppen"
  on public.conversation_participants
  for insert to authenticated
  with check (
    (
      private.is_participant(conversation_id)
      or private.hat_erstellt(conversation_id)
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.is_group
    )
  );

-- Der Unterabfrage auf conversations steht keine Rekursion im Weg: Ihre
-- Leseregel (0007:102-105) ruft private.is_participant, und die ist
-- security definer in einem nicht exponierten Schema — sie fragt
-- conversation_participants also an deren eigener Regel vorbei ab. Das ist
-- derselbe Grund, aus dem es diese Funktion überhaupt gibt (0007:69-77).

-- ---------------------------------------------------------------------
-- Schritt 3: Unveränderlichkeit nicht nur über Rechte
-- ---------------------------------------------------------------------

-- 0011 hat das Umhängen einer Teilnehmerzeile über ein Spaltenrecht
-- unterbunden. Das wirkt, hängt aber an einem Grant: Ein späteres
-- "grant all on all tables in schema public to authenticated" — eine Zeile,
-- die in Supabase-Anleitungen häufig vorkommt — öffnet es lautlos wieder,
-- ohne dass sich eine einzige Regel ändert.
--
-- Ein Trigger hängt an nichts dergleichen. Er ist hier die eigentliche
-- Zusicherung; das Spaltenrecht bleibt als zweite Schicht bestehen.
create or replace function public.teilnehmer_unveraenderlich()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.user_id is distinct from old.user_id
     or new.joined_at is distinct from old.joined_at then
    raise exception
      'An einer Teilnehmerzeile darf sich nur die Lesemarke ändern.';
  end if;
  return new;
end;
$$;

create trigger teilnehmer_unveraenderlich_trigger
  before update on public.conversation_participants
  for each row execute function public.teilnehmer_unveraenderlich();

-- anon hatte aus den Supabase-Vorgaben weiterhin das volle UPDATE-Recht.
-- Ausnutzbar war das nicht, weil keine Regel auf anon lautet — aber die
-- Begründung von 0011 galt damit nur für eine der beiden Browser-Rollen.
revoke update on public.conversation_participants from anon;

-- ---------------------------------------------------------------------
-- Nachsehen, ob die Lücke genutzt wurde
-- ---------------------------------------------------------------------

-- Die Probe aus 0011 taugte nicht: Sie sah in conversation_participants
-- nach, und dort räumt participants_delete_self (0007:131) jede Spur weg.
--
-- conversations kennt weder eine UPDATE- noch eine DELETE-Regel. Was dort
-- steht, bleibt stehen — und damit ist es die verlässliche Stelle: Bei
-- einem Zweiergespräch MUSS der Anleger eine der beiden Personen sein,
-- deren IDs im dm_key stehen. Ist er es nicht, hat jemand besetzt.
--
--   select id, dm_key, created_by, created_at
--   from public.conversations
--   where is_group = false
--     and created_by::text not in (
--       split_part(dm_key, ':', 1),
--       split_part(dm_key, ':', 2)
--     );
--
-- Leeres Ergebnis heisst: niemand hat die Lücke genutzt. Kommt etwas
-- zurück, gehört die betroffene Unterhaltung samt ihrer Nachrichten und
-- Schlüssel gelöscht — und die beiden Betroffenen müssen wissen, dass
-- mitgelesen wurde.

-- ---------------------------------------------------------------------
-- Was offen bleibt
-- ---------------------------------------------------------------------

-- lib/schluesselbund.ts:257-261 nimmt weiterhin jede vorgefundene
-- conversation_keys-Zeile, ohne zu prüfen, wer sie abgelegt hat. Mit den
-- Schritten oben kommt niemand Unbefugtes mehr in die Lage, eine
-- unterzuschieben — der Weg dorthin ist zu.
--
-- Sauber wäre es trotzdem erst, wenn die Zeile eine Absenderspalte trüge
-- und der Empfänger die Signatur des Absenders gegen dessen
-- signing_public_key prüfte, so wie es bei Nachrichten längst geschieht
-- (0009:58-61). Das ist eine Änderung an der Krypto-Schicht und am
-- Datenmodell, keine an den Zugriffsregeln, und gehört deshalb nicht in
-- diese Migration.
