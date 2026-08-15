-- Migration 0013: Herkunft der Unterhaltungsschlüssel
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
-- Die Datei als GANZES einfügen.
--
-- ---------------------------------------------------------------------
-- Worum es geht
-- ---------------------------------------------------------------------
--
-- Eine conversation_keys-Zeile sagt bisher nicht, WER sie abgelegt hat.
-- Der Empfänger entschlüsselt sie mit seinem privaten Austauschschlüssel
-- und benutzt den darin enthaltenen Unterhaltungsschlüssel — ohne je zu
-- prüfen, von wem er stammt (lib/schluesselbund.ts:257-261).
--
-- Bei Nachrichten macht die App es längst richtig: Jede trägt eine
-- Signatur über Unterhaltung, Absender und Chiffrat (0009:58-61), und der
-- Empfänger prüft sie gegen den Signaturschlüssel des Absenders. Genau
-- das fehlt an der Stelle, an der es am meisten zählt — beim Schlüssel
-- selbst. Eine untergeschobene Nachricht fällt auf; ein untergeschobener
-- Schlüssel bewirkt, dass beide Seiten freiwillig für den Angreifer
-- verschlüsseln, und dabei sieht alles normal aus.
--
-- 0012 hat den bekannten Weg dorthin geschlossen (Unterhaltungen lassen
-- sich nicht mehr besetzen). Diese Migration macht die Schlüsselzustellung
-- unabhängig davon überprüfbar, statt sich auf eine Zugriffsregel zu
-- verlassen.

-- ---------------------------------------------------------------------
-- Zwei neue Spalten
-- ---------------------------------------------------------------------

-- Nullbar, und das ist eine bewusste Entscheidung: Bestehende Zeilen haben
-- keine Signatur. Wären die Spalten NOT NULL, müssten sie gelöscht werden
-- — und damit wären alle bisherigen Unterhaltungen dauerhaft unlesbar,
-- denn conversation_keys kennt kein Update und keinen zweiten Weg.
--
-- Erzwungen wird beides trotzdem, nur eine Ebene höher: Die Einfügeregel
-- unten lässt keine neue Zeile ohne Absender und Signatur durch. Eine
-- unsignierte Zeile kann also ausschliesslich aus der Zeit vor dieser
-- Migration stammen. Der Browser zeigt sie mit ausdrücklichem Hinweis an,
-- statt sie stillschweigend zu benutzen.
alter table public.conversation_keys
  add column sender_id uuid references public.profiles (id) on delete set null,
  add column signature text;

-- on delete set null, nicht cascade: Löscht der Absender sein Konto, soll
-- die Unterhaltung für die übrigen Teilnehmer nicht verschwinden. Prüfbar
-- ist sie dann ohnehin nicht mehr — sein Signaturschlüssel verschwindet
-- mit ihm (user_keys hängt per cascade an profiles, 0008:18).

comment on column public.conversation_keys.sender_id is
  'Wer diese Zeile abgelegt hat. Null nur bei Zeilen von vor 0013.';
comment on column public.conversation_keys.signature is
  'ECDSA über conversation|sender|empfaenger|ephemeral|iv|data.';

-- Beide Spalten kommen nur als Paar vor. Ohne diese Bedingung liesse sich
-- eine Zeile mit Absender, aber ohne Signatur ablegen — und die sähe im
-- Browser aus wie Altbestand.
alter table public.conversation_keys
  add constraint conversation_keys_herkunft_paarweise
  check ((sender_id is null) = (signature is null));

-- „Vorhanden" heisst nicht „nicht null", sondern „sieht aus wie eine
-- Signatur". Sonst genügte eine leere Zeichenkette, um an der Regel unten
-- vorbeizukommen: Sie ist nicht null, im Browser aber falsy — die Zeile
-- fiele in den Zweig für unsignierten Altbestand und würde benutzt.
--
-- Eine ECDSA-P-256-Signatur sind 64 Byte, base64 also 88 Zeichen. Die
-- Grenzen sind bewusst weit gefasst; sie sollen Unsinn abweisen, nicht
-- eine Kodierung festschreiben.
alter table public.conversation_keys
  add constraint conversation_keys_signature_form
  check (signature is null or char_length(signature) between 64 and 512);

-- ---------------------------------------------------------------------
-- Die Einfügeregel
-- ---------------------------------------------------------------------

-- Bisher genügte "ist Teilnehmer". Damit konnte jeder Teilnehmer für jeden
-- anderen eine Schlüsselzeile ablegen und dabei behaupten, sie käme von
-- irgendwem.
--
-- sender_id = auth.uid() nagelt die Behauptung an der Datenbank fest, die
-- Signatur an der Kryptografie. Beides zusammen, weil die Datenbank nicht
-- rechnen kann, was in der Signatur steht, und die Signatur allein nicht
-- verhindert, dass jemand eine fremde Zeile mit gültiger Signatur an eine
-- andere Stelle kopiert.
drop policy "conversation_keys_insert_participant" on public.conversation_keys;

create policy "conversation_keys_insert_signiert"
  on public.conversation_keys
  for insert to authenticated
  with check (
    private.is_participant(conversation_id)
    and sender_id = (select auth.uid())
    and signature is not null
  );

-- Weiterhin bewusst kein update und kein delete: Eine einmal abgelegte
-- Schlüsselzeile bleibt, wie sie ist. Könnte man sie ersetzen, liesse sich
-- eine geprüfte gegen eine untergeschobene tauschen, nachdem der Empfänger
-- sie einmal akzeptiert hat.

-- ---------------------------------------------------------------------
-- Nachsehen, was an Altbestand da ist
-- ---------------------------------------------------------------------

--   select count(*) filter (where signature is null) as ohne_signatur,
--          count(*) filter (where signature is not null) as mit_signatur
--   from public.conversation_keys;
--
-- Solange "ohne_signatur" grösser als 0 ist, zeigt die App bei diesen
-- Unterhaltungen einen Hinweis. Steht dort irgendwann 0 — etwa weil die
-- betroffenen Unterhaltungen gelöscht wurden —, können die Spalten per
-- Folgemigration auf NOT NULL gesetzt und der Hinweis entfernt werden:
--
--   alter table public.conversation_keys
--     alter column sender_id set not null,
--     alter column signature set not null;
