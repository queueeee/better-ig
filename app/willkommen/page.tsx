import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { SetupHinweis } from "@/app/setup-hinweis";
import { WillkommenForm } from "./form";

export default async function WillkommenPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (result.profile) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent">
          Bilder
        </p>
        <h1 className="mt-3 font-display text-[2.2rem] leading-[1.1] font-semibold tracking-tight">
          Wie sollen wir dich nennen?
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
          Der Name ist das Einzige, was andere von dir sehen. Er lässt sich
          später ändern.
        </p>

        <WillkommenForm userId={result.userId} />

        <form action="/auth/signout" method="post" className="mt-10">
          <button
            type="submit"
            className="text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Falsches Konto? Abmelden
          </button>
        </form>
      </div>
    </main>
  );
}
