import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getOwnPosts, getPublicProfile } from "@/lib/feed";
import {
  followerLabel,
  imageUrl,
  postLabel,
  relativeTime,
} from "@/lib/post";
import { SetupHinweis } from "@/app/setup-hinweis";
import { FolgenKnopf } from "./folgen-knopf";
import { SchreibenKnopf } from "./schreiben-knopf";
import { createClient } from "@/lib/supabase/server";
import { Kopfzeile } from "@/app/kopfzeile";
import { getUngeleseneAnzahl } from "@/lib/benachrichtigungen";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const viewer = await getOwnProfile();

  if (viewer.status === "no-session") redirect("/login");
  if (viewer.status === "table-missing") return <SetupHinweis />;
  if (!viewer.profile) redirect("/willkommen");

  const profile = await getPublicProfile(handle.toLowerCase(), viewer.userId);
  if (!profile) notFound();

  // Das eigene Profil hat unter /profil mehr zu bieten (Passkeys, Löschen).
  if (profile.isMe) redirect("/profil");

  const posts = await getOwnPosts(profile.id);

  // Ohne öffentlichen Schlüssel kann das Gegenüber keine Nachrichten
  // empfangen — dann ist der Knopf irreführend.
  const supabase = await createClient();
  const { data: fremdeKeys } = await supabase
    .from("user_keys")
    .select("user_id")
    .eq("user_id", profile.id)
    .maybeSingle();

  const ungelesen = await getUngeleseneAnzahl(viewer.userId);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Kopfzeile
        handle={viewer.profile.handle}
        userId={viewer.userId}
        ungelesen={ungelesen}
        variante="schmal"
        kontext={
          <Link
            href="/"
            className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Zurück zum Feed
          </Link>
        }
      />

      <div className="mt-10 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] leading-[1.1] font-semibold tracking-tight">
            {profile.display_name ?? `@${profile.handle}`}
          </h1>
          <p className="mt-2 text-[0.95rem] text-muted">@{profile.handle}</p>
          <p className="mt-1 text-[0.85rem] text-muted">
            {postLabel(profile.postCount)} · {followerLabel(profile.followerCount)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 pt-2">
          <FolgenKnopf
            targetId={profile.id}
            following={profile.followedByMe}
          />
          <SchreibenKnopf
            targetId={profile.id}
            targetHasKeys={Boolean(fremdeKeys)}
          />
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="mt-12 text-[0.95rem] leading-relaxed text-muted">
          Noch keine Bilder.
        </p>
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/p/${post.id}`} className="group block">
                <div className="aspect-square overflow-hidden rounded-lg border border-line bg-line/30">
                  <Image
                    src={imageUrl(post.image_path)}
                    alt={post.caption ?? `Bild von @${profile.handle}`}
                    width={post.image_width}
                    height={post.image_height}
                    sizes="(max-width: 640px) 50vw, 180px"
                    className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                  />
                </div>
                <p className="mt-1.5 text-[0.75rem] text-muted">
                  {relativeTime(post.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
