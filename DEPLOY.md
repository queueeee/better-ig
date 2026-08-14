# Online gehen

Solange keine Domain in Resend verifiziert ist, kann sich außer dir niemand
anmelden — an fremde Adressen wird keine Mail zugestellt. Das ist der eigentliche
Blocker, und deshalb steht die Domain hier an erster Stelle.

Rechne mit etwa einer Stunde, davon die Hälfte Wartezeit auf DNS.

---

## Vorab: warum zwei Supabase-Projekte

Die **Relying Party ID** ist die Domain, an die Passkeys kryptografisch gebunden
sind. Pro Supabase-Projekt gibt es genau **eine**, und die WebAuthn-Spezifikation
verlangt, dass jeder erlaubte Origin dieser ID entspricht oder eine Subdomain
davon ist. `localhost` ist keine Subdomain von `deinedomain.de`.

Daraus folgt: **Ein Projekt kann nicht gleichzeitig lokal und produktiv Passkeys
anbieten.** Stellst du die ID deines jetzigen Projekts auf die echte Domain um,
funktioniert die Anmeldung per Passkey lokal nicht mehr.

Deshalb: Das bestehende Projekt bleibt die Entwicklungsumgebung. Für die
Produktion kommt ein zweites dazu.

> **Die Relying Party ID lässt sich später nicht mehr ändern.** Jede Änderung
> macht alle registrierten Passkeys unbrauchbar. Sie verschwinden dabei nicht,
> sondern bleiben als tote Einträge in Supabase *und* im Passwortmanager der
> Nutzer stehen; der Browser bietet sie schlicht nicht mehr an, ohne
> Fehlermeldung. Wähle sie also jetzt endgültig — und nimm die nackte Domain
> (`deinedomain.de`), nicht `www.deinedomain.de`, damit spätere Subdomains
> abgedeckt sind.

---

## 1. Domain registrieren

Irgendein Registrar, wenige Euro im Jahr. Du brauchst weder Webserver noch
Hosting, nur Zugriff auf die DNS-Verwaltung.

## 2. Domain in Resend verifizieren

*Domains → Add Domain*. Nimm eine **Subdomain** für den Mailversand, etwa
`mail.deinedomain.de` — so bleibt die Wurzeldomain für andere Zwecke frei und
ein Reputationsschaden trifft nicht alles.

Resend zeigt die nötigen DNS-Einträge an: ein TXT-Eintrag für DKIM sowie MX und
TXT für SPF. Genau so übernehmen, auf automatisch angehängte Domainnamen des
Registrars achten. Die Prüfung dauert meist unter einer Viertelstunde.

Danach empfiehlt sich ein DMARC-Eintrag auf `_dmarc.mail` mit dem Wert
`v=DMARC1; p=none;` — er verbessert die Zustellung bei Gmail und GMX spürbar.

## 3. Zweites Supabase-Projekt anlegen

Ein neues Projekt für die Produktion, dann der Reihe nach:

- **Migrationen** aus `supabase/migrations/` in numerischer Reihenfolge im SQL
  Editor ausführen
- **E-Mail-Vorlagen** aus `supabase/templates/` eintragen (beide!)
- **SMTP** auf Resend, diesmal mit `login@mail.deinedomain.de` als Absender
- **Passkeys** einschalten mit:

  | Feld | Wert |
  |---|---|
  | Relying Party ID | `deinedomain.de` |
  | Relying Party Origins | `https://deinedomain.de`, `https://www.deinedomain.de` |

- **Site URL** auf `https://deinedomain.de` setzen (unter *Authentication → URL
  Configuration*). Sie zeigt sonst weiter auf localhost und schickt Nutzer bei
  jeder Bestätigungsmail ins Leere.

## 4. Bei Vercel deployen

Repository verbinden, dann die beiden Umgebungsvariablen des **Produktions**-
Projekts eintragen:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Domain unter *Settings → Domains* hinzufügen und die DNS-Einträge setzen, die
Vercel anzeigt.

## 5. Prüfen

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npm run check
```

Dann auf der echten Domain: anmelden per E-Mail-Code, Passkey einrichten,
abmelden, per Passkey wieder anmelden. Erst dieser letzte Schritt beweist, dass
die Relying Party ID stimmt.

---

## Was in Vorschau-Deployments nicht geht

Vercel gibt jedem Commit eine eigene Adresse unter `*.vercel.app`. Die ist keine
Subdomain deiner Domain, und `vercel.app` taugt auch nicht selbst als Relying
Party ID — es steht auf der Public Suffix List, und die Spezifikation schließt
öffentliche Suffixe ausdrücklich aus.

**Passkeys funktionieren in Vorschauen also grundsätzlich nicht.** Die App
erkennt das an `NEXT_PUBLIC_VERCEL_ENV` und blendet den Passkey-Knopf dort aus,
statt ihn in eine Sackgasse laufen zu lassen; der E-Mail-Code bleibt.

Damit das greift, muss in den Vercel-Projekteinstellungen unter *Environment
Variables* die System-Variable `NEXT_PUBLIC_VERCEL_ENV` aktiviert sein.

---

## Wenn du doch nur ein Projekt willst

Es gibt genau einen sauberen Weg: lokal unter einer echten Subdomain arbeiten.

1. In der `hosts`-Datei `127.0.0.1 local.deinedomain.de` eintragen
2. `npx next dev --experimental-https` starten
3. `https://local.deinedomain.de:3000` als vierten erlaubten Origin eintragen

Das erfüllt beide Regeln, weil es eine echte Subdomain ist. **Der Preis:**
Passkeys, die du auf deinem Entwicklungsrechner anlegst, gelten dann auch in
Produktion — dieselbe Relying Party ID. Für ein Solo-Projekt vertretbar, für ein
Team nicht.

Nicht funktionieren wird der naheliegende Versuch, `127.0.0.1` statt `localhost`
zu verwenden: Eine IP-Adresse ist keine Domain, der Browser lehnt sie ab.
