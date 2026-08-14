import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readCount, type Comment, type FeedPost, type OwnPost } from "@/lib/post";

export const FEED_PAGE_SIZE = 30;

/** Fehlt die Migration noch, ist ein leeres Ergebnis die richtige Antwort. */
function isMissingTable(code: string | undefined) {
  return code === "PGRST205" || code === "42P01";
}

const POST_FIELDS =
  "id, image_path, image_width, image_height, caption, created_at, author:profiles!posts_author_id_fkey (handle, display_name), likes(count), comments(count)";

type RawPost = Omit<FeedPost, "likeCount" | "commentCount" | "likedByMe"> & {
  likes: unknown;
  comments: unknown;
};

/**
 * Ermittelt in EINER Abfrage, welche der übergebenen Beiträge der Nutzer
 * bereits mag. Die Alternative wäre eine Abfrage pro Beitrag — bei
 * dreissig Beiträgen also dreissig Rundreisen.
 */
async function likedPostIds(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return new Set();

  const { data, error } = await supabase
    .from("likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);

  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.post_id as string));
}

function shape(raw: RawPost, liked: Set<string>): FeedPost {
  return {
    id: raw.id,
    image_path: raw.image_path,
    image_width: raw.image_width,
    image_height: raw.image_height,
    caption: raw.caption,
    created_at: raw.created_at,
    author: raw.author,
    likeCount: readCount(raw.likes),
    commentCount: readCount(raw.comments),
    likedByMe: liked.has(raw.id),
  };
}

/** Die neuesten Beiträge samt Autor, Zählern und eigenem Like-Status. */
export async function getFeed(limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select(POST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Feed konnte nicht geladen werden: ${error.message}`);
  }

  const raw = (data ?? []) as unknown as RawPost[];
  const liked = await likedPostIds(raw.map((post) => post.id));
  return raw.map((post) => shape(post, liked));
}

/** Ein einzelner Beitrag. */
export async function getPost(postId: string): Promise<FeedPost | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select(POST_FIELDS)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.code)) return null;
    // Ungültige UUID in der Adresszeile: kein Fehler, sondern 404.
    if (error.code === "22P02") return null;
    throw new Error(`Beitrag konnte nicht geladen werden: ${error.message}`);
  }
  if (!data) return null;

  const raw = data as unknown as RawPost;
  const liked = await likedPostIds([raw.id]);
  return shape(raw, liked);
}

/** Kommentare eines Beitrags, älteste zuerst. */
export async function getComments(postId: string): Promise<Comment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, body, created_at, author_id, author:profiles!comments_author_id_fkey (handle, display_name)",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Kommentare konnten nicht geladen werden: ${error.message}`);
  }

  return (data ?? []) as unknown as Comment[];
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
