import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { FEED_PAGE_SIZE, getFeed, getFollowingIds } from "@/lib/feed";
import {
  cleanupOwnExpiredStories,
  getStories,
} from "@/lib/stories";
import { SetupHinweis } from "@/app/setup-hinweis";
import { StoryLeiste } from "@/app/story-leiste";
import { Kopfzeile } from "@/app/kopfzeile";
import { FeedListe } from "@/app/feed-liste";
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";

export default async function FeedPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  // Die eigenen Beiträge gehören dazu — sonst wäre der Feed am ersten Tag
  // leer, obwohl man gerade etwas hochgeladen hat.
  const following = await getFollowingIds(result.userId);
  const sichtbar = [...following, result.userId];

  // Beim Öffnen der App die eigenen abgelaufenen Stories entfernen. Ein
  // zentraler Aufräumjob bräuchte den geheimen Schlüssel, um fremde
  // Dateien löschen zu dürfen — den soll diese App nirgends halten.
  await cleanupOwnExpiredStories();

  const [posts, stories, ungelesen] = await Promise.all([
    getFeed(30, sichtbar),
    getStories(result.userId, sichtbar),
    getUngeleseneAnzahl(result.userId),
  ]);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        active="feed"
      />

      <StoryLeiste gruppen={stories} />

      {posts.length === 0 ? (
        <section className="py-20 text-center">
          <h1 className="font-display text-[1.6rem] leading-tight font-semibold tracking-tight">
            Noch nichts hier
          </h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-[0.95rem] leading-relaxed text-muted">
            Hier erscheint, was du selbst hochlädst und was die zeigen, denen du
            folgst.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link
              href="/hochladen"
              className="rounded-lg bg-accent px-5 py-3 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong"
            >
              Bild hochladen
            </Link>
            <Link
              href="/entdecken"
              className="text-[0.9rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
            >
              Andere entdecken
            </Link>
          </div>
        </section>
      ) : (
        <FeedListe
          initial={posts}
          scope="feed"
          hasMore={posts.length === FEED_PAGE_SIZE}
        />
      )}
    </div>
  );
}
