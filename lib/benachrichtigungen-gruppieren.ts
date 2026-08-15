/**
 * Fasst gleichartige Benachrichtigungen zusammen.
 *
 * Bewusst ohne jeden Import: Diese Datei muss von `node --test` direkt
 * ladbar bleiben. Sobald hier `server-only` oder der Supabase-Client
 * hereinkommt, ist die Logik nicht mehr prüfbar — und sie ist die einzige
 * Stelle des Vorhabens, die sich ohne Datenbank und ohne fünf Konten
 * beweisen lässt.
 */

export type Typ = "like" | "kommentar" | "folgt";

export type RohBenachrichtigung = {
  id: string;
  typ: Typ;
  /** Wer es ausgelöst hat. */
  urheberId: string;
  /** Bei Likes und Kommentaren der Beitrag, bei „folgt" null. */
  beitragId: string | null;
  /** Nur bei Kommentaren. */
  kommentarId: string | null;
  createdAt: string;
};

export type Gruppe = {
  schluessel: string;
  typ: Typ;
  /** Ohne Wiederholung, neuester zuerst. */
  urheberIds: string[];
  /** Alle Ereignisse der Gruppe, auch wiederholte derselben Person. */
  anzahl: number;
  neuestesAm: string;
  beitragId: string | null;
  /** Der neueste Kommentar der Gruppe. */
  kommentarId: string | null;
  ungelesen: boolean;
};

/**
 * Der Kalendertag in Berliner Zeit, nicht in UTC.
 *
 * Ohne Zeitzone fiele die Tagesgrenze für deutsche Nutzer im Sommer auf
 * 02:00 Uhr — was abends um halb elf passiert, gehörte dann schon zum
 * nächsten Tag. „sv-SE" liefert das Datum als YYYY-MM-DD.
 */
function tag(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  });
}

/**
 * @param zeilen  Roh-Ereignisse in beliebiger Reihenfolge.
 * @param gelesenBis  Lesemarke als ISO-Zeitstempel.
 * @returns Gruppen, neueste zuerst.
 */
export function gruppieren(
  zeilen: RohBenachrichtigung[],
  gelesenBis: string,
): Gruppe[] {
  // Neueste zuerst, damit „der neueste Kommentar" und die Reihenfolge der
  // Urheber ohne zweiten Durchlauf feststehen.
  const sortiert = [...zeilen].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  const gruppen = new Map<string, Gruppe>();

  for (const zeile of sortiert) {
    // „folgt" hat kein Bezugsobjekt — alle eines Tages bilden eine Gruppe.
    const bezug = zeile.typ === "folgt" ? "" : (zeile.beitragId ?? "");
    const schluessel = `${zeile.typ}|${bezug}|${tag(zeile.createdAt)}`;

    const vorhanden = gruppen.get(schluessel);
    if (!vorhanden) {
      gruppen.set(schluessel, {
        schluessel,
        typ: zeile.typ,
        urheberIds: [zeile.urheberId],
        anzahl: 1,
        neuestesAm: zeile.createdAt,
        beitragId: zeile.beitragId,
        kommentarId: zeile.kommentarId,
        ungelesen: zeile.createdAt > gelesenBis,
      });
      continue;
    }

    vorhanden.anzahl += 1;
    if (!vorhanden.urheberIds.includes(zeile.urheberId)) {
      vorhanden.urheberIds.push(zeile.urheberId);
    }
  }

  return [...gruppen.values()].sort((a, b) =>
    b.neuestesAm.localeCompare(a.neuestesAm),
  );
}

/**
 * „anna, ben und 3 weitere" — höchstens zwei Namen, der Rest wird gezählt.
 * `namen` muss dieselbe Reihenfolge haben wie `urheberIds`.
 */
export function urheberSatz(namen: string[]): string {
  if (namen.length === 0) return "Jemand";
  if (namen.length === 1) return namen[0];
  if (namen.length === 2) return `${namen[0]} und ${namen[1]}`;
  return `${namen[0]}, ${namen[1]} und ${namen.length - 2} weitere`;
}
