# E-Mail-Vorlagen

Einzutragen im Supabase-Dashboard unter *Authentication → Email Templates*.
Sie liegen hier im Repo, weil Dashboard-Inhalte sonst nirgends versioniert sind
und beim Anlegen eines neuen Projekts verloren gehen.

| Datei | Vorlage im Dashboard |
|---|---|
| `confirm-signup.html` | **Confirm signup** |
| `magic-link.html` | **Magic Link** |

Die Dateien enthalten bewusst **keine Kommentare**: Alles im Feld landet
unverändert in der Mail, und geschweifte Klammern in Kommentaren sind eine
unnötige Fehlerquelle beim Rendern.

## Warum beide Vorlagen

`signInWithOtp` heißt zwar „OTP", landet serverseitig aber im Magic-Link-Handler.
Der behandelt einen Nutzer als neu, wenn er entweder nicht existiert **oder
existiert, aber noch unbestätigt ist** — und verschickt dann eine *Signup*-Mail.

Für jede Erstanmeldung greift also **Confirm signup**. Erst bei einem
bestätigten Konto kommt **Magic Link** zum Zug. Wer nur letztere anpasst,
bekommt bei jedem neuen Konto weiterhin einen Link.

## Die Variable

Entscheidend ist `{{ .Token }}` — sie rendert den sechsstelligen Code.

Häufige Tippfehler, die alle einen Fehler beim Versand auslösen und als
`HTTP 500 „Error sending confirmation email"` sichtbar werden:

| falsch | warum |
|---|---|
| `{{ Token }}` | Der Punkt fehlt |
| `{{ .token }}` | Kleinschreibung; Go-Templates sind case-sensitiv |
| `{{ .TokenHash }}` | Existiert, ist aber der Hash für Links, kein Code |
| `{{.Token}}` | Funktioniert — Leerzeichen sind optional |

## Kein Link in der Mail

Beide Vorlagen kommen ohne `{{ .ConfirmationURL }}` aus. Das ist Absicht:
Anmeldelinks werden von E-Mail-Scannern in Firmen- und Provider-Infrastruktur
häufig vorab abgerufen, was den Einmal-Token verbraucht, bevor ein Mensch ihn
anklickt. Ein abgetippter Code hat dieses Problem nicht — und die App braucht
deshalb auch keinen Callback-Route-Handler.

## Wenn der Versand fehlschlägt

```
npm run check -- --mail deine@adresse.de
```

Kommt dort `HTTP 500 „Error sending confirmation email"`, sind zwei Ursachen
möglich: ein Fehler beim Rendern der Vorlage oder ein Fehler beim SMTP-Versand.

So trennt man beides: Die Vorlage im Dashboard vorübergehend durch eine
einzige Zeile ersetzen —

```html
<p>{{ .Token }}</p>
```

Geht der Versand damit durch, lag es an der Vorlage. Bleibt der Fehler, liegt
es an der SMTP-Verbindung; den Klartext-Fehler zeigt dann das Dashboard unter
*Logs → Auth Logs*.
