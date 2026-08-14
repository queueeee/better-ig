<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Projekt

Social-App („better instagram"). Next.js 16.3 mit App Router und Turbopack,
React 19.2, Tailwind 4, Supabase für Auth und Datenbank. Einrichtung: `SETUP.md`.

## Anmeldung

Passkeys über die **native Supabase-Auth-API** (seit Mai 2026), nicht über eine
eigene WebAuthn-Implementierung. Das Flag `auth: { experimental: { passkey: true } }`
im Browser-Client ist Pflicht — ohne es existieren die Methoden nicht.

Ein Passkey kann bei Supabase nicht der einzige Faktor sein: Registrierung setzt
eine bestehende, bestätigte Sitzung voraus. Der Ablauf ist deshalb
E-Mail-Code → angemeldet → Passkey einrichten → danach Passkey-Login.

Die Relying Party ID darf sich nach dem ersten registrierten Passkey **nie mehr
ändern**, sonst werden alle bestehenden Passkeys ungültig.

## Konventionen

- `cookies()`, `headers()`, `params` und `searchParams` sind async und müssen
  awaited werden.
- Routenschutz liegt in `proxy.ts` (heißt seit Next.js 16 so, nicht mehr
  `middleware.ts`) und läuft auf der Node-Runtime.
- Zur Autorisierung serverseitig `getClaims()` verwenden, nie `getSession()`.
- Zwischen `createServerClient` und `getClaims()` im Proxy darf kein Code stehen,
  sonst laufen Sitzungen sporadisch ab.
- Farben und Schriften kommen aus den Tokens in `app/globals.css`; keine
  Hex-Werte direkt in Komponenten.
- Oberflächentexte auf Deutsch, Duzen, Sätze statt Stichworte. Fehlermeldungen
  sagen, was zu tun ist, und entschuldigen sich nicht.

## Zurückgestelltes

`docs/eid-parked/` enthält ein ausgearbeitetes Konzept für Identitätsprüfung per
Personalausweis-Chip (ein Account pro Person). Nicht aktiv — nur anfassen, wenn
ausdrücklich danach gefragt wird.
