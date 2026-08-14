import Link from "next/link";

type Props = {
  handle: string;
  /** Welcher Reiter ist aktiv? */
  active: "feed" | "entdecken";
};

export function Kopfzeile({ handle, active }: Props) {
  const tab = (isActive: boolean) =>
    isActive
      ? "text-ink underline decoration-accent decoration-2 underline-offset-8"
      : "text-muted transition-colors hover:text-ink";

  return (
    <header className="border-b border-line pb-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent">
          Bilder
        </p>
        <nav className="flex items-center gap-5 text-[0.85rem]">
          <Link
            href="/hochladen"
            className="rounded-lg bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-strong"
          >
            Bild hochladen
          </Link>
          <Link
            href="/profil"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            @{handle}
          </Link>
        </nav>
      </div>

      <nav className="mt-5 flex items-center gap-6 text-[0.9rem]">
        <Link href="/" className={tab(active === "feed")}>
          Von dir gefolgt
        </Link>
        <Link href="/entdecken" className={tab(active === "entdecken")}>
          Entdecken
        </Link>
      </nav>
    </header>
  );
}
