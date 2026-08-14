import { createClient } from "@/lib/supabase/server";

export type FeedPost = {
  id: string;
  image_path: string;
  image_width: number;
  image_height: number;
  caption: string | null;
  created_at: string;
  author: {
    handle: string;
    display_name: string | null;
  };
};

export const FEED_PAGE_SIZE = 30;

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
    if (error.code === "PGRST205" || error.code === "42P01") return [];
    throw new Error(`Feed konnte nicht geladen werden: ${error.message}`);
  }

  return (data ?? []) as unknown as FeedPost[];
}

/** Öffentliche URL eines Bildes im posts-Bucket. */
export function imageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/posts/${path}`;
}

/** „vor 3 Stunden" statt eines Zeitstempels. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
  ];

  const formatter = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
  let value = seconds;

  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return formatter.format(-Math.round(value), unit);
    value /= size;
  }
  return formatter.format(-Math.round(value), "year");
}
