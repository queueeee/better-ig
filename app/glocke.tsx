"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  /** Vom Server gelesener Stand beim Rendern dieser Seite. */
  startwert: number;
  userId: string;
};

export function Glocke({ startwert, userId }: Props) {
  // Basis und Delta getrennt: useState(startwert) friert den Startwert
  // ein, und Layouts rendern beim Navigieren nicht neu. Der Server-Prop
  // ist die Basis, das Abo liefert nur, was seit dem Einhängen dazukam.
  const [basis, setBasis] = useState(startwert);
  const [delta, setDelta] = useState(0);

  // Anpassung während des Renderns statt in einem Effekt. Ein
  // setDelta(0) in useEffect verstiesse gegen react-hooks/
  // set-state-in-effect — und React kennt genau dafür dieses Muster:
  // Es rendert sofort neu, ohne den Zwischenstand anzuzeigen.
  if (basis !== startwert) {
    setBasis(startwert);
    setDelta(0);
  }

  useEffect(() => {
    const supabase = createClient();

    // Alle Bindungen VOR subscribe(): seit supabase-js 2.101 wirft ein
    // .on() nach dem Abonnieren.
    const kanal = supabase
      .channel(`benachrichtigungen:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setDelta((bisher) => bisher + 1),
      )
      .on(
        "postgres_changes",
        // Ungefiltert: Die Zugriffsregel messages_select_participant wird
        // pro Abonnent geprüft, es kommt also nur an, was man sehen darf.
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id?: string };
          // Eigene Nachrichten erhöhen den eigenen Zähler nicht.
          if (row.sender_id === userId) return;
          setDelta((bisher) => bisher + 1);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [userId]);

  const anzahl = basis + delta;

  return (
    <Link
      href="/benachrichtigungen"
      aria-label={
        anzahl === 0
          ? "Benachrichtigungen, nichts Neues"
          : `Benachrichtigungen, ${anzahl} neu`
      }
      className="relative inline-flex items-center text-muted transition-colors hover:text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>

      {anzahl > 0 ? (
        <span
          aria-live="polite"
          className="absolute -top-1.5 -right-2 min-w-[1.1rem] rounded-full bg-accent px-1 text-center text-[0.65rem] leading-[1.1rem] font-medium text-paper"
        >
          {anzahl > 99 ? "99+" : anzahl}
        </span>
      ) : null}
    </Link>
  );
}
