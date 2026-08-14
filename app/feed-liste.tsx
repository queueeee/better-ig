"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { commentLabel, imageUrl, relativeTime, type FeedPost } from "@/lib/post";
import { LikeKnopf } from "@/app/like-knopf";
import { Bildtext } from "@/app/bildtext";
import { loadMorePosts } from "@/app/actions";

type Props = {
  initial: FeedPost[];
  scope: "feed" | "entdecken";
  /** Sind überhaupt weitere Beiträge zu erwarten? */
  hasMore: boolean;
};

function Beitrag({ post, eager }: { post: FeedPost; eager: boolean }) {
  return (
    <article className="py-8">
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

      {/* Das Seitenverhältnis kommt aus der Datenbank, damit die Fläche
          steht, bevor das Bild geladen ist. */}
      <Link
        href={`/p/${post.id}`}
        className="mt-3 block overflow-hidden rounded-xl border border-line bg-line/30"
        style={{ aspectRatio: `${post.image_width} / ${post.image_height}` }}
      >
        <Image
          src={imageUrl(post.image_path)}
          alt={post.caption ?? `Bild von @${post.author.handle}`}
          width={post.image_width}
          height={post.image_height}
          sizes="(max-width: 640px) 100vw, 576px"
          loading={eager ? "eager" : "lazy"}
          className="h-full w-full object-cover"
        />
      </Link>

      {post.caption ? <Bildtext text={post.caption} /> : null}

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
  );
}

export function FeedListe({ initial, scope, hasMore }: Props) {
  const [posts, setPosts] = useState(initial);
  const [more, setMore] = useState(hasMore);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  // Neue Daten vom Server (etwa nach einem Upload) ersetzen den Zustand,
  // sonst zeigte die Liste nach revalidatePath weiter den alten Stand.
  useEffect(() => {
    setPosts(initial);
    setMore(hasMore);
  }, [initial, hasMore]);

  function loadMore() {
    const last = posts[posts.length - 1];
    if (!last || pending) return;

    startTransition(async () => {
      const result = await loadMorePosts(scope, {
        createdAt: last.created_at,
        id: last.id,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.posts.length === 0) {
        setMore(false);
        return;
      }
      // Doppelte ausschliessen, falls währenddessen etwas dazukam.
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...result.posts.filter((post) => !seen.has(post.id))];
      });
    });
  }

  // Automatisch nachladen, sobald das Ende in Sicht kommt. Der Knopf
  // darunter bleibt trotzdem — ohne ihn käme niemand weiter, der mit der
  // Tastatur navigiert oder bei dem der Beobachter nicht greift.
  useEffect(() => {
    if (!more || pending) return;
    const node = sentinel.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  });

  return (
    <>
      <div className="divide-y divide-line">
        {posts.map((post, index) => (
          <Beitrag key={post.id} post={post} eager={index === 0} />
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="border-l-2 border-danger pl-3 text-[0.9rem] text-danger"
        >
          {error}
        </p>
      ) : null}

      <div ref={sentinel} className="py-8 text-center">
        {more ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={pending}
            className="text-[0.9rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink disabled:opacity-60"
          >
            {pending ? "Wird geladen …" : "Mehr laden"}
          </button>
        ) : posts.length > 0 ? (
          <p className="text-[0.85rem] text-muted">Das war alles.</p>
        ) : null}
      </div>
    </>
  );
}
