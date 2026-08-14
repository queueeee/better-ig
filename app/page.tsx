import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getFeed } from "@/lib/feed";
import { commentLabel, imageUrl, relativeTime } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { LikeKnopf } from "@/app/like-knopf";

export default async function FeedPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const posts = await getFeed();

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent">
          Bilder
        </p>
        <nav className="flex items-center gap-5 text-[0.85rem]">
          <Link
            href="/hochladen"
            className="rounded-lg bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-strong"
          >
            Bild hochladen
          </Link>
          <Link
            href="/profil"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            @{result.profile.handle}
          </Link>
        </nav>
      </header>

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
        <div className="divide-y divide-line">
          {posts.map((post, index) => (
            <article key={post.id} className="py-8">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[0.9rem] font-medium">
                  {post.author.display_name ?? `@${post.author.handle}`}
                </p>
                <time
                  dateTime={post.created_at}
                  className="shrink-0 text-[0.8rem] text-muted"
                >
                  {relativeTime(post.created_at)}
                </time>
              </div>

              {/* Das Seitenverhältnis kommt aus der Datenbank, damit die
                  Fläche steht, bevor das Bild geladen ist. */}
              <div
                className="mt-3 overflow-hidden rounded-xl border border-line bg-line/30"
                style={{
                  aspectRatio: `${post.image_width} / ${post.image_height}`,
                }}
              >
                <Image
                  src={imageUrl(post.image_path)}
                  alt={post.caption ?? `Bild von @${post.author.handle}`}
                  width={post.image_width}
                  height={post.image_height}
                  sizes="(max-width: 640px) 100vw, 576px"
                  // Nur das erste Bild vorladen; der Rest kommt beim Scrollen.
                  loading={index === 0 ? "eager" : "lazy"}
                  className="h-full w-full object-cover"
                />
              </div>

              {post.caption ? (
                <p className="mt-3 text-[0.95rem] leading-relaxed whitespace-pre-line">
                  {post.caption}
                </p>
              ) : null}

              <div className="mt-4 flex items-center gap-6">
                <LikeKnopf
                  postId={post.id}
                  count={post.likeCount}
                  liked={post.likedByMe}
                />
                <Link
                  href={`/p/${post.id}`}
                  className="text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
                >
                  {commentLabel(post.commentCount)}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
