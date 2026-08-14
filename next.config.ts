import type { NextConfig } from "next";

/**
 * next/image lädt nur von ausdrücklich erlaubten Hosts. Der Host wird aus
 * der Projekt-URL abgeleitet, damit ein Projektwechsel nur die .env.local
 * betrifft und nicht diese Datei.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
