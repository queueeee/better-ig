# eID-Identitätskonzept — zurückgestellt am 14.08.2026

Ausgearbeitetes, aber **nicht umgesetztes** Konzept für „genau ein Account pro Person"
über den NFC-Chip im Personalausweis bzw. Reisepass, bei maximaler Datensparsamkeit.
Drei Analyserunden mit Primärquellen-Recherche und adversarieller Prüfung.

Zurückgestellt zugunsten eines normalen Logins. Dieses Verzeichnis ist der
Wiedereinstiegspunkt, falls das Thema später wieder aufgegriffen wird.

## Was hier liegt

| Datei | Inhalt |
|---|---|
| `eid_pseudonym_datenfluss_v2.svg` | Datenfluss Client/Server: was das Gerät nie verlässt |
| `eid_recovery_matrix.svg` | Vier Verlust-Szenarien und der jeweils richtige Weg |
| `eid_server_ticketflow.svg` | Registrierung über zwei Trust-Domänen mit passkey-gebundenem Ticket |
| `schema-eid.sql` | Vollständiges Datenmodell v2 mit Begründungen als Kommentare |
| `personalausweisportal-faq-pseudonymfunktion.md` | Amtlicher FAQ-Volltext (die Seite blockt automatisierte Abrufe) |

## Der Kern in fünf Sätzen

Der Personalausweis kann per Restricted Identification ein Pseudonym erzeugen, das an
Karte **und** Diensteanbieter gebunden ist — Name, Geburtsdatum und Foto verlassen das
Gerät nie. Registrierung heißt: Pseudonym gegen eine Uniqueness-Registry prüfen, die
nichts als Hashes enthält und strikt getrennt von der Account-Datenbank läuft. Die
einzige Brücke zwischen beiden ist ein blind signiertes Einweg-Ticket (RFC 9474), in das
der Client den Hash seines Passkeys committet, sodass ein gestohlenes Ticket wertlos ist.
Der Login läuft nie über die eID, sondern immer über Passkeys — die Karte ist reines
Registrierungs-Gate. Für ausländische Nutzer gibt es denselben Mechanismus über den
Reisepass-Chip per ZK-Proof.

## Was daran belastbar ist

Alle tragenden Fakten wurden gegen Primärquellen verifiziert (BSI TR-03127/03128/03130,
PAuswG, PAuswVwV, DSGVO, DSA, TDDDG, RFC 9474/9576/9578, ZKPassport-Quellcode,
EUDI-ARF, PostgreSQL-Doku und -Quellcode).

**Rechtlich überraschend gut:** Es gibt in Deutschland **keine Pflicht für Plattformen,
IP-Adressen zu erheben oder zu speichern** — das Gesetz vom April 2026 trifft nur
Zugangsanbieter. DSGVO Art. 11 befreit ausdrücklich davon, Identifizierungsdaten
vorzuhalten, und setzt die Auskunfts- und Löschpflichten der Art. 15–20 aus, wenn der
Betreiber Betroffene nachweislich nicht identifizieren kann. Als Klein- oder
Kleinstunternehmen entfallen über DSA Art. 19 die Zusatzpflichten inklusive Jugendschutz.
Und als normaler Diensteanbieter (nicht Identifizierungsdiensteanbieter nach § 21b
PAuswG) besteht **keine ISO-27001-Pflicht**.

**Praktisch:** Berechtigungszertifikat kostet 102 €, dauert 1–2 Wochen, gilt max. 3 Jahre;
§ 21 PAuswG ist eine Anspruchsnorm mit vier Bedingungen. Das Pseudonym ist als Funktion
Nr. 12 separat berechtigbar, das Zertifikat lässt sich also darauf beschränken.

## Die drei Gründe, warum es nicht trivial ist

1. **Das Pseudonym hängt an der Karte, nicht an der Person.** Eine neue Karte erzeugt
   zwingend ein neues Pseudonym, und es gibt kein Überlappungsfenster — die alte Karte
   wird bei Aushändigung der neuen entwertet und ihre eID abgeschaltet. Die Migration
   muss deshalb eingeloggt passieren, bevor die alte Karte weg ist.
2. **„Ein Account pro Person" ist mit Dokumenten nicht erreichbar.** Wer Personalausweis
   und Auslandspass hat, hat zwei unverkettbare Pseudonym-Domänen. Die ehrliche Zusage
   lautet „ein Account pro Dokument, Dokumentmenge per Policy gedeckelt".
3. **Geschützt ist die Zuordnung, nicht die Mitgliedschaft.** Dass eine bestimmte Person
   registriert ist, bleibt gegen Beschlagnahme sichtbar — nur *welcher* Account ihr
   gehört, nicht.

## Fallstricke, die viel Zeit gekostet haben

- **`VACUUM FREEZE` löscht `xmin` nicht.** Seit PostgreSQL 9.4 wird nur ein Flag gesetzt,
  der Originalwert bleibt „for possible forensic use" erhalten. `CLUSTER`, `VACUUM FULL`
  und `pg_repack` kopieren den Header ebenfalls mit. Wirksam ist nur
  `CREATE TABLE … AS SELECT … ORDER BY random()` plus Swap.
- **Zwei Tabellen im selben Cluster teilen den XID-Raum.** Eine gemeinsame Transaktion
  gibt beiden Zeilen dieselbe `xmin` — ein exakter Join über eine Systemspalte, ganz ohne
  Fremdschlüssel. Die Trennung muss auf Cluster-Ebene passieren.
- **Anonymitäts-Fenster müssen zählbasiert sein, nicht zeitbasiert.** Ein Zeitfenster ist
  nachts und in der Launchphase genau dann klein, wenn Nutzer am exponiertesten sind.
- **Es gibt keinen bezahlbaren HSM mit attestierbarem monotonem Signaturzähler.**
  YubiHSM-2-Audit-Log: 62 Einträge Ringpuffer, 16 Bit, nicht attestiert; dazu ~139 ms je
  RSA-2048-Signatur. Für einen echten Zähler braucht es ein TPM 2.0 (`TPM2_NV_Certify`).
- **Der HSM-Aufruf kann nicht an einer DB-Transaktion teilnehmen.** Erst INSERT und
  COMMIT, dann signieren — sonst holen sich parallele Sessions beliebig viele gültige
  Signaturen, während die überzähligen Transaktionen folgenlos zurückrollen.

## Wenn es wieder aufgegriffen wird

Der Login sollte **von Anfang an über Passkeys laufen**. Das gesamte Konzept baut darauf,
dass die eID nur das Registrierungs-Gate ist und der Passkey die Kontrolle über den
Account trägt — wer jetzt schon Passkeys hat, setzt später obendrauf, statt umzubauen.

Erster praktischer Schritt wäre dann der Antrag auf das Berechtigungszertifikat bei der
Vergabestelle (Bundesverwaltungsamt, Köln), weil ohne dieses kein Test mit einer echten
Karte möglich ist und die Bearbeitung ein bis zwei Wochen dauert.

Langfristige Alternative: Das EUDI-Wallet-Rahmenwerk fordert in Anforderung PA_31
ausdrücklich Pseudonyme, die einen Wallet-Wechsel überleben — genau die personenstabile
Kontinuität, die der Ausweis-Chip nicht liefert. Das Protokoll dafür ist noch nicht
spezifiziert; die deutsche Wallet startet am 02.01.2027.
