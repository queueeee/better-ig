import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getNachrichten, getTeilnehmer } from "@/lib/nachrichten";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Chat } from "./chat";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const teilnehmer = await getTeilnehmer(id);
  // Zugriffsregeln liefern nichts, wenn man nicht dabei ist.
  if (teilnehmer.length === 0) notFound();

  const nachrichten = await getNachrichten(id);
  const andere = teilnehmer.filter((t) => t.userId !== result.userId);
  const titel =
    andere.map((p) => p.displayName ?? `@${p.handle}`).join(", ") ||
    "Unterhaltung";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <Link
          href="/nachrichten"
          className="text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
        >
          Zurück
        </Link>
        <p className="truncate text-[0.9rem] font-medium">{titel}</p>
      </header>

      <Chat
        conversationId={id}
        userId={result.userId}
        teilnehmer={teilnehmer}
        anfang={nachrichten}
      />
    </main>
  );
}
