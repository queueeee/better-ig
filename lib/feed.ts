import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  readCount,
  type Comment,
  type FeedPost,
  type OwnPost,
  type PublicProfile,
} from "@/lib/post";

export const FEED_PAGE_SIZE = 30;

/**
 * Fehlt eine Migration, meldet PostgREST je nach Fall eine unbekannte
 * Tabelle (PGRST205 / 42P01) oder eine fehlende Beziehung (PGRST200).
 * Beides heisst dasselbe: Die Datenbank ist noch nicht auf Stand.
 */
function isMissingTable(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST200";
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

/** IDs der Profile, denen der Nutzer folgt. */
export async function getFollowingIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (error) return [];
  return (data ?? []).map((row) => row.following_id as string);
}

/**
 * Der Feed. Ohne `authorIds` alle Beiträge („Entdecken"), mit `authorIds`
 * nur die dieser Profile.
 *
 * Die Einschränkung läuft über eine Liste von IDs statt über einen Join:
 * Supabase empfiehlt dieses Muster ausdrücklich, weil Joins in Kombination
 * mit Zugriffsregeln um Grössenordnungen langsamer werden können.
 */
export type FeedCursor = { createdAt: string; id: string };

export async function getFeed(
  limit = FEED_PAGE_SIZE,
  authorIds?: string[],
  cursor?: FeedCursor,
): Promise<FeedPost[]> {
  const supabase = await createClient();

  let query = supabase
    .from("posts")
    .select(POST_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (authorIds) {
    if (authorIds.length === 0) return [];
    query = query.in("author_id", authorIds);
  }

  // Keyset statt Offset: Weiter geht es ab dem zuletzt gesehenen Beitrag.
  // Ein Offset würde Einträge überspringen oder doppeln, sobald während
  // des Blätterns etwas Neues dazukommt — und wird mit jeder Seite langsamer.
  // Die id dient als Tiebreaker für den unwahrscheinlichen Fall, dass zwei
  // Beiträge exakt denselben Zeitstempel tragen.
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Feed konnte nicht geladen werden: ${error.message}`);
  }

  const raw = (data ?? []) as unknown as RawPost[];
  const liked = await likedPostIds(raw.map((post) => post.id));
  return raw.map((post) => shape(post, liked));
}

/**
 * Beiträge nach Text durchsuchen. „websearch" ist für eine Suchleiste die
 * richtige Wahl: Es versteht Anführungszeichen, „oder" und ein führendes
 * Minus als Ausschluss — und wirft bei keiner Eingabe einen Syntaxfehler.
 * Die strengere Standardvariante würde schon an einem einzelnen „&" scheitern.
 */
export async function searchPosts(
  query: string,
  limit = FEED_PAGE_SIZE,
): Promise<FeedPost[]> {
  const term = query.trim();
  if (!term) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_FIELDS)
    .textSearch("fts", term, { type: "websearch", config: "german" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Suche fehlgeschlagen: ${error.message}`);
  }

  const raw = (data ?? []) as unknown as RawPost[];
  const liked = await likedPostIds(raw.map((post) => post.id));
  return raw.map((post) => shape(post, liked));
}

/** Alle Beiträge zu einem Hashtag. */
export async function getPostsByHashtag(
  tag: string,
  limit = FEED_PAGE_SIZE,
): Promise<FeedPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_FIELDS)
    .contains("hashtags", [tag.toLowerCase()])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Beiträge konnten nicht geladen werden: ${error.message}`);
  }

  const raw = (data ?? []) as unknown as RawPost[];
  const liked = await likedPostIds(raw.map((post) => post.id));
  return raw.map((post) => shape(post, liked));
}

export type HashtagHit = { tag: string; anzahl: number };

/** Die meistgenutzten Hashtags. */
export async function getTopHashtags(limit = 20): Promise<HashtagHit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("top_hashtags", {
    limit_count: limit,
  });

  if (error) return [];
  return (data ?? []) as HashtagHit[];
}

export type ProfileHit = {
  id: string;
  handle: string;
  display_name: string | null;
  postCount: number;
  followedByMe: boolean;
};

/**
 * Sucht Profile nach Name. Ohne Suchbegriff kommen die zuletzt
 * hinzugekommenen — sonst stünde man auf einer leeren Seite und müsste
 * raten, wonach man suchen soll.
 */
export async function searchProfiles(
  query: string,
  viewerId: string,
  limit = 20,
): Promise<ProfileHit[]> {
  const supabase = await createClient();

  let request = supabase
    .from("profiles")
    .select("id, handle, display_name, posts:posts!posts_author_id_fkey(count)")
    .neq("id", viewerId)
    .limit(limit);

  const term = query.trim();
  if (term) {
    // Sonderzeichen von ilike entschärfen, sonst wird aus einer Eingabe
    // mit % oder _ ein Muster, das alles trifft.
    const safe = term.replace(/[%_\\]/g, (match) => `\\${match}`);
    request = request
      .or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .order("handle", { ascending: true });
  } else {
    request = request.order("created_at", { ascending: false });
  }

  const { data, error } = await request;
  if (error) {
    if (isMissingTable(error.code)) return [];
    throw new Error(`Suche fehlgeschlagen: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    handle: string;
    display_name: string | null;
    posts: unknown;
  }[];

  const { data: follows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .in("following_id", rows.map((row) => row.id));

  const followed = new Set(
    (follows ?? []).map((row) => row.following_id as string),
  );

  return rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    display_name: row.display_name,
    postCount: readCount(row.posts),
    followedByMe: followed.has(row.id),
  }));
}

/** Öffentliches Profil samt Zählern und eigenem Folge-Status. */
export async function getPublicProfile(
  handle: string,
  viewerId: string,
): Promise<PublicProfile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, handle, display_name, posts:posts!posts_author_id_fkey(count), followers:follows!follows_following_id_fkey(count), following:follows!follows_follower_id_fkey(count)",
    )
    .eq("handle", handle)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.code)) return null;
    throw new Error(`Profil konnte nicht geladen werden: ${error.message}`);
  }
  if (!data) return null;

  const raw = data as unknown as {
    id: string;
    handle: string;
    display_name: string | null;
    posts: unknown;
    followers: unknown;
    following: unknown;
  };

  const { data: followRow } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .eq("following_id", raw.id)
    .maybeSingle();

  return {
    id: raw.id,
    handle: raw.handle,
    display_name: raw.display_name,
    postCount: readCount(raw.posts),
    followerCount: readCount(raw.followers),
    followingCount: readCount(raw.following),
    followedByMe: Boolean(followRow),
    isMe: raw.id === viewerId,
  };
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
