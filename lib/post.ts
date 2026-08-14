/**
 * Typen und Hilfsfunktionen rund um Beiträge — bewusst ohne Abhängigkeit
 * zum Server-Client, damit auch Client-Komponenten sie nutzen können.
 * Andernfalls zöge ein Import aus dem Browser next/headers mit hinein.
 */

export type OwnPost = {
  id: string;
  image_path: string;
  image_width: number;
  image_height: number;
  caption: string | null;
  created_at: string;
};

export type Author = {
  handle: string;
  display_name: string | null;
};

export type FeedPost = OwnPost & {
  author: Author;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author: Author;
};

/**
 * PostgREST liefert verschachtelte Zähler als Array mit einem Objekt:
 * `likes: [{ count: 3 }]`. Bei leerer Beziehung kann das Array fehlen
 * oder leer sein — deshalb defensiv auslesen statt blind zugreifen.
 */
export function readCount(value: unknown): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    const first = value[0] as { count?: unknown } | undefined;
    return typeof first?.count === "number" ? first.count : 0;
  }
  if (value && typeof value === "object" && "count" in value) {
    const count = (value as { count: unknown }).count;
    return typeof count === "number" ? count : 0;
  }
  return 0;
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
    if (Math.abs(value) < size) {
      return formatter.format(-Math.round(value), unit);
    }
    value /= size;
  }
  return formatter.format(-Math.round(value), "year");
}

/** „3 Likes", „1 Like", „Noch keine Likes" */
export function likeLabel(count: number): string {
  if (count === 0) return "Noch keine Likes";
  return count === 1 ? "1 Like" : `${count} Likes`;
}

export function commentLabel(count: number): string {
  if (count === 0) return "Kommentieren";
  return count === 1 ? "1 Kommentar" : `${count} Kommentare`;
}
