"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DeleteResult = { ok: true } | { ok: false; message: string };

/**
 * Löscht einen eigenen Beitrag samt Bilddatei.
 *
 * Server Actions sind per POST direkt aufrufbar, nicht nur über die
 * Oberfläche — die Berechtigung wird deshalb hier geprüft und zusätzlich
 * von den Zugriffsregeln der Datenbank durchgesetzt.
 */
export async function deletePost(postId: string): Promise<DeleteResult> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return { ok: false, message: "Nicht angemeldet." };

  // Pfad vor dem Löschen merken — danach ist er nicht mehr abrufbar.
  // Die Bedingung auf author_id ist doppelt gemoppelt (die delete-Policy
  // erzwingt dasselbe), macht die Absicht hier aber explizit.
  const { data: post, error: readError } = await supabase
    .from("posts")
    .select("image_path")
    .eq("id", postId)
    .eq("author_id", userId)
    .maybeSingle();

  if (readError) return { ok: false, message: "Der Beitrag ließ sich nicht laden." };
  if (!post) return { ok: false, message: "Der Beitrag existiert nicht mehr." };

  // Erst die Datenbankzeile: Schlägt danach das Löschen der Datei fehl,
  // bleibt eine verwaiste Datei zurück — unschön, aber harmlos. Andersherum
  // stünde ein Beitrag mit kaputtem Bild im Feed, was sichtbar schlimmer ist.
  const { error: deleteError } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId);

  if (deleteError) {
    return { ok: false, message: "Der Beitrag ließ sich nicht löschen." };
  }

  // Supabase räumt Dateien nicht automatisch auf; ohne diesen Aufruf
  // sammeln sich Bilder ohne Beitrag im Speicherkontingent an.
  await supabase.storage.from("posts").remove([post.image_path]);

  revalidatePath("/profil");
  revalidatePath("/");
  return { ok: true };
}
