import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-Client. Das experimentelle Passkey-Flag ist Pflicht — ohne es
 * existieren auth.signInWithPasskey() und auth.registerPasskey() nicht.
 * Supabase kennzeichnet die Passkey-API als Beta, die sich ohne Vorankündigung
 * ändern kann; beim Aktualisieren von @supabase/supabase-js also das Changelog lesen.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { experimental: { passkey: true } } },
  );
}
