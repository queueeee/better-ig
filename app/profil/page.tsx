import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Passkeys } from "@/app/passkeys";

export default async function ProfilPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const { profile, email } = result;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <Link
          href="/"
          className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent"
        >
          Bilder
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Abmelden
          </button>
        </form>
      </header>

      <h1 className="mt-10 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
        {profile.display_name ?? `@${profile.handle}`}
      </h1>
      <p className="mt-2 text-[0.95rem] text-muted">
        @{profile.handle}
        {email ? <span className="text-muted/70"> · {email}</span> : null}
      </p>

      <Passkeys />
    </main>
  );
}
