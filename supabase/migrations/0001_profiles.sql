-- Migration 0001: Profile
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
-- (Lokales supabase db push entfällt, solange kein Docker installiert ist.)
--
-- Ein Profil pro Konto. Es entsteht nicht automatisch, sondern erst, wenn
-- der Nutzer beim ersten Anmelden seinen Namen wählt — vorher gibt es
-- schlicht nichts anzuzeigen.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null,
  display_name text,
  created_at timestamptz not null default now(),

  -- Nur Kleinbuchstaben, Ziffern und Unterstrich, 3 bis 30 Zeichen.
  -- Bewusst kein Unicode: citext faltet nur Gross-/Kleinschreibung, nicht
  -- kyrillische oder mathematische Doppelgänger — in einer App, in der der
  -- Handle die sichtbare Identität ist, wäre das die einfachste Form von
  -- Impersonation. ASCII-only umgeht das Problem vollständig.
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_handle_unique unique (handle),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 50)
);

comment on table public.profiles is
  'Öffentliches Profil zu einem Konto. auth.users bleibt privat.';

alter table public.profiles enable row level security;

-- Lesen dürfen alle Angemeldeten — es ist ein soziales Netzwerk.
create policy "profiles_select_authenticated"
  on public.profiles
  for select to authenticated
  using (true);

-- Anlegen und Ändern nur für die eigene Zeile. auth.uid() steht in einem
-- Sub-Select, damit Postgres es einmal pro Anfrage auswertet statt pro Zeile.
create policy "profiles_insert_own"
  on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
