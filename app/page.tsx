import { createClient } from "@/lib/supabase/server";
import { Passkeys } from "./passkeys";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <header className="flex items-baseline justify-between gap-4">
        <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent">
          Bilder
        </p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Abmelden
          </button>
        </form>
      </header>

      <h1 className="mt-10 font-display text-[2.2rem] leading-[1.1] font-semibold tracking-tight">
        Du bist drin.
      </h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
        Angemeldet als <span className="text-ink">{user?.email}</span>. Mehr
        wissen wir über dich nicht.
      </p>

      <Passkeys />

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Als Nächstes
        </h2>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
          Profil mit Nutzernamen, Bilder hochladen, Feed. Die Anmeldung steht
          und trägt den Rest.
        </p>
      </section>
    </main>
  );
}
