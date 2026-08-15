-- Migration 0011: Teilnehmerregeln abdichten
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
-- Die Datei als GANZES einfügen, damit die Transaktionsgarantie greift.
--
-- ---------------------------------------------------------------------
-- Worum es geht
-- ---------------------------------------------------------------------
--
-- 0007 hat zwei Lücken, die zusammen dazu führen, dass jeder Angemeldete
-- die Metadaten jeder Unterhaltung lesen kann, deren Kennung er kennt.
--
-- Erstens die Einfügeregel (0007:121-127):
--
--   with check (
--     user_id = (select auth.uid())
--     or private.is_participant(conversation_id)
--   )
--
-- Der erste Teil allein genügt. Wer eine Unterhaltungs-Kennung hat, trägt
-- sich mit einem einzigen PostgREST-Aufruf selbst als Teilnehmer ein. Der
-- Kommentar darüber („Damit kann niemand Fremde in fremde Gespräche
-- setzen") beschreibt nur die andere Hälfte des Problems — Fremde
-- hineinsetzen geht wirklich nicht, sich selbst aber schon.
--
-- Zweitens die Änderungsregel (0007:136-140): Sie nagelt user_id fest,
-- erwähnt conversation_id aber weder in using noch in with check. Damit
-- lässt sich die eigene Teilnehmerzeile auf eine fremde Unterhaltung
-- umhängen — derselbe Effekt ohne Einfügen.
--
-- Danach greift messages_select_participant, und man liest Chiffrat samt
-- Teilnehmerliste, Absendern, Zeitstempeln und Nachrichtenaufkommen.
--
-- ACHTUNG — der folgende Absatz war FALSCH. Er bleibt hier stehen, damit
-- nachvollziehbar ist, was diese Migration angenommen hat; berichtigt wird
-- er von 0012_unterhaltungen_besetzen.sql, das auch den Weg schliesst:
--
--   „Der INHALT bleibt sicher: Ohne eine conversation_keys-Zeile, die auf
--   den eigenen öffentlichen Schlüssel verschlüsselt ist, ist das Chiffrat
--   wertlos, und die Einfügeregel dort (0009:39-42) lässt sich nicht dazu
--   bringen, eine anzulegen. Es geht also um Metadaten, nicht um Klartext."
--
-- Warum das nicht stimmt: Wer eine Unterhaltung selbst ANLEGT, ist
-- Teilnehmer — und darf damit conversation_keys-Zeilen für alle anderen
-- Teilnehmer ablegen, mit einem Schlüssel seiner Wahl. Da
-- conversations_insert_own den dm_key nicht prüft, kann er die Unterhaltung
-- zweier fremder Leute vorab besetzen. Es geht also sehr wohl um Klartext.
-- Die vollständige Kette steht in 0012.
--
-- Die Hürde bleibt die Kennung — erraten kann man sie nicht, aber sie steht
-- in der Adresszeile, ein geteilter Screenshot genügt.
--
-- ---------------------------------------------------------------------
-- Warum das Abdichten nichts kostet
-- ---------------------------------------------------------------------
--
-- Der grosszügige Teil der Regel deckt keinen einzigen echten Fall ab:
-- Der Anwendungscode fügt nie selbst Teilnehmer ein. Zweiergespräche
-- entstehen ausschliesslich über get_or_create_dm (0007:148), und die
-- Funktion ist security definer — sie setzt beide Teilnehmer selbst, an
-- den Zugriffsregeln vorbei. In lib/nachrichten.ts stehen nur Lesezugriffe.
--
-- Für Gruppen gibt es noch keine Oberfläche. Damit sie später funktioniert,
-- ohne dass jemand diese Regel wieder aufweicht, darf auch einfügen, wer
-- die Unterhaltung angelegt hat — sonst käme der Ersteller nicht in seine
-- eigene frische Gruppe hinein.

-- ---------------------------------------------------------------------
-- Hilfsfunktion: Habe ich diese Unterhaltung angelegt?
-- ---------------------------------------------------------------------

-- Dieselbe Begründung wie bei private.is_participant (0007:69-77): Die
-- Prüfung muss an den Zugriffsregeln vorbei laufen, sonst dreht sie sich
-- im Kreis — conversations darf nur lesen, wer Teilnehmer ist, und genau
-- das wird hier ja erst entschieden.
--
-- search_path = '' statt = public, pg_temp: strenger als 0007, weil alle
-- Namen ohnehin qualifiziert sind. Der Rest folgt 0007 wörtlich, denn
-- dieses Muster ist in diesem Projekt erprobt.
create or replace function private.hat_erstellt(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations
    where id = conv
      and created_by = (select auth.uid())
  );
$$;

revoke all on function private.hat_erstellt(uuid) from public, anon;
grant execute on function private.hat_erstellt(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Lücke 1: Einfügen
-- ---------------------------------------------------------------------

drop policy "participants_insert" on public.conversation_participants;

-- Hinzufügen darf, wer selbst dabei ist oder die Unterhaltung angelegt
-- hat. Was fehlt, ist das „oder ich füge mich selbst ein" von vorher —
-- genau das war die Lücke.
create policy "participants_insert_dabei_oder_ersteller"
  on public.conversation_participants
  for insert to authenticated
  with check (
    private.is_participant(conversation_id)
    or private.hat_erstellt(conversation_id)
  );

-- ---------------------------------------------------------------------
-- Lücke 2: Umhängen
-- ---------------------------------------------------------------------

-- Nicht über die Zugriffsregel, sondern über Spaltenrechte. Eine Regel
-- kann beim UPDATE alte und neue Zeile nicht miteinander vergleichen; sie
-- könnte also nie ausdrücken „conversation_id muss dieselbe bleiben".
-- Ein Spaltenrecht kann es: Was nicht schreibbar ist, kann sich nicht
-- ändern.
--
-- Die einzige Änderung, die dieser Tabelle je zusteht, ist die Lesemarke
-- (public.unterhaltung_gelesen aus 0010). joined_at, user_id und
-- conversation_id werden ausschliesslich beim Anlegen gesetzt.
--
-- service_role behält seine vollen Rechte — nur die Rolle, unter der
-- Browser-Anfragen laufen, wird eingeschränkt.
revoke update on public.conversation_participants from authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;

-- participants_update_own (0007:136) bleibt, wie es ist: Es entscheidet
-- weiterhin, WELCHE Zeile man ändern darf, und das war nie das Problem.

-- ---------------------------------------------------------------------
-- Nachsehen, ob die Lücke genutzt wurde
-- ---------------------------------------------------------------------

-- Bei einem Zweiergespräch steht in conversations.dm_key, wer dazugehört:
-- die beiden Nutzer-IDs kanonisch sortiert und mit ':' verkettet
-- (0007:170-171). Eine Teilnehmerzeile, deren user_id dort nicht vorkommt,
-- kann nicht von get_or_create_dm stammen — sie wäre selbst eingetragen.
--
-- Die Abfrage steht bewusst nur als Kommentar da. Sie zu automatisieren
-- hiesse, im selben Zug Zeilen zu löschen, die Menschen gehören; das ist
-- eine Entscheidung für einen Menschen, nicht für eine Migration.
--
--   select p.conversation_id, p.user_id, c.dm_key
--   from public.conversation_participants p
--   join public.conversations c on c.id = p.conversation_id
--   where c.is_group = false
--     and p.user_id::text not in (
--       split_part(c.dm_key, ':', 1),
--       split_part(c.dm_key, ':', 2)
--     );
--
-- ACHTUNG: Auch diese Probe taugt nicht. participants_delete_self
-- (0007:131) erlaubt jedem, seine eigene Teilnehmerzeile wieder zu
-- entfernen — wer nach dem Mitlesen aufräumt, hinterlässt hier nichts.
-- Die verlässliche Probe steht in 0012 und setzt an conversations an, wo
-- es weder eine UPDATE- noch eine DELETE-Regel gibt.

-- ---------------------------------------------------------------------
-- Was diese Migration NICHT behebt
-- ---------------------------------------------------------------------

-- Wer ein Zweiergespräch verlässt (participants_delete_self, 0007:131),
-- kommt danach nicht mehr hinein: get_or_create_dm findet die vorhandene
-- Unterhaltung über dm_key und gibt sie zurück, ohne Teilnehmer
-- nachzutragen — sichtbar ist sie dann für den Zurückkehrenden nicht mehr.
--
-- Vorher liess sich das versehentlich über die zu weite Einfügeregel
-- heilen. Erreichbar ist es weder vorher noch nachher: Die Oberfläche hat
-- keinen Knopf zum Verlassen. Wer einen baut, muss get_or_create_dm
-- gleichzeitig beibringen, fehlende Teilnehmer nachzutragen — oder
-- bewusst entscheiden, dass Verlassen endgültig ist.
