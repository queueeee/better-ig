-- Migration 0005: Volltextsuche und Hashtags
--
-- Anwenden: Dashboard → SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------
-- Hashtags aus dem Text ziehen
-- ---------------------------------------------------------------------

-- Die Regex im Einzelnen:
--   (?<![[:alnum:]_])  Davor darf kein Wortzeichen stehen. Damit ist
--                      „mail@x.de#nope" kein Hashtag, während „#a #b"
--                      zwei ergibt. Ein Lookbehind verbraucht nichts —
--                      eine verbrauchende Variante würde bei zwei direkt
--                      aufeinanderfolgenden Tags den zweiten schlucken.
--   [[:alpha:]…]       Das erste Zeichen muss ein Buchstabe sein, sonst
--                      wäre „#2026" ein Hashtag.
--   {0,49}             Danach Buchstaben, Ziffern, Unterstrich. Die Klasse
--                      endet von selbst an Satzzeichen, sodass „(#hamburg)"
--                      und „#hamburg." beide sauber „hamburg" ergeben.
--
-- Umlaute stehen zusätzlich explizit in der Zeichenklasse: ob [[:alnum:]]
-- sie einschließt, hängt von der Collation ab — verlassen kann man sich
-- darauf nicht.
create or replace function public.extract_hashtags(txt text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    (select array_agg(distinct lower(m[1]) order by lower(m[1]))
       from regexp_matches(
              coalesce(txt, ''),
              '(?<![[:alnum:]_])#([[:alpha:]äöüÄÖÜß][[:alnum:]_äöüÄÖÜß]{0,49})',
              'g'
            ) as m),
    '{}'::text[]
  );
$$;

alter table public.posts
  add column hashtags text[] not null default '{}';

-- Trigger statt generierter Spalte: verlässlicher, weil
-- Generierungsausdrücke keine Unterabfragen erlauben.
create or replace function public.posts_set_hashtags()
returns trigger
language plpgsql
as $$
begin
  new.hashtags := public.extract_hashtags(new.caption);
  return new;
end;
$$;

create trigger posts_hashtags_trigger
  before insert or update of caption on public.posts
  for each row execute function public.posts_set_hashtags();

-- Bestehende Beiträge nachziehen.
update public.posts set caption = caption where caption is not null;

-- GIN unterstützt genau die Array-Operatoren, die wir brauchen: @>, <@, &&
create index posts_hashtags_idx on public.posts using gin (hashtags);

-- ---------------------------------------------------------------------
-- Volltextsuche
-- ---------------------------------------------------------------------

-- Generierte Spalte, damit der Index automatisch aktuell bleibt.
-- Sprachkonfiguration „german": findet auch gebeugte Formen, also
-- „Bäume" bei der Suche nach „Baum".
alter table public.posts
  add column fts tsvector
  generated always as (to_tsvector('german', coalesce(caption, ''))) stored;

create index posts_fts_idx on public.posts using gin (fts);

-- ---------------------------------------------------------------------
-- Beliebte Hashtags
-- ---------------------------------------------------------------------

-- Als Funktion statt als View, weil PostgREST Views nur mit
-- security_invoker respektiert und eine Funktion hier klarer ist.
create or replace function public.top_hashtags(limit_count integer default 20)
returns table (tag text, anzahl bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select unnest(hashtags) as tag, count(*) as anzahl
  from public.posts
  group by tag
  order by anzahl desc, tag asc
  limit limit_count;
$$;
