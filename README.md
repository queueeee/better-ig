# Bilder

Ein kleines Bilder-Netzwerk ohne Passwörter. Anmeldung per Passkey, Bilder
werden auf dem Gerät verkleinert und von ihren Metadaten befreit, bevor sie
hochgeladen werden.

Next.js 16 · React 19 · Tailwind 4 · Supabase

## Einrichten

Lokal: [SETUP.md](SETUP.md) · Online gehen: [DEPLOY.md](DEPLOY.md)

Siehe [SETUP.md](SETUP.md) — Supabase-Projekt, Passkeys, Mailversand, Migrationen.
Kurzfassung:

```bash
npm install
cp .env.local.example .env.local   # Werte aus dem Supabase-Dashboard eintragen
npm run check                      # prüft, ob die Einrichtung vollständig ist
npm run dev
```

`npm run check -- --mail` verschickt zusätzlich eine echte Anmeldemail und
zeigt, woran der Versand scheitert.

## Wie die Anmeldung funktioniert

Ein Passkey kann bei Supabase nicht der einzige Faktor sein — ihn zu
registrieren setzt eine bestätigte Sitzung voraus. Daraus folgt:

1. **Erstes Mal:** Code per E-Mail → angemeldet → Passkey einrichten
2. **Danach:** ein Klick, ohne E-Mail-Eingabe
3. **Neues Gerät:** wieder Code, dann dort einen eigenen Passkey anlegen

Der Code-Weg ist damit kein Provisorium, sondern der dauerhafte
Wiedereinstieg, wenn ein Gerät verloren geht.

## Was mit Bildern passiert

Bilder werden vollständig im Browser aufbereitet, bevor sie das Gerät
verlassen (`lib/bild.ts`): gedreht anhand der EXIF-Ausrichtung, auf 1440 Pixel
lange Kante verkleinert, als JPEG neu kodiert.

Das Neuzeichnen auf ein Canvas erzeugt eine neue Datei, die nur noch Pixel
enthält. Sämtliche Metadaten verschwinden dabei — **auch die
GPS-Koordinaten**, die Handys standardmäßig in jedes Foto schreiben. Ein
Foto, das den Wohnort verrät, wird also gar nicht erst hochgeladen.

JPEG ist dabei kein Zufall: Safari unterstützt `canvas.toBlob` mit WebP nicht
und fällt still auf PNG zurück, was die Datei vergrößert statt sie zu
verkleinern.

## Aufbau

| Pfad | Zweck |
|---|---|
| `proxy.ts` | Sitzung auffrischen, Routen schützen (hieß vor Next.js 16 `middleware.ts`) |
| `lib/supabase/` | Clients für Browser, Server und Proxy |
| `lib/bild.ts` | Verkleinern, drehen, Metadaten entfernen |
| `lib/feed.ts` | Feed-Abfrage, Bild-URLs, relative Zeitangaben |
| `lib/profile.ts` | Profil des angemeldeten Nutzers |
| `app/login/` | Anmeldung per Passkey oder Code |
| `app/willkommen/` | Namenswahl beim ersten Anmelden |
| `app/hochladen/` | Bild auswählen, aufbereiten, veröffentlichen |
| `app/p/[id]/` | Einzelner Beitrag mit Kommentaren |
| `app/profil/` | Profil, eigene Bilder, Passkey-Verwaltung |
| `app/actions.ts` | Server Actions für Likes und Kommentare |
| `supabase/migrations/` | Tabellen, Zugriffsregeln, Speicher-Bucket |
| `supabase/templates/` | E-Mail-Vorlagen für das Dashboard |
| `scripts/check-supabase.mjs` | Prüft die Einrichtung, testet den Mailversand |

Datenbank-Migrationen laufen über den SQL Editor im Dashboard, solange kein
Docker für die lokale Supabase-Umgebung installiert ist.

## Zugriffsregeln

Alles läuft über Row Level Security in der Datenbank, nicht über Prüfungen im
Anwendungscode:

- Profile, Beiträge, Likes und Kommentare dürfen alle Angemeldeten lesen
- Schreiben und Löschen nur die eigene Zeile
- Kommentare darf zusätzlich löschen, wem der Beitrag gehört
- Im Bildspeicher darf jeder nur in seinen eigenen Ordner schreiben

Bei Likes ist das Paar aus Beitrag und Nutzer der Primärschlüssel. Damit
erzwingt die Datenbank, dass niemand zweimal dasselbe mag — Doppelklicks
laufen ins Leere, statt Duplikate zu erzeugen.

## Zurückgestellt

`docs/eid-parked/` enthält ein ausgearbeitetes Konzept für Identitätsprüfung
per Personalausweis-Chip — ein Konto pro Person, ohne dass Namen oder
Ausweisnummern je den Server erreichen. Nicht umgesetzt; die README dort
erklärt Stand und Fallstricke.
