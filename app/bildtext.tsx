import Link from "next/link";

/**
 * Dieselbe Regel wie beim Extrahieren in der Datenbank: Vor dem Doppelkreuz
 * darf kein Wortzeichen stehen, das erste Zeichen danach muss ein Buchstabe
 * sein. Weichen Anzeige und Datenbank voneinander ab, führen Links ins Leere.
 */
const HASHTAG = /(^|[^\p{L}\p{N}_])#(\p{L}[\p{L}\p{N}_]{0,49})/gu;

/** Zeigt einen Bildtext und macht Hashtags darin anklickbar. */
export function Bildtext({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(HASHTAG)) {
    const [whole, prefix, tag] = match;
    const start = match.index ?? 0;

    parts.push(text.slice(last, start + prefix.length));
    parts.push(
      <Link
        key={`${start}-${tag}`}
        href={`/tag/${encodeURIComponent(tag.toLowerCase())}`}
        className="text-accent transition-colors hover:text-accent-strong"
      >
        #{tag}
      </Link>,
    );
    last = start + whole.length;
  }

  parts.push(text.slice(last));

  return (
    <p className="mt-3 text-[0.95rem] leading-relaxed whitespace-pre-line">
      {parts}
    </p>
  );
}
