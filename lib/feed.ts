import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FeedPost, OwnPost } from "@/lib/post";

export const FEED_PAGE_SIZE = 30;

/** Fehlt die Migration noch, ist ein leerer Feed die richtige Antwort. */
function isMissingTable(code: string | undefined) {
  return code === "PGRST205" || code === "42P01";
}

/**
 * Die neuesten Beiträge samt Autor. Ein einziger Aufruf statt einer
 * Abfrage pro Beitrag — PostgREST löst die Fremdschlüssel-Beziehung mit auf.
 */
export async function getFeed(limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, image_path, image_width, image_height, caption, created_at, author:profiles!posts_author_id_fkey (handle, display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Feed konnte nicht geladen werden: ${error.message}`);
  }

  return (data ?? []) as unknown as FeedPost[];
}

/** Die eigenen Beiträge, neueste zuerst. */
export async function getOwnPosts(userId: string): Promise<OwnPost[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select("id, image_path, image_width, image_height, caption, created_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Beiträge konnten nicht geladen werden: ${error.message}`);
  }

  return (data ?? []) as OwnPost[];
}
