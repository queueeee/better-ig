"use client";

import { useOptimistic, useTransition } from "react";
import { setFollow } from "@/app/actions";

type Props = {
  targetId: string;
  following: boolean;
};

export function FolgenKnopf({ targetId, following }: Props) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    following,
    (_state, next: boolean) => next,
  );

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      await setFollow(targetId, next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={optimistic}
      className={
        optimistic
          ? "rounded-lg border border-line px-5 py-2.5 text-[0.9rem] font-medium transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
          : "rounded-lg bg-accent px-5 py-2.5 text-[0.9rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
      }
    >
      {optimistic ? "Folgst du" : "Folgen"}
    </button>
  );
}
