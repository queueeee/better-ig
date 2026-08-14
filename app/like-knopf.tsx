"use client";

import { useOptimistic, useTransition } from "react";
import { likeLabel } from "@/lib/post";
import { setLike } from "@/app/actions";

type Props = {
  postId: string;
  count: number;
  liked: boolean;
};

/**
 * Zeigt den neuen Zustand sofort und schickt ihn im Hintergrund ab.
 * Scheitert die Aktion, verwirft React den optimistischen Zustand beim
 * Ende des Übergangs von selbst — es braucht kein manuelles Zurücksetzen.
 */
export function LikeKnopf({ postId, count, liked }: Props) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    { count, liked },
    (_state, next: boolean) => ({
      liked: next,
      count: count + (next ? 1 : 0) - (liked ? 1 : 0),
    }),
  );

  function toggle() {
    const next = !optimistic.liked;
    startTransition(async () => {
      setOptimistic(next);
      await setLike(postId, next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={optimistic.liked}
      className="group flex items-center gap-2 text-[0.85rem] text-muted transition-colors hover:text-ink disabled:opacity-70"
    >
      <span
        aria-hidden="true"
        className={
          optimistic.liked
            ? "text-accent transition-transform group-active:scale-90"
            : "transition-transform group-active:scale-90"
        }
      >
        {optimistic.liked ? "♥" : "♡"}
      </span>
      <span className={optimistic.liked ? "text-ink" : undefined}>
        {likeLabel(optimistic.count)}
      </span>
    </button>
  );
}
