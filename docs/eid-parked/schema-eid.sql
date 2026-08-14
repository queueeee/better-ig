-- =====================================================================
-- Datenmodell v2 — Uniqueness-Registry (Domäne A) und Produkt (Domäne B)
-- Stand: 14.08.2026
--
-- Grundprinzip: A und B laufen in GETRENNTEN PostgreSQL-Clustern, auf
-- getrennter Hardware, mit getrennten Backup-Zyklen. Das ist keine
-- Empfehlung, sondern Voraussetzung: zwei Tabellen im selben Cluster
-- teilen sich den XID-Raum, und gemeinsame Transaktionen tragen dann
-- identische xmin-Werte — ein exakter, permanenter Join über eine
-- Systemspalte, ganz ohne Fremdschlüssel.
--
-- Die zentrale Lehre aus der Analyse: Ordnung lässt sich nicht
-- verschleiern, sie muss zerstört werden. Grobe Zeitspalten sind
-- wirkungslos, solange der Storage-Layer die exakte Reihenfolge führt.
-- =====================================================================


-- =====================================================================
-- DOMÄNE A — Identität (eigene Hardware, self-hosted)
-- =====================================================================

-- Ein Slot pro Ausweisdokument. Bewusst minimal: jede zusätzliche
-- Spalte ist ein Quasi-Identifier. Die frühere Kombination aus
-- (path, reg_epoch, rereg_count) war so trennscharf, dass eine Abfrage
-- wie "Pfad 2, Q1/2026, zweimal neu registriert" typischerweise genau
-- eine Zeile lieferte — Re-Identifikation ohne jeden Kryptobruch.
CREATE TABLE identity_slot (
    slot_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Zwei-Schichten-Konstruktion:
    --   inner = HMAC(K_path, LE16(len(p)) || p)          -- im HSM
    --   ref   = AES-SIV(K_outer, inner)                  -- deterministisch
    -- AES-SIV ist deterministisch, erhält also Gleichheit und damit den
    -- UNIQUE-Index. Der Gewinn: K_outer ist OHNE das rohe Pseudonym
    -- rotierbar (entschlüsseln, neu verschlüsseln). Die frühere Annahme
    -- "der Schlüssel kann nie rotiert werden" war schlicht falsch und
    -- hätte eine Kompromittierung unheilbar gemacht.
    -- K_path = HKDF(K_inner, "slot-ref-v1|path=" || LE16(path)):
    -- der Pfad geht in die SCHLÜSSELABLEITUNG, nicht in die Nachricht.
    -- Rohe Konkatenation "path || pseudonym" wäre nicht präfixfrei —
    -- sobald ein dritter Pfad mit zweistelliger Nummer dazukommt,
    -- kollidieren '1'||'0abc' und '10'||'abc'.
    pseudonym_ref     bytea NOT NULL UNIQUE
                      CHECK (octet_length(pseudonym_ref) = 32),

    key_gen           smallint NOT NULL DEFAULT 1,  -- für Lazy-Rotation von K_inner

    -- Frühestens ab diesem Batch darf neu registriert werden.
    -- NOT NULL mit Default: eine NULLable Spalte ist selbst im Rohtupel
    -- am Null-Bitmap erkennbar, und "hat neu registriert" ist eine
    -- kleine, stark identifizierende Teilmenge.
    rereg_not_before  integer NOT NULL DEFAULT 0,

    -- Gedeckelt auf 0/1/2/mehr statt exakter Zähler — ein exakter Wert
    -- individualisiert (rereg_count = 3 ist praktisch eindeutig).
    rereg_bucket      smallint NOT NULL DEFAULT 0
                      CHECK (rereg_bucket BETWEEN 0 AND 3)
);

-- KEINE Spalten path, reg_epoch, ticket_issued mehr:
--   path        -> steckt in der Schlüsselableitung, A kennt beim
--                  Registrieren den Pfad ohnehin und probiert beide
--   reg_epoch   -> wurde nur zur Berechnung von rereg_not_before
--                  gebraucht, das genügt allein
--   ticket_issued -> war ein UPDATE auf der Zeile und damit ein
--                  Feinzeitstempel: jedes UPDATE erzeugt eine neue
--                  Tupelversion mit frischer xmin, während die alte
--                  im Heap stehen bleibt. Der Zustand lebt jetzt im
--                  append-only Log unten.


-- Append-only Ausstellungs-Log. Ersetzt sowohl ticket_issued als auch
-- den früheren Zähler-Abgleich.
--
-- Warum: Die alte Invariante "HSM-Signaturen == Zeilenzahl" war durch
-- einen Insider trivial fälschbar, weil ihre rechte Seite in mutablen
-- Spalten stand. Wer sich k zusätzliche Signaturen zog, glich die
-- Bilanz mit einem einzigen UPDATE auf rereg_count wieder aus — und
-- der geplante Anti-Forensik-Rewrite hätte ausgerechnet die
-- Beweismittel beseitigt.
CREATE TABLE issuance (
    seq            bigint PRIMARY KEY,          -- vom Monotonic Counter, nicht bigserial
    slot_id        uuid NOT NULL REFERENCES identity_slot,
    op_type        smallint NOT NULL CHECK (op_type IN (0,1,2)),  -- 0=neu, 1=rereg, 2=rebind
    key_id         smallint NOT NULL,
    counter_value  bigint NOT NULL,             -- Stand des TPM-NV-Counters
    prev_hash      bytea NOT NULL CHECK (octet_length(prev_hash) = 32),
    entry_hash     bytea NOT NULL CHECK (octet_length(entry_hash) = 32),
    attestation    bytea NOT NULL               -- TPM2_NV_Certify über counter_value
);
REVOKE UPDATE, DELETE ON issuance FROM PUBLIC;

-- WICHTIGE KORREKTUR gegenüber der vorigen Runde: Ein HSM mit
-- attestierbarem monotonem Signaturzähler existiert im bezahlbaren
-- Segment nicht. Der YubiHSM-2-Audit-Log fasst 62 Einträge im
-- Ringpuffer mit 16-bit-Zähler und wird nicht mit dem Attestation-Key
-- signiert; die YubiHSM-Attestierung belegt die Herkunft von
-- Schlüsseln, nicht deren Nutzungshäufigkeit.
-- Die einzige Standardkomponente mit echtem, signierbarem monotonem
-- Zähler ist das TPM 2.0: NV-Counter mit 64 bit, kann nie zurücklaufen
-- (auch nicht durch Löschen und Neuanlegen), und TPM2_NV_Certify
-- liefert eine signierte Aussage über seinen Stand.
-- Der Kettenkopf (entry_hash der letzten Zeile) wird periodisch extern
-- verankert, damit ein Rollback der Kette auffällt.

-- Nebenbefund zum Durchsatz: YubiHSM 2 braucht rund 139 ms je
-- RSA-2048-Signatur, also etwa 7 Signaturen pro Sekunde. Für einen
-- Ticket-Issuer ist das der Flaschenhals — Kapazitätsplanung nötig.


-- Reservierung für idempotente Retries der Blind-Signatur.
--
-- Warum das gebraucht wird: Ohne diese Tabelle verbrennt ein
-- Paketverlust auf dem Rückweg das einzige Ticket eines Nutzers, und
-- ein Angreifer, der den Uplink des Opfers während der Registrierung
-- kurz stört, sperrt es gezielt für Monate aus.
-- Warum es sicher ist: RFC 9474 ist auf Signerseite eine reine
-- RSA-Exponentiation über die geblendete Nachricht und damit
-- DETERMINISTISCH — dieselbe geblendete Nachricht ergibt byteidentisch
-- dieselbe Signatur. Ein Retry mit identischem Blob ist also
-- nachweislich kein zweites Ticket.
CREATE TABLE blind_reservation (
    slot_id       uuid PRIMARY KEY REFERENCES identity_slot,
    blind_hash    bytea NOT NULL CHECK (octet_length(blind_hash) = 32),
    expires_batch integer NOT NULL     -- Batch-Nummer, keine feine Zeit
);


-- Issuer-Schlüssel. Der EXCLUDE-Constraint ist der eigentliche Inhalt
-- dieser Tabelle.
--
-- Angriff, den er verhindert: Blind-Signaturen schützen die NACHRICHT,
-- nicht die SCHLÜSSELWAHL. Erlaubt das Schema mehrere gleichzeitig
-- gültige Schlüssel, kann A einer Zielperson einen exklusiven Schlüssel
-- ausliefern; B sieht dann beim Verifizieren, welcher Account damit
-- entstand. Deanonymisierung ohne jeden Kryptobruch und ohne Spur in
-- den Daten.
CREATE TABLE issuer_key (
    key_id        smallint PRIMARY KEY,
    public_key    bytea NOT NULL,
    purpose       text NOT NULL CHECK (purpose = 'rsabssa-ticket-v1'),
    suite         smallint NOT NULL,   -- RFC-9474-Variante, hier: PSS-Deterministic
    valid_from    timestamptz NOT NULL,
    valid_until   timestamptz NOT NULL,
    log_index     bigint NOT NULL UNIQUE,   -- Position im Transparency-Log
    log_proof     bytea NOT NULL,           -- Inklusionsbeweis (RFC 9162)
    EXCLUDE USING gist (tstzrange(valid_from, valid_until) WITH &&)
);

-- purpose/suite verhindern Cross-Protocol-Missbrauch: Bei einer blinden
-- Signatur sieht A die Nachricht per Konstruktion nicht und kann ihre
-- Struktur nicht prüfen. Würde derselbe RSA-Schlüssel je für einen
-- zweiten Zweck benutzt (Log-Signaturen, Update-Signaturen, Admin-
-- Tokens), könnte sich jeder Nutzer über den Blind-Kanal eine gültige
-- Signatur über frei gewählte Bytes ausstellen lassen.


-- =====================================================================
-- DOMÄNE B — Produkt (Cloud), EIGENER Cluster
-- =====================================================================

-- Spiegel der Issuer-Schlüssel. Fehlte im Entwurf v1 vollständig —
-- B musste Signaturen prüfen, konnte aber nicht ausdrücken, welcher
-- Schlüssel wann akzeptabel war. Damit waren Tickets faktisch
-- unbegrenzt gültig und ein kompromittierter Schlüssel nicht
-- selektiv widerrufbar.
CREATE TABLE issuer_key_mirror (
    key_id        smallint PRIMARY KEY,
    public_key    bytea NOT NULL,
    accept_from   timestamptz NOT NULL,
    accept_until  timestamptz NOT NULL,
    log_proof     bytea NOT NULL,
    min_issued    integer NOT NULL     -- k-Gate: erst einlösbar, wenn der
                                       -- Schlüssel genug Signaturen ausgab
);


CREATE TABLE account (
    account_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state            smallint NOT NULL CHECK (state IN (0,1,2)),  -- pending/active/archived

    -- ZÄHLBASIERT, nicht zeitbasiert. Der wichtigste einzelne Fix am
    -- Schema: Ein zeitbasiertes Fenster ist genau dann klein, wenn der
    -- Nutzer am exponiertesten ist — nachts, in der Launchphase, in
    -- einer Nische. Ein Bucket wechselt erst nach n Einlösungen, womit
    -- k-Anonymität eine Schema-Invariante wird statt einer Annahme
    -- über den Traffic.
    activation_batch integer NOT NULL,

    -- Commitment aus dem Ticket. Macht spätere Passkey-Manipulation
    -- gegen den Ursprungszustand prüfbar; ohne diesen Wert könnte ein
    -- Insider in B per UPDATE einen fremden Schlüssel eintragen und
    -- den Account übernehmen, ohne dass es je nachweisbar wäre.
    bootstrap_commit bytea NOT NULL CHECK (octet_length(bootstrap_commit) = 32)
);
CREATE INDEX ON account (activation_batch) WHERE state = 0;


-- Eine einzige Eindeutigkeitsdomäne für Handles. Im Entwurf v1
-- konkurrierten account.handle UNIQUE und handle_tombstone: ein
-- archivierter Account behielt seinen Handle und blockierte ihn
-- weiter, womit der Tombstone funktionslos war — und der Versuch,
-- den Handle wirklich freizugeben, scheiterte am Fremdschlüssel
-- der Passkeys.
CREATE TABLE handle_registry (
    -- NFKC-normalisiert plus Confusable-Skeleton nach Unicode TR39,
    -- ein einzelnes Skript pro Handle. citext faltet nur Groß- und
    -- Kleinschreibung: 'paypal' und 'pаypаl' mit kyrillischem а sind
    -- für citext zwei freie Handles. In einer App, deren ganzer Zweck
    -- verifizierte Identität ist, macht das teure eID-Onboarding die
    -- Impersonation sogar glaubwürdiger.
    handle_key      text PRIMARY KEY COLLATE "C",
    handle_display  text,
    account_id      uuid REFERENCES account,
    released_batch  integer,
    CHECK ((account_id IS NOT NULL) <> (released_batch IS NOT NULL))
);

-- Atomarer Claim ohne Race und ohne SERIALIZABLE:
--   INSERT INTO handle_registry (handle_key, handle_display, account_id)
--   VALUES ($1, $2, $3)
--   ON CONFLICT (handle_key) DO UPDATE
--     SET account_id = EXCLUDED.account_id, released_batch = NULL
--     WHERE handle_registry.account_id IS NULL
--       AND handle_registry.released_batch < $karenz
--   RETURNING handle_key;
-- Kein RETURNING-Ergebnis heißt "vergeben".


CREATE TABLE passkey (
    account_id     uuid NOT NULL REFERENCES account ON DELETE RESTRICT,
    credential_id  bytea NOT NULL,
    public_key     bytea NOT NULL,
    alg            integer NOT NULL,        -- COSE-Algorithmus; ohne ihn ist
                                            -- public_key nicht eindeutig deutbar
    aaguid         bytea,
    backup_eligible boolean,
    backup_state    boolean,
    PRIMARY KEY (account_id, credential_id),
    UNIQUE (credential_id)                  -- nur Kollisionsschutz,
                                            -- NIEMALS Upsert-Ziel
);
CREATE INDEX ON passkey (account_id);

-- credential_id war in v1 globaler Primärschlüssel — sie wird aber vom
-- Authenticator gewählt und ist nur pro Authenticator eindeutig. Ein
-- selbstgebauter Software-Authenticator kann sie frei wählen. Mit einem
-- naheliegenden ON CONFLICT (credential_id) DO UPDATE SET public_key
-- wäre das ein vollständiger Account-Takeover gewesen.
--
-- sign_count ist ersatzlos gestrichen: synchronisierte Passkeys melden
-- dauerhaft 0, die Klon-Erkennung läuft also ins Leere oder sperrt
-- legitime Nutzer aus. Gespeichert wäre sie zudem ein Login-Protokoll
-- im Heap gewesen — bei jedem Login ein UPDATE, also eine neue
-- Tupelversion mit frischer xmin. Genau das Log, das nicht existieren
-- soll, an einer Stelle, an der niemand es sucht.


-- Append-only Protokoll aller Passkey-Änderungen, jede mit einer
-- Assertion eines bereits gebundenen Schlüssels signiert.
CREATE TABLE passkey_change (
    seq               bigint PRIMARY KEY,
    account_id        uuid NOT NULL REFERENCES account,
    new_credential_id bytea NOT NULL,
    prev_hash         bytea NOT NULL,
    assertion         bytea NOT NULL
);
REVOKE UPDATE, DELETE ON passkey_change FROM PUBLIC;


-- Verbrauchte Tickets. Exakte Menge, kein approximativer Filter.
--
-- Die Entscheidung gegen Bloom/Cuckoo bleibt richtig, aber aus einem
-- stärkeren Grund als "die Tabelle ist ohnehin klein" (32-Byte-Hashes
-- kosten inkl. Overhead rund 1,3 GB bei 10 Mio Einträgen — irrelevant):
-- Ein Cuckoo-Filter kann bei Fingerprint-Kollisionen ein FREMDES
-- Element mitlöschen, womit ein verbrauchtes Ticket wieder gültig
-- würde — ein Sicherheits-, nicht nur ein Verfügbarkeitsproblem. Und
-- ein False Positive wäre hier unheilbar: das Opfer hat seinen
-- Ausweis-Slot verbraucht und bekommt keinen zweiten.
--
-- key_id macht die Menge partitionierbar und damit endlich; ohne sie
-- wüchse sie monoton für immer, und ihre Zeilenzahl gäbe exakt die
-- Anzahl je erzeugter Accounts preis.
CREATE TABLE spent_ticket (
    ticket_hash  bytea NOT NULL CHECK (octet_length(ticket_hash) = 32),
    key_id       smallint NOT NULL,
    PRIMARY KEY (key_id, ticket_hash)
) PARTITION BY LIST (key_id);

-- ticket_hash = SHA-256("btid-v1" || LE16(key_id) || I2OSP(msg, k))
-- über die ENTBLENDETE NACHRICHT, nicht über die Signaturbytes.
-- Grund: Die Verifikation läuft über OS2IP und toleriert führende
-- Nullbytes. Würde über die Signatur gehasht, wären sig und 0x00||sig
-- beide gültig, ergäben aber verschiedene Hashes — ein Ticket, zwei
-- Accounts, und die exakte Tabelle merkt nichts, weil sie zwei
-- verschiedene Schlüssel sieht. Ein führendes Nullbyte tritt zufällig
-- etwa in einem von 256 Fällen auf und ist durch wiederholte Versuche
-- gezielt erreichbar.

-- REIHENFOLGE DER PRÜFUNG (normativ, in EINER Transaktion):
--   1. Länge der Signatur == Modulusbytes, sonst sofort ablehnen
--   2. RSASSA-PSS gegen den für diese Epoche gültigen Schlüssel
--   3. entblendete msg committet H(passkey_pubkey), und der vorgelegte
--      WebAuthn-Schlüssel passt dazu — Besitznachweis über eine
--      FRISCHE, serverseitige Challenge (eine client-erzeugte Challenge
--      verletzt WebAuthn 13.4.3)
--   4. ERST DANN: INSERT INTO spent_ticket ... ON CONFLICT DO NOTHING,
--      als erste Schreiboperation, Rückgabewert prüfen
--   5. account, passkey und Handle-Claim in derselben Transaktion
--
-- Würde Schritt 4 vor Schritt 2 laufen, könnte jeder beliebige Werte
-- einfügen und fremde Tickets irreversibel verbrennen.
--
-- READ COMMITTED genügt: Der Unique-Index ist der Serialisierungspunkt.
-- SERIALIZABLE ist hier sogar schädlich, weil ON CONFLICT DO NOTHING
-- unter REPEATABLE READ und höher bei nebenläufigem Insert einen
-- Serialisierungsfehler 40001 wirft statt still nichts zu tun — und
-- ein 500er beim Einlösen ist potenziell ein verbranntes Ticket.


-- KEINE Tabelle redemption_pending mehr.
--
-- Sie war der schwerwiegendste Einzeldefekt des Entwurfs: (ticket_hash,
-- account_id) im Klartext in einer Zeile, also exakt die Relation, die
-- es laut Design nicht geben darf. Der TTL-DELETE half nichts — jedes
-- INSERT steht mit vollem Tupelinhalt im WAL, und ein DELETE schreibt
-- nur einen weiteren Record, ohne die früheren Segmente zu ändern.
-- Jedes Backup und jede Replica im TTL-Fenster konservierte das Paar
-- dauerhaft. Zudem war expires_at die einzige feine Zeitspalte im
-- ganzen Modell: expires_at minus TTL ergibt die Anlagezeit auf die
-- Mikrosekunde.
--
-- Ersatz ohne jede gespeicherte Verknüpfung: Das Ticket committet
-- bereits H(passkey_pubkey). Beim Retry authentisiert sich der Client
-- schlicht mit demselben Passkey; B findet den Account über
-- (credential_id) und antwortet idempotent. Das ist dauerhaft
-- idempotent statt TTL-begrenzt — und beseitigt damit zugleich den
-- Fall, in dem ein Nutzer nach einem Netzausfall dauerhaft ausgesperrt
-- war, weil die einzige Zuordnung gerade abgelaufen war.


-- =====================================================================
-- BETRIEBSREGELN — ohne sie ist das Schema wirkungslos
-- =====================================================================

-- 1. ORDNUNG ZERSTÖREN, NICHT VERSCHLEIERN
--
--    VACUUM FREEZE taugt dafür NICHT. Seit PostgreSQL 9.4 ersetzt das
--    Einfrieren das xmin nicht mehr, sondern setzt nur ein Flag-Bit —
--    der Originalwert bleibt ausdrücklich "for possible forensic use"
--    im Tupel stehen. SELECT xmin liefert dann 2 und suggeriert, die
--    Information sei weg, während pageinspect oder pg_filedump auf
--    derselben Datei den echten Wert zeigen.
--    CLUSTER, VACUUM FULL und pg_repack helfen ebenfalls nicht: sie
--    kopieren Tupel MIT Header.
--
--    Wirksam ist nur eine logische Kopie:
--      CREATE TABLE t_new AS SELECT * FROM t ORDER BY random();
--      -- Indizes und Constraints neu anlegen, dann Swap
--    Danach tragen alle Zeilen eine gemeinsame xmin.
--
--    Das Rewrite-Intervall ist die tatsächliche Zeitauflösung des
--    Systems und muss kürzer sein als jede Backup-Retention — sonst
--    hält ein älteres Backup die Originalordnung.
--    ACHTUNG: ORDER BY random() spillt bei großen Tabellen nach
--    pgsql_tmp; diese Dateien enthalten den Inhalt in der
--    URSPRÜNGLICHEN Reihenfolge und werden beim Löschen nur unlinkt.
--    work_mem hochsetzen oder temp_tablespaces auf verschlüsseltes
--    Volume legen.

-- 2. ZEIT AUS DEM PROTOKOLL NEHMEN, NICHT AUS DEM SCHEMA
--
--    Solange Ausstellung in A und Einlösung in B Sekunden auseinander
--    liegen, ist die i-te Zeile in A mit hoher Wahrscheinlichkeit die
--    i-te Zeile in B. Bei 30 Registrierungen pro Stunde ist diese
--    Rangkorrelation praktisch eindeutig — ganz ohne Zeitspalten.
--    Deshalb: Ticket trägt eine Epoche und ist FRÜHESTENS in der
--    übernächsten einlösbar, hart serverseitig geprüft. Aktivierung
--    nur in zählbasierten Batches.

-- 3. LOGGING
--
--    log_error_verbosity = terse. Sonst schreibt PostgreSQL bei jeder
--    Unique-Verletzung eine DETAIL-Zeile mit dem echten Wert ins Log:
--    "Key (ticket_hash)=(\x8f3a...) already exists" — also genau die
--    Werte, die im Schema sorgfältig geschützt werden, im Klartext in
--    einer ganz anderen Retention- und Backup-Domäne, oft in einem
--    zentralen SIEM. Und Unique-Verletzungen sind hier der
--    ERWARTETE Betriebsfall.
--    Konflikte gar nicht erst als Fehler auslösen: durchgängig
--    ON CONFLICT DO NOTHING mit Auswertung der Zeilenzahl.
--    track_commit_timestamp = off, per Startup-Check verifiziert —
--    sonst liefert pg_xact_commit_timestamp(xmin) die Wanduhrzeit.

-- 4. STATISTIKEN
--
--    ALTER TABLE identity_slot ALTER COLUMN pseudonym_ref SET STATISTICS 0;
--    -- analog für handle_key, ticket_hash, credential_id, public_key
--    ANALYZE legt in pg_statistic bis zu 100 ECHTE Spaltenwerte pro
--    Spalte ab. Die überleben das Löschen der Zeile und den
--    Tabellen-Rewrite bis zum nächsten ANALYZE. Für unique und
--    hochkardinale Spalten bringen Histogramme dem Planner ohnehin
--    nichts.

-- 5. CROSS-DOMAIN-ABGLEICH GEGEN STILLE BRÜCHE
--
--    A veröffentlicht periodisch (key_id, issued_count, seq, signature).
--    B hält COUNT(*) auf spent_ticket pro key_id.
--    Invariante: spent_count(key_id) <= issued_count(key_id), und
--    KEINER der beiden Zähler darf je fallen.
--    Grund: Ein Restore aus Backup bricht die Uniqueness still. Rollt A
--    zurück, bekommen betroffene Personen ein zweites Ticket; rollt B
--    zurück, sind verbrauchte Tickets wieder einlösbar. Ohne diesen
--    Abgleich erfährt es niemand. Nach einem Restore verweigert A die
--    Ausstellung, bis Tabellenzustand und Counter übereinstimmen
--    (fail-closed).

-- 6. REGISTRIERUNGS-REIHENFOLGE IN A
--
--    Der HSM-Aufruf kann nicht an einer DB-Transaktion teilnehmen.
--    Deshalb zwingend:
--      1. INSERT identity_slot, COMMIT   -- UNIQUE-Index serialisiert
--      2. INSERT blind_reservation, COMMIT
--      3. HSM-Signatur
--      4. INSERT issuance mit Attestation
--    Die frühere Reihenfolge (prüfen, dann signieren, dann schreiben)
--    erlaubte Ticket-Farming: 20 parallele Sessions mit derselben Karte
--    sehen unter READ COMMITTED alle keine Zeile, holen sich alle eine
--    Signatur, und 19 rollen zurück — die Signaturen bleiben gültig.
