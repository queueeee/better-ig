import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Heißt seit Next.js 16 proxy statt middleware und läuft auf der
 * Node.js-Runtime. Frischt bei jedem Request die Supabase-Session auf und
 * schützt alle Routen, die nicht in PUBLIC_PATHS stehen.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
