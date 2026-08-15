"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Setzt die Lesemarke der Unterhaltung beim Öffnen.
 *
 * Der Zeitstempel kommt aus der neuesten angezeigten Nachricht, nicht aus
 * der Uhr des Browsers — die kann falsch gehen, und greatest() in der
 * Datenbank machte einen Ausreisser in die Zukunft sonst dauerhaft.
 * Gibt es noch keine Nachricht, ist nichts zu markieren.
 */
export function Gelesen({
  conversationId,
  bis,
}: {
  conversationId: string;
  bis: string | null;
}) {
  const erledigt = useRef(false);

  useEffect(() => {
    if (!bis || erledigt.current) return;
    erledigt.current = true;

    const supabase = createClient();
    void supabase.rpc("unterhaltung_gelesen", {
      conv: conversationId,
      bis,
    });
  }, [conversationId, bis]);

  return null;
}
