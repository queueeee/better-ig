import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  handle: string;
  display_name: string | null;
};

export type ProfileResult =
  | { status: "ok"; userId: string; email: string | null; profile: Profile | null }
  | { status: "no-session" }
  | { status: "table-missing" };

/**
 * Liest das Profil des angemeldeten Nutzers.
 *
 * "table-missing" ist ein eigener Zustand, damit ein noch nicht migriertes
 * Projekt eine klare Anleitung zeigt statt einer Umleitungsschleife zwischen
 * Startseite und Namenswahl.
 */
export async function getOwnProfile(): Promise<ProfileResult> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { status: "no-session" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) {
    // PGRST205: PostgREST kennt die Tabelle nicht; 42P01: Postgres kennt sie nicht.
    if (error.code === "PGRST205" || error.code === "42P01") {
      return { status: "table-missing" };
    }
    throw new Error(`Profil konnte nicht geladen werden: ${error.message}`);
  }

  return {
    status: "ok",
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    profile: (profile as Profile | null) ?? null,
  };
}
