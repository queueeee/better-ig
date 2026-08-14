import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getPostsByHashtag, FEED_PAGE_SIZE } from "@/lib/feed";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Kopfzeile } from "@/app/kopfzeile";
import { FeedListe } from "@/app/feed-liste";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const decoded = decodeURIComponent(tag).toLowerCase();
  const posts = await getPostsByHashtag(decoded);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile handle={result.profile.handle} active="suche" />

      <h1 className="mt-8 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
        <span className="text-accent">#</span>
        {decoded}
      </h1>
      <p className="mt-2 text-[0.85rem] text-muted">
        {posts.length === 0
          ? "Noch nichts damit"
          : posts.length === 1
            ? "1 Bild"
            : `${posts.length} Bilder`}
      </p>

      {posts.length === 0 ? (
        <p className="mt-10 text-[0.95rem] leading-relaxed text-muted">
          Schreib <span className="text-accent">#{decoded}</span> unter ein Bild,
          dann steht es hier.{" "}
          <Link
            href="/suche"
            className="underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Oder such nach etwas anderem.
          </Link>
        </p>
      ) : (
        <div className="mt-4">
          <FeedListe
            initial={posts}
            scope="entdecken"
            hasMore={posts.length === FEED_PAGE_SIZE}
          />
        </div>
      )}
    </div>
  );
}
