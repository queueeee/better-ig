import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getUnterhaltungen, hatSchluesselServerseitig } from "@/lib/nachrichten";
import { relativeTime } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Schluesselverwaltung } from "./schluessel";
import { Kopfzeile } from "@/app/kopfzeile";
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";

export default async function NachrichtenPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const [unterhaltungen, hatKeys, ungelesen] = await Promise.all([
    getUnterhaltungen(result.userId),
    hatSchluesselServerseitig(result.userId),
    getUngeleseneAnzahl(result.userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <Link
            href="/suche"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Jemanden anschreiben
          </Link>
        }
      />

      {/* Ohne entsperrte Schluessel bleibt alles unlesbar — deshalb steht
          die Verwaltung hier oben statt versteckt in den Einstellungen. */}
      <Schluesselverwaltung userId={result.userId} vorhanden={hatKeys} />

      {unterhaltungen.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-[0.8rem] font-medium uppercase tracking-wider text-muted">
            Unterhaltungen
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {unterhaltungen.map((u) => {
              const ungelesen = u.lastMessageAt > u.lastReadAt;
              const name =
                u.title ??
                u.andere
                  .map((p) => p.displayName ?? `@${p.handle}`)
                  .join(", ") ??
                "Unterhaltung";
              return (
                <li key={u.id}>
                  <Link
                    href={`/nachrichten/${u.id}`}
                    className="flex items-center justify-between gap-4 py-4 transition-colors hover:text-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.95rem] font-medium">
                        {name}
                      </span>
                      <span className="mt-0.5 block text-[0.8rem] text-muted">
                        {relativeTime(u.lastMessageAt)}
                      </span>
                    </span>
                    {ungelesen ? (
                      <span
                        aria-label="Ungelesen"
                        className="h-2 w-2 shrink-0 rounded-full bg-accent"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="mt-12 text-[0.9rem] leading-relaxed text-muted">
          Noch keine Unterhaltungen. Such jemanden und schreib ihm.
        </p>
      )}

      <p className="mt-12 border-t border-line pt-6 text-[0.8rem] leading-relaxed text-muted">
        Nachrichten werden auf deinem Gerät verschlüsselt; der Server
        speichert nur unlesbare Daten. Wer diese App betreibt, könnte
        allerdings jederzeit eine veränderte Fassung ausliefern — für
        wirklich Vertrauliches ist Signal die richtige Wahl.
      </p>
    </main>
  );
}
