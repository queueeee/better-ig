"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Server Actions sind per POST direkt erreichbar, nicht nur über die
 * Oberfläche. Die Anmeldung wird deshalb in jeder Funktion geprüft; die
 * Zugriffsregeln der Datenbank erzwingen dasselbe ein zweites Mal.
 */
async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  return { supabase, userId };
}

export async function setLike(
  postId: string,
  liked: boolean,
): Promise<ActionResult> {
  const session = await requireUser();
  if (!session) return { ok: false, message: "Nicht angemeldet." };
  const { supabase, userId } = session;

  if (liked) {
    // Der zusammengesetzte Primärschlüssel macht das idempotent: Ein
    // zweiter Klick erzeugt keinen zweiten Eintrag, sondern kollidiert
    // und wird hier ignoriert.
    const { error } = await supabase
      .from("likes")
      .upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id" });
    if (error) return { ok: false, message: "Das Like ließ sich nicht speichern." };
  } else {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) return { ok: false, message: "Das Like ließ sich nicht entfernen." };
  }

  revalidatePath("/");
  revalidatePath(`/p/${postId}`);
  return { ok: true };
}

export async function addComment(
  postId: string,
  body: string,
): Promise<ActionResult> {
  const session = await requireUser();
  if (!session) return { ok: false, message: "Nicht angemeldet." };
  const { supabase, userId } = session;

  const text = body.trim();
  if (text.length === 0) return { ok: false, message: "Der Kommentar ist leer." };
  if (text.length > 1000) {
    return { ok: false, message: "Der Kommentar ist zu lang (höchstens 1000 Zeichen)." };
  }

  const { error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_id: userId, body: text });

  if (error) {
    return { ok: false, message: "Der Kommentar ließ sich nicht speichern." };
  }

  revalidatePath("/");
  revalidatePath(`/p/${postId}`);
  return { ok: true };
}

export async function deleteComment(
  commentId: string,
  postId: string,
): Promise<ActionResult> {
  const session = await requireUser();
  if (!session) return { ok: false, message: "Nicht angemeldet." };

  // Wer löschen darf — Verfasser oder Urheber des Beitrags — entscheidet
  // die Zugriffsregel in der Datenbank. Trifft sie nicht zu, wird einfach
  // keine Zeile gelöscht.
  const { error } = await session.supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    return { ok: false, message: "Der Kommentar ließ sich nicht löschen." };
  }

  revalidatePath("/");
  revalidatePath(`/p/${postId}`);
  return { ok: true };
}
