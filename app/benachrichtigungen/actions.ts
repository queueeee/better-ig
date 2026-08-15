"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Schreibt die Lesemarke bis zum übergebenen Zeitpunkt fort.
 *
 * `bis` ist ausdrücklich der Zeitstempel des neuesten ANGEZEIGTEN
 * Ereignisses, nicht `now()`. Zeitstempel folgen nicht der
 * Commit-Reihenfolge; mit `now()` wäre dauerhaft verschluckt, was
 * zwischen Lesen und Schreiben committet.
 */
export async function alsGelesenMarkieren(bis: string): Promise<void> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return;

  await supabase.rpc("benachrichtigungen_gelesen", { bis });
}
