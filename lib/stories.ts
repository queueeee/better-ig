import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Story } from "@/lib/post";

export type { Story };

export type StoryGruppe = {
  handle: string;
  display_name: string | null;
  isMe: boolean;
  stories: Story[];
};

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST200";
}

/**
 * Alle sichtbaren Stories, nach Person gruppiert. Abgelaufene filtert
 * bereits die Zugriffsregel heraus — hier steht dazu bewusst keine
 * zusätzliche Bedingung, sonst gäbe es zwei Stellen, die dasselbe regeln.
 */
export async function getStories(
  viewerId: string,
  authorIds: string[],
): Promise<StoryGruppe[]> {
  if (authorIds.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stories")
    .select(
      "id, image_path, image_width, image_height, created_at, expires_at, author_id, author:profiles!stories_author_id_fkey (handle, display_name)",
    )
    .in("author_id", authorIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissing(error.code)) return [];
    throw new Error(`Stories konnten nicht geladen werden: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as (Story & {
    author_id: string;
    author: { handle: string; display_name: string | null };
  })[];

  const gruppen = new Map<string, StoryGruppe>();
  for (const row of rows) {
    let gruppe = gruppen.get(row.author_id);
    if (!gruppe) {
      gruppe = {
        handle: row.author.handle,
        display_name: row.author.display_name,
        isMe: row.author_id === viewerId,
        stories: [],
      };
      gruppen.set(row.author_id, gruppe);
    }
    gruppe.stories.push(row);
  }

  // Eigene zuerst, danach die übrigen in der Reihenfolge ihrer neuesten Story.
  return [...gruppen.values()].sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    const aLast = a.stories[a.stories.length - 1]?.created_at ?? "";
    const bLast = b.stories[b.stories.length - 1]?.created_at ?? "";
    return bLast.localeCompare(aLast);
  });
}

/** Die noch sichtbaren Stories einer Person. */
export async function getStoriesOf(handle: string): Promise<{
  handle: string;
  display_name: string | null;
  stories: Story[];
} | null> {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();

  if (profileError || !profile) return null;

  const { data, error } = await supabase
    .from("stories")
    .select("id, image_path, image_width, image_height, created_at, expires_at")
    .eq("author_id", profile.id)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissing(error.code)) return null;
    throw new Error(`Stories konnten nicht geladen werden: ${error.message}`);
  }

  return {
    handle: profile.handle as string,
    display_name: profile.display_name as string | null,
    stories: (data ?? []) as Story[],
  };
}

/**
 * Entfernt die eigenen abgelaufenen Stories samt Bilddateien.
 *
 * Aufgeräumt wird von jedem für sich, wenn er die App öffnet. Ein zentraler
 * Aufräumjob bräuchte den geheimen Schlüssel, um fremde Dateien löschen zu
 * dürfen — den will diese App nirgends liegen haben. Der Preis: Wer nie
 * wiederkommt, hinterlässt seine Dateien im Speicher.
 */
export async function cleanupOwnExpiredStories(): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("own_expired_stories");
  if (error || !data) return 0;

  const rows = data as { id: string; image_path: string }[];
  if (rows.length === 0) return 0;

  await supabase.storage.from("stories").remove(rows.map((r) => r.image_path));
  await supabase
    .from("stories")
    .delete()
    .in("id", rows.map((r) => r.id));

  return rows.length;
}
