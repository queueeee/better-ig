import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { searchProfiles } from "@/lib/feed";
import { postLabel } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Kopfzeile } from "@/app/kopfzeile";
import { FolgenKnopf } from "@/app/u/[handle]/folgen-knopf";

export default async function SuchePage({
  searchParams,
}: {
  // searchParams ist seit Next.js 15 asynchron.
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const term = q?.trim() ?? "";
  const hits = await searchProfiles(term, result.userId);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile handle={result.profile.handle} active="suche" />

      {/* Ein einfaches Formular ohne JavaScript: Der Suchbegriff steht in
          der Adresse, damit sich ein Ergebnis teilen und zurücknavigieren
          lässt. */}
      <form action="/suche" className="mt-8">
        <label htmlFor="q" className="sr-only">
          Nach Leuten suchen
        </label>
        <div className="flex gap-3">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={term}
            autoFocus
            placeholder="Name oder @handle"
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

      <p className="mt-6 text-[0.85rem] text-muted">
        {term
          ? hits.length === 0
            ? `Nichts gefunden für „${term}“.`
            : `${hits.length} ${hits.length === 1 ? "Treffer" : "Treffer"}`
          : "Zuletzt dazugekommen"}
      </p>

      {hits.length > 0 ? (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {hits.map((hit) => (
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
                <FolgenKnopf targetId={hit.id} following={hit.followedByMe} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
