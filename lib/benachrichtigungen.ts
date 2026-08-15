import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  gruppieren,
  type Gruppe,
  type RohBenachrichtigung,
} from "@/lib/benachrichtigungen-gruppieren";

/** Wie viele Roh-Ereignisse gelesen und behalten werden. */
export const FENSTER = 200;

const EPOCHE = "1970-01-01T00:00:00Z";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST200";
}

export type Person = { handle: string; displayName: string | null };

export type AnzeigeGruppe = Gruppe & {
  urheber: Person[];
  beitrag: { id: string; caption: string | null } | null;
  kommentarText: string | null;
};

/** Die Lesemarke des Nutzers. Fehlt die Zeile, gilt „noch nie gelesen". */
async function leseMarke(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_state")
    .select("read_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return EPOCHE;
  return (data.read_at as string) ?? EPOCHE;
}

/**
 * Die Zahl an der Glocke: ungelesene Ereignisse plus ungelesene
 * Nachrichten.
 *
 * Gezählt werden EREIGNISSE, nicht Gruppen. Fünf Likes auf dasselbe Bild
 * ergeben „5" an der Glocke und eine Zeile in der Liste. Das ist Absicht:
 * Nur ein Ereigniszähler lässt sich aus einem Realtime-Ereignis ohne
 * Server-Rundreise fortschreiben.
 */
export async function getUngeleseneAnzahl(userId: string): Promise<number> {
  const supabase = await createClient();
  const seit = await leseMarke(userId);

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", seit);

  if (error && !isMissing(error.code)) {
    throw new Error(`Benachrichtigungen nicht zählbar: ${error.message}`);
  }

  const { data: nachrichten } = await supabase.rpc("ungelesene_nachrichten");

  return (count ?? 0) + (typeof nachrichten === "number" ? nachrichten : 0);
}

/** Die Liste, fertig zusammengefasst und mit Namen versehen. */
export async function getBenachrichtigungen(
  userId: string,
): Promise<AnzeigeGruppe[]> {
  const supabase = await createClient();
  const seit = await leseMarke(userId);

  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, typ, created_at, like_post_id, like_actor_id, comment_id, follow_follower_id",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(FENSTER);

  if (error) {
    if (isMissing(error.code)) return [];
    throw new Error(`Benachrichtigungen nicht ladbar: ${error.message}`);
  }

  const zeilen = (data ?? []) as unknown as {
    id: string;
    typ: "like" | "kommentar" | "folgt";
    created_at: string;
    like_post_id: string | null;
    like_actor_id: string | null;
    comment_id: string | null;
    follow_follower_id: string | null;
  }[];

  if (zeilen.length === 0) return [];

  // Kommentare zuerst: Aus ihnen kommen sowohl der Text als auch der
  // Urheber und der Beitrag, die den Roh-Ereignissen noch fehlen.
  const kommentarIds = zeilen
    .map((z) => z.comment_id)
    .filter((id): id is string => id !== null);

  const kommentare = new Map<
    string,
    { body: string; authorId: string; postId: string }
  >();

  if (kommentarIds.length > 0) {
    const { data: rows } = await supabase
      .from("comments")
      .select("id, body, author_id, post_id")
      .in("id", kommentarIds);

    for (const row of (rows ?? []) as unknown as {
      id: string;
      body: string;
      author_id: string;
      post_id: string;
    }[]) {
      kommentare.set(row.id, {
        body: row.body,
        authorId: row.author_id,
        postId: row.post_id,
      });
    }
  }

  const roh: RohBenachrichtigung[] = [];
  for (const z of zeilen) {
    if (z.typ === "like" && z.like_actor_id && z.like_post_id) {
      roh.push({
        id: z.id,
        typ: "like",
        urheberId: z.like_actor_id,
        beitragId: z.like_post_id,
        kommentarId: null,
        createdAt: z.created_at,
      });
    } else if (z.typ === "kommentar" && z.comment_id) {
      const k = kommentare.get(z.comment_id);
      // Zwischen Lesen und Nachschlagen gelöscht — dann gibt es nichts
      // mehr anzuzeigen.
      if (!k) continue;
      roh.push({
        id: z.id,
        typ: "kommentar",
        urheberId: k.authorId,
        beitragId: k.postId,
        kommentarId: z.comment_id,
        createdAt: z.created_at,
      });
    } else if (z.typ === "folgt" && z.follow_follower_id) {
      roh.push({
        id: z.id,
        typ: "folgt",
        urheberId: z.follow_follower_id,
        beitragId: null,
        kommentarId: null,
        createdAt: z.created_at,
      });
    }
  }

  const gruppen = gruppieren(roh, seit);
  if (gruppen.length === 0) return [];

  // Profile und Beiträge in je einem Aufruf statt einem pro Gruppe.
  const personIds = [...new Set(gruppen.flatMap((g) => g.urheberIds))];
  const beitragIds = [
    ...new Set(
      gruppen
        .map((g) => g.beitragId)
        .filter((id): id is string => id !== null),
    ),
  ];

  // Bewusst nacheinander und nicht in einem Promise.all: Die zweite
  // Abfrage entfällt, wenn es keine Beiträge gibt, und ein Promise.all
  // über zwei unterschiedlich geformte Zweige ergibt einen Vereinigungstyp,
  // an dem der Typprüfer hängen bleibt.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .in("id", personIds);

  const personen = new Map<string, Person>();
  for (const row of (profile ?? []) as unknown as {
    id: string;
    handle: string;
    display_name: string | null;
  }[]) {
    personen.set(row.id, { handle: row.handle, displayName: row.display_name });
  }

  const posts = new Map<string, { id: string; caption: string | null }>();
  if (beitragIds.length > 0) {
    const { data: beitraege } = await supabase
      .from("posts")
      .select("id, caption")
      .in("id", beitragIds);

    for (const row of (beitraege ?? []) as {
      id: string;
      caption: string | null;
    }[]) {
      posts.set(row.id, row);
    }
  }

  return gruppen.map((gruppe) => ({
    ...gruppe,
    urheber: gruppe.urheberIds
      .map((id) => personen.get(id))
      .filter((p): p is Person => p !== undefined),
    beitrag: gruppe.beitragId ? (posts.get(gruppe.beitragId) ?? null) : null,
    kommentarText: gruppe.kommentarId
      ? (kommentare.get(gruppe.kommentarId)?.body ?? null)
      : null,
  }));
}

/**
 * Entfernt die eigenen Benachrichtigungen jenseits des Fensters.
 *
 * Aufgeräumt wird beim Lesen, nach dem Muster von
 * `cleanupOwnExpiredStories` (lib/stories.ts:115). Ein Kappungs-Trigger
 * wäre der naheliegende Weg und wäre falsch: Er löschte in der
 * naheliegenden Formulierung Zeilen fremder Nutzer mit und erzeugte eine
 * Flut von Lösch-Ereignissen, die die Zugriffsregeln nicht durchlaufen.
 */
export async function aufraeumen(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(FENSTER, FENSTER)
    .maybeSingle();

  // Weniger als FENSTER Zeilen: nichts zu tun.
  if (error || !data) return 0;

  const { count } = await supabase
    .from("notifications")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .lte("created_at", data.created_at as string);

  return count ?? 0;
}
