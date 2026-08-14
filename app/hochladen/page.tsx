import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { SetupHinweis } from "@/app/setup-hinweis";
import { HochladenForm } from "./form";

export default async function HochladenPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <header className="flex items-baseline justify-between gap-4">
        <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent">
          Bilder
        </p>
        <Link
          href="/"
          className="text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
        >
          Abbrechen
        </Link>
      </header>

      <h1 className="mt-10 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
        Neues Bild
      </h1>

      <HochladenForm userId={result.userId} />
    </main>
  );
}
