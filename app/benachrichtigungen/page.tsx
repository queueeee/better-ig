import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import {
  aufraeumen,
  getBenachrichtigungen,
  getUngeleseneAnzahl,
  type AnzeigeGruppe,
} from "@/lib/benachrichtigungen";
import { urheberSatz } from "@/lib/benachrichtigungen-gruppieren";
import { relativeTime } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Kopfzeile } from "@/app/kopfzeile";
import { Gelesen } from "./gelesen";

function name(person: { handle: string; displayName: string | null }) {
  return person.displayName ?? `@${person.handle}`;
}

function satz(gruppe: AnzeigeGruppe) {
  const wer = urheberSatz(gruppe.urheber.map(name));
  const mehrere = gruppe.urheber.length > 1;

  if (gruppe.typ === "like") {
    return `${wer} ${mehrere ? "mögen" : "mag"} dein Bild`;
  }
  if (gruppe.typ === "kommentar") {
    return `${wer} ${mehrere ? "haben" : "hat"} kommentiert`;
  }
  return `${wer} ${mehrere ? "folgen" : "folgt"} dir jetzt`;
}

export default async function BenachrichtigungenPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  await aufraeumen(result.userId);

  const [gruppen, ungelesen] = await Promise.all([
    getBenachrichtigungen(result.userId),
    getUngeleseneAnzahl(result.userId),
  ]);

  const neuestes = gruppen[0]?.neuestesAm ?? null;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
      />

      <Gelesen bis={neuestes} />

      <h1 className="mt-10 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
        Was passiert ist
      </h1>

      {gruppen.length === 0 ? (
        <p className="mt-6 max-w-[46ch] text-[0.95rem] leading-relaxed text-muted">
          Hier steht, wer deine Bilder mag, wer kommentiert und wer dir folgt.
          Lade ein Bild hoch, dann füllt sich diese Seite von selbst.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {gruppen.map((gruppe) => (
            <li key={gruppe.schluessel} className="flex gap-3 py-4">
              <span
                aria-hidden="true"
                className={
                  gruppe.ungelesen
                    ? "mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"
                    : "mt-2 h-2 w-2 shrink-0"
                }
              />

              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] leading-relaxed">
                  {satz(gruppe)}
                  {gruppe.ungelesen ? (
                    <span className="sr-only"> — ungelesen</span>
                  ) : null}
                </p>

                {gruppe.typ === "kommentar" && gruppe.kommentarText ? (
                  <p className="mt-1 truncate text-[0.9rem] text-muted">
                    „{gruppe.kommentarText}“
                  </p>
                ) : null}

                {gruppe.beitrag ? (
                  <Link
                    href={`/p/${gruppe.beitrag.id}`}
                    className="mt-1 block truncate text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
                  >
                    {gruppe.beitrag.caption ?? "Zum Bild"}
                  </Link>
                ) : null}

                {gruppe.typ === "folgt" && gruppe.urheber.length === 1 ? (
                  <Link
                    href={`/u/${gruppe.urheber[0].handle}`}
                    className="mt-1 block text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
                  >
                    Profil ansehen
                  </Link>
                ) : null}

                <p className="mt-1 text-[0.8rem] text-muted">
                  {relativeTime(gruppe.neuestesAm)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-12 border-t border-line pt-6 text-[0.8rem] leading-relaxed text-muted">
        Neue Nachrichten zählt die Glocke mit, sie stehen aber unter
        Nachrichten — ihr Inhalt ist verschlüsselt und liegt nirgends im
        Klartext.
      </p>
    </main>
  );
}
