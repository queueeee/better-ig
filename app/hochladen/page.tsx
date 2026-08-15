import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { SetupHinweis } from "@/app/setup-hinweis";
import { HochladenForm } from "./form";
import { Kopfzeile } from "@/app/kopfzeile";
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";

export default async function HochladenPage({
  searchParams,
}: {
  searchParams: Promise<{ art?: string }>;
}) {
  const { art: artParam } = await searchParams;
  const art = artParam === "story" ? "story" : "post";
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const ungelesen = await getUngeleseneAnzahl(result.userId);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <Kopfzeile
        handle={result.profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <Link
            href="/"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Abbrechen
          </Link>
        }
      />

      <h1 className="mt-10 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
        {art === "story" ? "Neue Story" : "Neues Bild"}
      </h1>

      <HochladenForm userId={result.userId} art={art} />
    </main>
  );
}
