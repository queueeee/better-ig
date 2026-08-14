"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FEED_PAGE_SIZE, getFeed, getFollowingIds } from "@/lib/feed";
import type { FeedPost } from "@/lib/post";

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

export async function setFollow(
  targetId: string,
  following: boolean,
): Promise<ActionResult> {
  const session = await requireUser();
  if (!session) return { ok: false, message: "Nicht angemeldet." };
  const { supabase, userId } = session;

  if (targetId === userId) {
    return { ok: false, message: "Sich selbst zu folgen ergibt keinen Sinn." };
  }

  if (following) {
    const { error } = await supabase
      .from("follows")
      .upsert(
        { follower_id: userId, following_id: targetId },
        { onConflict: "follower_id,following_id" },
      );
    if (error) return { ok: false, message: "Das Folgen hat nicht geklappt." };
  } else {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("following_id", targetId);
    if (error) return { ok: false, message: "Das Entfolgen hat nicht geklappt." };
  }

  revalidatePath("/");
  revalidatePath("/entdecken");
  return { ok: true };
}

/**
 * Lädt die nächste Seite des Feeds. `scope` entscheidet, ob nur Gefolgte
 * oder alles gezeigt wird — der Client darf das nicht frei bestimmen,
 * sonst könnte er sich die Einschränkung selbst wegkonfigurieren.
 */
export async function loadMorePosts(
  scope: "feed" | "entdecken",
  cursor: { createdAt: string; id: string },
): Promise<{ posts: FeedPost[] } | { error: string }> {
  const session = await requireUser();
  if (!session) return { error: "Nicht angemeldet." };

  try {
    if (scope === "entdecken") {
      return { posts: await getFeed(FEED_PAGE_SIZE, undefined, cursor) };
    }
    const following = await getFollowingIds(session.userId);
    return {
      posts: await getFeed(
        FEED_PAGE_SIZE,
        [...following, session.userId],
        cursor,
      ),
    };
  } catch {
    return { error: "Es ließ sich nichts nachladen." };
  }
}
