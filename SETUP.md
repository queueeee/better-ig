# Einrichtung

Die App läuft erst, wenn ein Supabase-Projekt dahintersteht. Fünf Schritte,
zusammen etwa zehn Minuten.

## 1. Supabase-Projekt anlegen

Auf [supabase.com](https://supabase.com) ein Projekt erstellen (Gratis-Stufe
genügt). Region Frankfurt wählen, wenn die Nutzer in Europa sitzen.

## 2. Schlüssel eintragen

Im Dashboard unter **Project Settings → API Keys** die beiden Werte kopieren und
in `.env.local` eintragen (die Datei existiert bereits mit Platzhaltern):

```
NEXT_PUBLIC_SUPABASE_URL=https://<projekt-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Den **Secret Key** nirgends eintragen — er umgeht Row Level Security und gehört
nie in eine Datei, die der Browser sieht.

## 3. Passkeys aktivieren

**Authentication → Passkeys**, dann einschalten und setzen:

| Feld | Wert für lokale Entwicklung |
|---|---|
| Relying Party ID | `localhost` |
| Relying Party Origins | `http://localhost:3000` |
| Display Name | Der Produktname |

> **Die Relying Party ID lässt sich später nicht mehr ändern.** Wird sie
> geändert, sind schlagartig **alle** bereits registrierten Passkeys wertlos und
> jeder Nutzer muss neu einrichten. Vor dem ersten echten Nutzer also die
> endgültige Produktionsdomain eintragen — die nackte Domain (`beispiel.de`),
> nicht die Vercel-Preview-URL.

## 4. E-Mail-Vorlage auf Zahlencode umstellen

Das ist der Schritt, den man leicht übersieht: Supabase verschickt
standardmäßig einen **Magic Link**, die App erwartet aber einen sechsstelligen
**Code**.

Unter **Authentication → Email Templates → Magic Link** die Vorlage bearbeiten
und `{{ .Token }}` einsetzen, zum Beispiel:

```html
<h2>Dein Anmeldecode</h2>
<p>{{ .Token }}</p>
<p>Der Code gilt eine Stunde.</p>
```

Ohne diese Änderung kommt eine Mail ohne Code an und die Anmeldung per E-Mail
funktioniert nicht.

## 5. Starten

```bash
npm run dev
```

Dann [localhost:3000](http://localhost:3000) öffnen. Der erste Weg hinein führt
über den E-Mail-Code — Passkeys lassen sich erst einrichten, wenn man angemeldet
ist. Danach steht auf der Startseite die Passkey-Verwaltung.

---

## Was beim Testen zu erwarten ist

**Der eingebaute Mail-Dienst ist eng begrenzt.** Er stellt ausschließlich an
E-Mail-Adressen von Mitgliedern deiner Supabase-Organisation zu — alles andere
scheitert mit „Email address not authorized". Und er ist auf **zwei Mails pro
Stunde** projektweit gedeckelt. Zum Testen mit der eigenen Adresse reicht das;
sobald andere Leute sich anmelden sollen, braucht es einen eigenen SMTP-Anbieter
(Resend, Postmark, SES) unter **Project Settings → Authentication → SMTP**.

**Passkeys brauchen HTTPS** — außer auf `localhost`, das ist ausdrücklich
ausgenommen. Lokal funktioniert also alles ohne Zertifikat.

**Die Passkey-API ist Beta.** Supabase behält sich Änderungen ohne Vorankündigung
vor. Beim Aktualisieren von `@supabase/supabase-js` lohnt ein Blick ins
Changelog; der Rest der App ist davon nicht betroffen.

## Wie die Anmeldung aufgebaut ist

Ein Passkey kann bei Supabase **nicht der einzige Faktor** sein: Um einen zu
registrieren, muss man bereits angemeldet und die E-Mail bestätigt sein. Daraus
folgt der Ablauf, den die App umsetzt:

1. **Erstes Mal:** E-Mail-Code → angemeldet → Passkey einrichten
2. **Danach:** ein Klick auf „Mit Passkey anmelden", ohne E-Mail-Eingabe
3. **Neues Gerät:** wieder E-Mail-Code, dann dort einen eigenen Passkey anlegen

Der Code-Weg bleibt also dauerhaft als Rückfalloption bestehen — er ist kein
Übergangsprovisorium, sondern der Wiedereinstieg, wenn ein Gerät verloren geht.

## Dateien

| Pfad | Zweck |
|---|---|
| `proxy.ts` | Session-Refresh und Routenschutz (hieß vor Next.js 16 `middleware.ts`) |
| `lib/supabase/client.ts` | Browser-Client, aktiviert das Passkey-Flag |
| `lib/supabase/server.ts` | Client für Server Components und Route Handler |
| `lib/supabase/proxy.ts` | Session-Auffrischung, Weiterleitungslogik |
| `app/login/page.tsx` | Anmeldung: Passkey und E-Mail-Code |
| `app/passkeys.tsx` | Passkeys anzeigen, hinzufügen, entfernen |
| `app/auth/signout/route.ts` | Abmelden |
