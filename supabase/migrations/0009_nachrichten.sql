-- Migration 0009: Verschlüsselte Nachrichten
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------
-- Zugestellte Unterhaltungsschlüssel
-- ---------------------------------------------------------------------

-- Jede Unterhaltung hat einen zufälligen Schlüssel. Für jeden Teilnehmer
-- liegt hier eine Kopie, die nur er öffnen kann: verschlüsselt über ein
-- Diffie-Hellman-Geheimnis aus einem einmaligen Schlüsselpaar des
-- Absenders und dem öffentlichen Schlüssel des Empfängers.
--
-- Der Server sieht nur Chiffrat. Er kennt aber die Zuordnung, wer in
-- welcher Unterhaltung ist — Metadaten bleiben sichtbar.
create table public.conversation_keys (
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- Öffentlicher Teil des einmaligen Schlüsselpaars.
  ephemeral_public_key text not null,
  iv text not null,
  data text not null,

  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_keys enable row level security;

create policy "conversation_keys_select_own"
  on public.conversation_keys
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Einfügen darf, wer selbst in der Unterhaltung ist — beim Anlegen für
-- sich und die anderen Teilnehmer.
create policy "conversation_keys_insert_participant"
  on public.conversation_keys
  for insert to authenticated
  with check (private.is_participant(conversation_id));

-- ---------------------------------------------------------------------
-- Nachrichten
-- ---------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,

  -- Der Inhalt, verschlüsselt mit dem Unterhaltungsschlüssel.
  iv text not null,
  data text not null,

  -- Signatur des Absenders über Unterhaltung, Absender und Chiffrat.
  -- Ohne sie könnte jeder Teilnehmer — und der Server — Nachrichten im
  -- Namen anderer einschleusen, und die App würde sie als echt anzeigen.
  signature text not null,

  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

alter table public.messages enable row level security;

create policy "messages_select_participant"
  on public.messages
  for select to authenticated
  using (private.is_participant(conversation_id));

create policy "messages_insert_participant"
  on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_participant(conversation_id)
  );

create policy "messages_delete_own"
  on public.messages
  for delete to authenticated
  using (sender_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Übersicht aktuell halten
-- ---------------------------------------------------------------------

-- Damit die Liste der Unterhaltungen nach letzter Nachricht sortiert
-- werden kann, ohne pro Unterhaltung eine Abfrage abzusetzen.
create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation_trigger
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

-- ---------------------------------------------------------------------
-- Echtzeit
-- ---------------------------------------------------------------------

-- Hier bewusst Postgres-Changes statt des empfohlenen Broadcast.
--
-- Supabase rät für neue Projekte zu Broadcast, weil Postgres-Changes die
-- Zugriffsregeln pro Empfänger und Ereignis einzeln prüft und damit ab
-- einigen tausend Nachrichten pro Sekunde an eine Grenze stösst. Bei
-- dieser Grössenordnung ist das kein Thema, und Broadcast bräuchte
-- zusätzlich eigene Regeln auf realtime.messages plus private Kanäle.
--
-- Der bekannte Haken von Postgres-Changes ist, dass Zugriffsregeln beim
-- LÖSCHEN nicht angewendet werden — ein Lösch-Ereignis kann also bei
-- Clients ankommen, die die Zeile nie sehen durften. Für Klartext wäre
-- das ein Ausschlusskriterium; hier enthält ein solches Ereignis nur
-- Bezeichner, keinen Inhalt, weil der Inhalt verschlüsselt ist und der
-- Schlüssel diesen Clients ohnehin fehlt.
alter publication supabase_realtime add table public.messages;
