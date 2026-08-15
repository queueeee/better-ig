import Link from "next/link";
import type { ReactNode } from "react";
import { Glocke } from "@/app/glocke";

type Props = {
  handle: string;
  userId: string;
  /** Ungelesene Ereignisse plus Nachrichten, vom Server gelesen. */
  ungelesen: number;
  /**
   * „voll" trägt die Reiterzeile, „schmal" ersetzt die handgebauten
   * Kopfzeilen der übrigen Seiten.
   */
  variante?: "voll" | "schmal";
  /** Nur bei „voll": welcher Reiter ist aktiv? */
  active?: "feed" | "entdecken" | "suche";
  /**
   * Zusätzliches Bedienelement rechts, das nur zu dieser Seite gehört —
   * „Abbrechen" beim Hochladen, „Abmelden" im Profil.
   */
  kontext?: ReactNode;
};

export function Kopfzeile({
  handle,
  userId,
  ungelesen,
  variante = "voll",
  active,
  kontext,
}: Props) {
  const tab = (isActive: boolean) =>
    isActive
      ? "text-ink underline decoration-accent decoration-2 underline-offset-8"
      : "text-muted transition-colors hover:text-ink";

  const link =
    "text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink";

  return (
    <header className="border-b border-line pb-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent"
        >
          Bilder
        </Link>

        <nav className="flex items-center gap-5 text-[0.85rem]">
          {kontext}

          {variante === "voll" ? (
            <Link
              href="/hochladen"
              className="rounded-lg bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-strong"
            >
              Bild hochladen
            </Link>
          ) : null}

          <Link href="/nachrichten" className={link}>
            Nachrichten
          </Link>

          <Glocke startwert={ungelesen} userId={userId} />

          <Link href="/profil" className={link}>
            @{handle}
          </Link>
        </nav>
      </div>

      {variante === "voll" ? (
        <nav className="mt-5 flex items-center gap-6 text-[0.9rem]">
          <Link href="/" className={tab(active === "feed")}>
            Von dir gefolgt
          </Link>
          <Link href="/entdecken" className={tab(active === "entdecken")}>
            Entdecken
          </Link>
          <Link href="/suche" className={tab(active === "suche")}>
            Leute finden
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
