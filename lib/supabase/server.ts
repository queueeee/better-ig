import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client für Server Components, Server Actions und Route Handler.
 * cookies() ist seit Next.js 15 async und muss awaited werden.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Aus einer Server Component heraus ist Schreiben nicht erlaubt.
            // Das übernimmt der Proxy, der die Session ohnehin bei jedem
            // Request auffrischt.
          }
        },
      },
    },
  );
}
