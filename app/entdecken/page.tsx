import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getFeed } from "@/lib/feed";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Kopfzeile } from "@/app/kopfzeile";
import { FeedListe } from "@/app/feed-liste";

export default async function EntdeckenPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  // Ohne Einschränkung auf Autoren: alles, was es gibt.
  const posts = await getFeed();

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile handle={result.profile.handle} active="entdecken" />

      {posts.length === 0 ? (
        <section className="py-20 text-center">
          <h1 className="font-display text-[1.6rem] leading-tight font-semibold tracking-tight">
            Noch nichts hier
          </h1>
          <p className="mx-auto mt-3 max-w-[32ch] text-[0.95rem] leading-relaxed text-muted">
            Das erste Bild fehlt noch. Es muss nicht gut sein, nur deins.
          </p>
          <Link
            href="/hochladen"
            className="mt-6 inline-block rounded-lg bg-accent px-5 py-3 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong"
          >
            Bild hochladen
          </Link>
        </section>
      ) : (
        <FeedListe posts={posts} />
      )}
    </div>
  );
}
