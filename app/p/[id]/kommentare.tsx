"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { relativeTime, type Comment } from "@/lib/post";
import { addComment, deleteComment } from "@/app/actions";

type Props = {
  postId: string;
  comments: Comment[];
  currentUserId: string;
  /** Der Urheber des Beitrags darf jeden Kommentar darunter entfernen. */
  isPostOwner: boolean;
};

export function Kommentare({
  postId,
  comments,
  currentUserId,
  isPostOwner,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    setError(null);
    startTransition(async () => {
      const result = await addComment(postId, text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  function remove(commentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteComment(commentId, postId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {comments.length === 0
          ? "Kommentare"
          : `${comments.length} ${comments.length === 1 ? "Kommentar" : "Kommentare"}`}
      </h2>

      {error ? (
        <p
          role="alert"
          className="mt-4 border-l-2 border-danger pl-3 text-[0.9rem] text-danger"
        >
          {error}
        </p>
      ) : null}

      {comments.length > 0 ? (
        <ul className="mt-6 space-y-5">
          {comments.map((comment) => {
            const mayDelete = isPostOwner || comment.author_id === currentUserId;
            return (
              <li key={comment.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[0.9rem] font-medium">
                    {comment.author.display_name ?? `@${comment.author.handle}`}
                  </p>
                  <time
                    dateTime={comment.created_at}
                    className="shrink-0 text-[0.8rem] text-muted"
                  >
                    {relativeTime(comment.created_at)}
                  </time>
                </div>
                <p className="mt-1 text-[0.95rem] leading-relaxed whitespace-pre-line">
                  {comment.body}
                </p>

                {mayDelete ? (
                  confirming === comment.id ? (
                    <span className="mt-1 flex items-center gap-3 text-[0.75rem]">
                      <button
                        type="button"
                        onClick={() => remove(comment.id)}
                        disabled={pending}
                        className="font-medium text-danger underline decoration-danger/40 underline-offset-4 disabled:opacity-50"
                      >
                        Wirklich löschen
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={pending}
                        className="text-muted underline decoration-line underline-offset-4 hover:text-ink disabled:opacity-50"
                      >
                        Abbrechen
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(comment.id)}
                      className="mt-1 text-[0.75rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-danger"
                    >
                      Löschen
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
          Noch nichts gesagt.
        </p>
      )}

      <form onSubmit={submit} className="mt-8">
        <label htmlFor="kommentar" className="sr-only">
          Kommentar schreiben
        </label>
        <textarea
          id="kommentar"
          rows={3}
          maxLength={1000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Etwas dazu sagen"
          className="w-full resize-none rounded-lg border border-line bg-transparent px-4 py-3 text-[0.95rem] leading-relaxed outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="mt-3 rounded-lg bg-accent px-5 py-2.5 text-[0.9rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {pending ? "Moment …" : "Abschicken"}
        </button>
      </form>
    </section>
  );
}
