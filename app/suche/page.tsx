import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import {
  FEED_PAGE_SIZE,
  getTopHashtags,
  searchPosts,
  searchProfiles,
} from "@/lib/feed";
import { postLabel } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Kopfzeile } from "@/app/kopfzeile";
import { FeedListe } from "@/app/feed-liste";
import { FolgenKnopf } from "@/app/u/[handle]/folgen-knopf";
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";

type Reiter = "leute" | "beitraege";

export default async function SuchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; was?: string }>;
}) {
  const { q, was } = await searchParams;
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const term = q?.trim() ?? "";
  const reiter: Reiter = was === "beitraege" ? "beitraege" : "leute";

  const [profile, posts, tags, ungelesen] = await Promise.all([
    reiter === "leute" ? searchProfiles(term, result.userId) : [],
    reiter === "beitraege" ? searchPosts(term) : [],
    term ? [] : getTopHashtags(15),
    getUngeleseneAnzahl(result.userId),
  ]);

  const reiterKlasse = (aktiv: boolean) =>
    aktiv
      ? "rounded-lg bg-accent px-4 py-2 text-[0.85rem] font-medium text-paper"
      : "rounded-lg border border-line px-4 py-2 text-[0.85rem] text-muted transition-colors hover:text-ink";

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        active="suche"
      />

      {/* Formular ohne JavaScript: Der Suchbegriff steht in der Adresse,
          damit sich ein Ergebnis teilen und zurücknavigieren lässt. */}
      <form action="/suche" className="mt-8">
        <input type="hidden" name="was" value={reiter} />
        <label htmlFor="q" className="sr-only">
          Suchen
        </label>
        <div className="flex gap-3">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={term}
            autoFocus
            placeholder={
              reiter === "leute" ? "Name oder @handle" : "Wort oder #hashtag"
            }
            className="w-full rounded-lg border border-line bg-transparent px-4 py-3 text-[0.95rem] outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-accent px-5 py-3 text-[0.9rem] font-medium text-paper transition-colors hover:bg-accent-strong"
          >
            Suchen
          </button>
        </div>
      </form>

      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/suche?was=leute${term ? `&q=${encodeURIComponent(term)}` : ""}`}
          className={reiterKlasse(reiter === "leute")}
        >
          Leute
        </Link>
        <Link
          href={`/suche?was=beitraege${term ? `&q=${encodeURIComponent(term)}` : ""}`}
          className={reiterKlasse(reiter === "beitraege")}
        >
          Beiträge
        </Link>
      </div>

      {/* Ohne Suchbegriff: Vorschläge statt einer leeren Seite. */}
      {!term && tags.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[0.8rem] font-medium uppercase tracking-wider text-muted">
            Häufige Hashtags
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {tags.map((hit) => (
              <li key={hit.tag}>
                <Link
                  href={`/tag/${encodeURIComponent(hit.tag)}`}
                  className="inline-block rounded-lg border border-line px-3 py-1.5 text-[0.85rem] transition-colors hover:border-accent hover:text-accent"
                >
                  #{hit.tag}
                  <span className="ml-1.5 text-muted">{hit.anzahl}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reiter === "leute" ? (
        <>
          <p className="mt-8 text-[0.85rem] text-muted">
            {term
              ? profile.length === 0
                ? `Niemand gefunden für „${term}“.`
                : `${profile.length} ${profile.length === 1 ? "Treffer" : "Treffer"}`
              : "Zuletzt dazugekommen"}
          </p>

          {profile.length > 0 ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {profile.map((hit) => (
                <li
                  key={hit.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <Link href={`/u/${hit.handle}`} className="group min-w-0">
                    <p className="truncate text-[0.95rem] font-medium transition-colors group-hover:text-accent">
                      {hit.display_name ?? `@${hit.handle}`}
                    </p>
                    <p className="mt-0.5 truncate text-[0.8rem] text-muted">
                      @{hit.handle} · {postLabel(hit.postCount)}
                    </p>
                  </Link>
                  <div className="shrink-0">
                    <FolgenKnopf
                      targetId={hit.id}
                      following={hit.followedByMe}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-8 text-[0.85rem] text-muted">
            {term
              ? posts.length === 0
                ? `Nichts gefunden für „${term}“.`
                : `${posts.length} ${posts.length === 1 ? "Bild" : "Bilder"}`
              : "Gib etwas ein, um Bildtexte zu durchsuchen."}
          </p>

          {posts.length > 0 ? (
            <FeedListe
              initial={posts}
              scope="entdecken"
              hasMore={posts.length === FEED_PAGE_SIZE}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
