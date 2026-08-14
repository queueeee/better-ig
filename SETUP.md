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

Unter **Authentication → Email Templates** müssen **zwei** Vorlagen ersetzt
werden:

| Vorlage im Dashboard | Inhalt aus |
|---|---|
| **Confirm signup** | [`supabase/templates/confirm-signup.html`](supabase/templates/confirm-signup.html) |
| **Magic Link** | [`supabase/templates/magic-link.html`](supabase/templates/magic-link.html) |

Beide zu ändern ist zwingend, und das ist die Stelle, an der fast jeder
hängenbleibt: `signInWithOtp` heißt zwar „OTP", landet serverseitig aber im
Magic-Link-Handler. Der behandelt einen Nutzer als neu, wenn er entweder nicht
existiert **oder existiert, aber noch unbestätigt ist** — und verschickt in
beiden Fällen eine *Signup*-Mail. Für jede Erstanmeldung greift also „Confirm
signup"; erst bei einem bestätigten Konto kommt „Magic Link" zum Zug. Wer nur
letztere anpasst, bekommt weiterhin einen Link.

Entscheidend ist in beiden die Variable `{{ .Token }}` — sie rendert den
sechsstelligen Code. Achte auf den Punkt vor `Token`; `{{ .TokenHash }}` ist
etwas anderes und erzeugt eine unbrauchbare Zeichenkette.

Beide Vorlagen kommen bewusst **ohne** `{{ .ConfirmationURL }}`, enthalten also
keinen Link. Das ist kein Schönheitsentscheid: Ein Anmeldelink wird von
E-Mail-Scannern in Firmen- und Provider-Infrastruktur häufig vorab abgerufen,
was den Einmal-Token verbraucht, bevor ein Mensch ihn anklickt. Ein Code, den
man abtippt, hat dieses Problem nicht — und die App braucht deshalb auch keinen
Callback-Route-Handler.

Die Vorlagen liegen im Repo, weil Dashboard-Inhalte sonst nirgends versioniert
sind und bei einem neuen Projekt verloren gehen.

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
