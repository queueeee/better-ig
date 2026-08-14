import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getComments, getPost } from "@/lib/feed";
import { imageUrl, relativeTime } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { LikeKnopf } from "@/app/like-knopf";
import { Bildtext } from "@/app/bildtext";
import { Kommentare } from "./kommentare";

export default async function PostPage({
  params,
}: {
  // params ist seit Next.js 15 asynchron.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const post = await getPost(id);
  if (!post) notFound();

  const comments = await getComments(id);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <Link
          href="/"
          className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent"
        >
          Bilder
        </Link>
        <Link
          href="/"
          className="text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
        >
          Zurück zum Feed
        </Link>
      </header>

      <article className="mt-8">
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

        <div
          className="mt-3 overflow-hidden rounded-xl border border-line bg-line/30"
          style={{ aspectRatio: `${post.image_width} / ${post.image_height}` }}
        >
          <Image
            src={imageUrl(post.image_path)}
            alt={post.caption ?? `Bild von @${post.author.handle}`}
            width={post.image_width}
            height={post.image_height}
            sizes="(max-width: 640px) 100vw, 576px"
            className="h-full w-full object-cover"
          />
        </div>

        {post.caption ? <Bildtext text={post.caption} /> : null}

        <div className="mt-4">
          <LikeKnopf
            postId={post.id}
            count={post.likeCount}
            liked={post.likedByMe}
          />
        </div>
      </article>

      <Kommentare
        postId={post.id}
        comments={comments}
        currentUserId={result.userId}
        isPostOwner={post.author.handle === result.profile.handle}
      />
    </main>
  );
}
