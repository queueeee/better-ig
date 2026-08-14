import Image from "next/image";
import Link from "next/link";
import { commentLabel, imageUrl, relativeTime, type FeedPost } from "@/lib/post";
import { LikeKnopf } from "@/app/like-knopf";

export function FeedListe({ posts }: { posts: FeedPost[] }) {
  return (
    <div className="divide-y divide-line">
      {posts.map((post, index) => (
        <article key={post.id} className="py-8">
          <div className="flex items-baseline justify-between gap-4">
            <Link
              href={`/u/${post.author.handle}`}
              className="text-[0.9rem] font-medium transition-colors hover:text-accent"
            >
              {post.author.display_name ?? `@${post.author.handle}`}
            </Link>
            <time
              dateTime={post.created_at}
              className="shrink-0 text-[0.8rem] text-muted"
            >
              {relativeTime(post.created_at)}
            </time>
          </div>

          {/* Das Seitenverhältnis kommt aus der Datenbank, damit die
              Fläche steht, bevor das Bild geladen ist. */}
          <Link
            href={`/p/${post.id}`}
            className="mt-3 block overflow-hidden rounded-xl border border-line bg-line/30"
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
              loading={index === 0 ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
          </Link>

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
  );
}
