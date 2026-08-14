"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { imageUrl, relativeTime, type OwnPost } from "@/lib/post";
import { deletePost } from "./actions";

export function EigeneBilder({ posts }: { posts: OwnPost[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Welcher Beitrag wartet auf Bestätigung? Ein zweiter Klick statt eines
  // Systemdialogs: Der lässt sich gestalten und blockiert nichts.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(postId: string) {
    setError(null);
    setBusyId(postId);
    startTransition(async () => {
      const result = await deletePost(postId);
      if (!result.ok) {
        setError(result.message);
        setBusyId(null);
        setConfirming(null);
        return;
      }
      setConfirming(null);
      setBusyId(null);
      router.refresh();
    });
  }

  if (posts.length === 0) {
    return (
      <section className="mt-14">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Deine Bilder
        </h2>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
          Noch keins hochgeladen.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-14">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Deine Bilder
        <span className="ml-2 text-[0.9rem] font-normal text-muted">
          {posts.length}
        </span>
      </h2>

      {error ? (
        <p
          role="alert"
          className="mt-4 border-l-2 border-danger pl-3 text-[0.9rem] text-danger"
        >
          {error}
        </p>
      ) : null}

      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {posts.map((post) => {
          const isConfirming = confirming === post.id;
          const isBusy = busyId === post.id && pending;

          return (
            <li key={post.id} className="group relative">
              <div className="aspect-square overflow-hidden rounded-lg border border-line bg-line/30">
                <Image
                  src={imageUrl(post.image_path)}
                  alt={post.caption ?? "Eigenes Bild"}
                  width={post.image_width}
                  height={post.image_height}
                  sizes="(max-width: 640px) 50vw, 180px"
                  className="h-full w-full object-cover"
                />
              </div>

              <p className="mt-1.5 text-[0.75rem] text-muted">
                {relativeTime(post.created_at)}
              </p>

              {isConfirming ? (
                <div className="mt-1 flex items-center gap-3 text-[0.75rem]">
                  <button
                    type="button"
                    onClick={() => remove(post.id)}
                    disabled={isBusy}
                    className="font-medium text-danger underline decoration-danger/40 underline-offset-4 disabled:opacity-50"
                  >
                    {isBusy ? "Wird gelöscht …" : "Wirklich löschen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={isBusy}
                    className="text-muted underline decoration-line underline-offset-4 hover:text-ink disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setConfirming(post.id);
                  }}
                  className="mt-1 text-[0.75rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-danger"
                >
                  Löschen
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
