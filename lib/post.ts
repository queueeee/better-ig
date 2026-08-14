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

export type FeedPost = OwnPost & {
  author: {
    handle: string;
    display_name: string | null;
  };
};

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
