import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getOwnPosts, getPublicProfile } from "@/lib/feed";
import { followerLabel, postLabel } from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { Passkeys } from "@/app/passkeys";
import { EigeneBilder } from "./bilder";
import { Kopfzeile } from "@/app/kopfzeile";
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";

export default async function ProfilPage() {
  const result = await getOwnProfile();

  if (result.status === "no-session") redirect("/login");
  if (result.status === "table-missing") return <SetupHinweis />;
  if (!result.profile) redirect("/willkommen");

  const { profile, email } = result;
  const [posts, stats, ungelesen] = await Promise.all([
    getOwnPosts(result.userId),
    getPublicProfile(profile.handle, result.userId),
    getUngeleseneAnzahl(result.userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile
        handle={profile.handle}
        userId={result.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <>
            <Link
              href="/hochladen"
              className="rounded-lg bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-strong"
            >
              Bild hochladen
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
              >
                Abmelden
              </button>
            </form>
          </>
        }
      />

      <h1 className="mt-10 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
        {profile.display_name ?? `@${profile.handle}`}
      </h1>
      <p className="mt-2 text-[0.95rem] text-muted">@{profile.handle}</p>

      {stats ? (
        <p className="mt-1 text-[0.85rem] text-muted">
          {postLabel(stats.postCount)} · {followerLabel(stats.followerCount)} ·
          folgt {stats.followingCount}
        </p>
      ) : null}

      {email ? (
        <p className="mt-4 text-[0.8rem] text-muted">
          Angemeldet als {email}. Das sieht sonst niemand.
        </p>
      ) : null}

      <EigeneBilder posts={posts} />
      <Passkeys />
    </main>
  );
}
