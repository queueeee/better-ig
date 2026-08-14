# Personalausweisportal — FAQ-Rubrik „Pseudonymfunktion und Ausweiswechsel"

Volltext aller fünf Einträge der Rubrik, abgerufen am 14.08.2026.

**Quelle:** <https://www.personalausweisportal.de/SharedDocs/faqs/Webs/PA/DE/Haeufige-Fragen/9_pseudonymfunktikon/pseudonymfunktion-liste.html>
(Der Pfadbestandteil `pseudonymfunktikon` enthält tatsächlich einen Tippfehler der Behörde.)

**Hinweis zur Beschaffung:** Die Seiten liefern bei automatisiertem Abruf HTTP 400 („Zugriff nicht möglich", BMI-WAF). Der Text unten stammt aus Wayback-Machine-Snapshots (2020-12-10, 2022-10-08, 2024-04-30) und einem Live-Abruf über einen Text-Proxy; alle Fassungen sind wortgleich, der Inhalt ist seit mindestens Dezember 2020 unverändert. Die im Projektverzeichnis liegende `faq.html` ist genau diese 400-Fehlerseite und enthält keinen Inhalt.

---

## 1. Verliere ich bei einem Ausweiswechsel den Zugang zu einem Dienst, bei dem ich mich mit dem Pseudonym authentifiziere?

> Wie bei jeder anderen Art von Hardware-Token kann auch der Personalausweis nach einem Ausweiswechsel nicht unmittelbar zur pseudonymen Wiederanmeldung am Dienst verwendet werden. Da mit dem Pseudonym nur das Ausweisdokument und nicht der Benutzer wiedererkannt wird, ist somit ein Nutzer-Tracking über einen Ausweiswechsel hinweg absichtlich ausgeschlossen.
>
> Im Gegensatz zu anderen Authentisierungs-Token bietet die Online-Ausweisfunktion jedoch die Möglichkeit den Benutzer über sein neues Ausweisdokument zu identifizieren und anschließend das neue Pseudonym zur Wiedererkennung zu registrieren.
> Bitte fragen Sie im Falle eines Ausweiswechsels bei Ihrem Diensteanbieter nach Möglichkeiten zur Erneuerung des Pseudonyms für die Wiedererkennung am Dienst.

`A9_1_zugang_ausweiswechsel.html`

## 2. Welche Möglichkeiten haben Diensteanbieter, um nach einem Ausweiswechsel den Zugang zum Kundenkonto über eine pseudonyme Wiedererkennung zu erhalten?

> Um auch nach einem Ausweiswechsel weiterhin Zugang zu einem Dienst über die Pseudonymfunktion zu erhalten, ist eine Migration von der „alten" zur „neuen" Ausweiskarte erforderlich. Diese kann nur über andere Daten unabhängig von der "alten" Ausweiskarte erfolgen.
>
> Einige Möglichkeiten hierzu sind:
>
> a) Nutzung eines „Einmal-Kennworts" (oder auch: PUK, Transferschlüssel). Ein solches Kennwort wird vom Diensteanbieter nach Login mit der „alten" Ausweiskarte im Vorfeld eines anstehenden Ausweiswechsels bereitgestellt. Nach dem Ausweiswechsel und einem Login mit der „neuen" Ausweiskarte kann dieses Kennwort vom Benutzer eingegeben und danach das Pseudonym der „neuen" Ausweiskarte zum Login verwendet werden.
>
> b) Nutzung eines „Fallback-Tokens". Der Benutzer kann neben dem Personalausweis ein weiteres (Hardware-)Token zur Authentifizierung hinterlegen und dieses zur Registrierung der „neuen" Ausweiskarte verwenden.
>
> c) Wiedererkennung über andere personenbezogene Daten. Es werden im Konto personenbezogene Daten gespeichert, die über die Grenzen der Ausweiskarte hinweg konstant bleiben (Vorname, Geburtsname, Geburtsort, Geburtsdatum), um den Inhaber wiederzuerkennen. Dies setzt eine entsprechende Datenspeicherung im Konto voraus.
>
> Bitte fragen Sie im Falle eines Ausweiswechsels bei Ihrem Diensteanbieter nach einer Möglichkeit zur Erneuerung des Pseudonyms für die Wiedererkennung am Dienst.

`B9_2_zugang_ausweiswechsel_diensteanbieter.html`

## 3. Welchen Mehrwert bietet dann die Pseudonym-Funktion, wenn man anderweitig gegenüber dem Diensteanbieter identifizierbar sein muss, um Zugang zu seinem Kundenkonto behalten zu können?

> Die Online-Ausweisfunktion kann sowohl zur erstmaligen Identifizierung eines Internetteilnehmers als auch zu seiner Wiedererkennung (Authentifizierung) eingesetzt werden. Ist für den ersten Fall im Regelfall das Auslesen von Personendaten erforderlich, reicht im zweiten Fall häufig allein das Pseudonym aus.
>
> Eine Nutzung des Pseudonyms zur Authentifizierung ist aber durchaus auch ohne Auslesen personenbezogener Daten des Benutzers möglich. Die Migration nach einem Ausweiswechsel muss dann über andere, dem Kundenkonto (im Vorfeld) zugeordnete, Mittel sichergestellt werden.

`C9_3_mehrwert_pseudonymfunktion.html`

## 4. Kann bei einem Ausweiswechsel der „alte" Ausweis zur Zuordnung des „neuen" Ausweises verwendet werden?

> Spätestens mit der Ausgabe eines neuen Ausweisdokuments wird das alte Ausweisdokument inklusive Online-Ausweisfunktion ungültig gemacht. Ein Ausweiswechsel für die Wiedererkennung über das Pseudonym ist somit ausschließlich unabhängig vom alten Ausweisdokument möglich.

`D9_4_ausweiswechsel_zuordnung_alt_neu.html` — Stand der Seite: 02.11.2023. Das ist die vollständige Antwort; die Seite besteht nur aus diesen zwei Sätzen.

## 5. Können Diensteanbieter bei Authentifizierung mit Pseudonym die Gültigkeitsdauer des Ausweisdokuments feststellen und bei bevorstehendem Ablauf den Nutzer informieren?

> Bei einer Authentifizierung über Pseudonym wird grundsätzlich nur die Gültigkeit der Ausweiskarte und nicht das Ablaufdatum der Gültigkeit festgestellt. Ein Abgleich vom aktuellen Datum mit dem letzten Tag der Gültigkeitsdauer und eine daraus abgeleitete Information der Nutzer können Diensteanbieter dennoch im Rahmen Ihrer Berechtigung umsetzen.

`E9_5_ausweiswechsel_gueltigkeitsdauer.html`

---

## Bedeutung für dieses Projekt

**Zu 4:** Bestätigt amtlich, dass es kein Überlappungsfenster gibt, in dem alte und neue Karte gleichzeitig eID-fähig wären. Eine Brücken-Zeremonie mit beiden Karten ist ausgeschlossen — die eingeloggte Karten-Rotation ist der einzig gangbare Weg.

**Zu 2:** Die Behörde nennt selbst genau drei Migrationswege. Weg (a), das vorab ausgegebene Einmal-Kennwort, entspricht dem Kontinuitäts-Token, das wir verworfen haben (freiwillig, korrelierter Verlust, Burn-Sackgassen). Weg (b), das Fallback-Token, ist faktisch unser Passkey. Weg (c) scheidet aus, weil er die Speicherung von Klarnamen-Daten voraussetzt.

**Zu 1:** Der zweite Absatz beschreibt den Weg, den Nutzer beim Wechsel über die *Identitätsdaten* der neuen Karte wiederzuerkennen. Für uns nicht gangbar — das Berechtigungszertifikat soll auf die Restricted Identification beschränkt bleiben.

**Zu 5:** Relevant für die geplante Ablauf-Erinnerung. Bei reiner Pseudonym-Authentisierung wird nur binär „gültig / nicht gültig" festgestellt, nicht das Ablaufdatum. Wer den Nutzer vor dem Kartenablauf warnen will, braucht das Datenfeld in der Berechtigung — was der Datensparsamkeit widerspricht. Gangbare Alternative: die Gültigkeitsprüfung nimmt ein *Testdatum* entgegen, sodass sich das Ablaufdatum über mehrere Abfragen eingrenzen und ausschließlich lokal auf dem Gerät hinterlegen lässt.
