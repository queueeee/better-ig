-- Migration 0008: Schlüsselverzeichnis
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------
-- Öffentliche Schlüssel
-- ---------------------------------------------------------------------

-- Für alle Angemeldeten lesbar, denn genau dafür sind sie da: Wer jemandem
-- schreiben will, braucht dessen öffentlichen Schlüssel.
--
-- Hier liegt zugleich die grundsätzliche Schwachstelle jedes solchen
-- Systems: Der Betreiber verwaltet dieses Verzeichnis und könnte einen
-- eigenen Schlüssel unterschieben. Dagegen hilft keine Zugriffsregel,
-- sondern nur, dass zwei Personen ihre Sicherheitsnummer über einen
-- anderen Kanal vergleichen.
create table public.user_keys (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  signing_public_key text not null,
  exchange_public_key text not null,
  created_at timestamptz not null default now(),

  -- Signatur des Austauschschlüssels mit dem Signaturschlüssel. Damit
  -- hängen beide zusammen und lassen sich nicht einzeln austauschen.
  exchange_key_signature text not null
);

alter table public.user_keys enable row level security;

create policy "user_keys_select_authenticated"
  on public.user_keys
  for select to authenticated
  using (true);

create policy "user_keys_insert_own"
  on public.user_keys
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Bewusst KEIN Update: Ein wechselnder öffentlicher Schlüssel ist der
-- Angriff, den die Sicherheitsnummer sichtbar machen soll. Wer neu
-- anfangen muss, löscht und legt neu an — und alle Gegenüber sehen dann
-- eine geänderte Nummer.
create policy "user_keys_delete_own"
  on public.user_keys
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- Verpackte Hauptschlüssel
-- ---------------------------------------------------------------------

-- Der private Schlüssel liegt hier nur verschlüsselt: entweder unter
-- einem Schlüssel, den der Passkey über die PRF-Erweiterung liefert, oder
-- unter der Wiederherstellungsphrase.
--
-- Eine Zeile je Passkey, nicht eine pro Konto. Die PRF-Erweiterung ist an
-- das einzelne Credential gebunden — ein zweiter Passkey liefert ein
-- anderes Geheimnis und braucht daher eine eigene Verpackung.
create table public.wrapped_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- 'passkey' oder 'phrase'
  method text not null check (method in ('passkey', 'phrase')),

  -- Bei 'passkey' die Credential-ID, sonst NULL.
  credential_id text,

  -- Zufälliger Wert, den die Ableitung mit einbezieht.
  salt text not null,
  iv text not null,
  data text not null,

  created_at timestamptz not null default now(),

  constraint wrapped_keys_credential check (
    (method = 'passkey' and credential_id is not null)
    or (method = 'phrase' and credential_id is null)
  )
);

create unique index wrapped_keys_credential_idx
  on public.wrapped_keys (user_id, credential_id)
  where credential_id is not null;

create unique index wrapped_keys_phrase_idx
  on public.wrapped_keys (user_id)
  where method = 'phrase';

alter table public.wrapped_keys enable row level security;

-- Nur der Eigentümer sieht seine verpackten Schlüssel. Sie nützen ohne
-- Passkey oder Phrase zwar niemandem, aber es gibt keinen Grund, sie
-- herzugeben.
create policy "wrapped_keys_select_own"
  on public.wrapped_keys
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "wrapped_keys_insert_own"
  on public.wrapped_keys
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "wrapped_keys_delete_own"
  on public.wrapped_keys
  for delete to authenticated
  using ((select auth.uid()) = user_id);
