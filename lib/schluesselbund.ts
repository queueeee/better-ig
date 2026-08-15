"use client";

import { createClient } from "@/lib/supabase/client";
import {
  deriveKeyFrom,
  deriveKeyFromPhrase,
  evaluatePrf,
  exportPublicKey,
  fromBase64,
  generateExchangeKeyPair,
  generateRecoveryPhrase,
  generateSigningKeyPair,
  importExchangePublicKey,
  importSigningPublicKey,
  open,
  seal,
  toBase64,
} from "@/lib/krypto";

/**
 * Verwaltet die Schlüssel des angemeldeten Nutzers im Browser.
 *
 * Die privaten Schlüssel bleiben im Speicher dieser Sitzung. Sie landen
 * bewusst nicht im localStorage: Was dort liegt, liest jedes Skript, das
 * es auf die Seite schafft.
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const PRF_SALT = ENC.encode("bilder|prf|v1");

export type Schluesselbund = {
  signing: CryptoKeyPair;
  exchange: CryptoKeyPair;
};

let offen: Schluesselbund | null = null;

export function istEntsperrt() {
  return offen !== null;
}

export function vergessen() {
  offen = null;
  // Ohne das blieben die geöffneten Unterhaltungsschlüssel im Speicher
  // liegen und liessen sich weiter benutzen — ein Sperren-Knopf, der
  // sichtbar sperrt, ohne zu sperren. Zugleich der Grund, warum der
  // Zwischenspeicher beim Entsperren geleert wird: Nach einem Kontowechsel
  // im selben Tab gehörten die Einträge sonst zur falschen Person.
  zwischenspeicher.clear();
}

/** Das Bündel als Bytes, um es verschlüsselt abzulegen. */
async function packen(bund: Schluesselbund): Promise<Uint8Array<ArrayBuffer>> {
  const inhalt = {
    signing: toBase64(await crypto.subtle.exportKey("pkcs8", bund.signing.privateKey)),
    exchange: toBase64(await crypto.subtle.exportKey("pkcs8", bund.exchange.privateKey)),
  };
  const bytes = ENC.encode(JSON.stringify(inhalt));
  return new Uint8Array(bytes.buffer.slice(0)) as Uint8Array<ArrayBuffer>;
}

async function entpacken(bytes: Uint8Array): Promise<Schluesselbund> {
  const inhalt = JSON.parse(DEC.decode(bytes)) as {
    signing: string;
    exchange: string;
  };

  const signingPrivate = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(inhalt.signing),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const exchangePrivate = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(inhalt.exchange),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );

  // Die öffentlichen Teile kommen aus dem Verzeichnis, sobald gebraucht.
  return {
    signing: { privateKey: signingPrivate, publicKey: signingPrivate },
    exchange: { privateKey: exchangePrivate, publicKey: exchangePrivate },
  };
}

/**
 * Legt erstmalig Schlüssel an. Gibt die Wiederherstellungsphrase zurück —
 * sie wird nirgends gespeichert und ist danach nicht wiederherstellbar.
 */
export async function einrichten(userId: string): Promise<{
  phrase: string;
  prfVerfuegbar: boolean;
}> {
  const supabase = createClient();
  const signing = await generateSigningKeyPair();
  const exchange = await generateExchangeKeyPair();

  const signingPub = await exportPublicKey(signing.publicKey);
  const exchangePub = await exportPublicKey(exchange.publicKey);

  // Der Austauschschlüssel wird mit dem Signaturschlüssel unterschrieben,
  // damit beide zusammengehören und sich nicht einzeln austauschen lassen.
  const signature = toBase64(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signing.privateKey,
      ENC.encode(exchangePub),
    ),
  );

  const { error: keyError } = await supabase.from("user_keys").insert({
    user_id: userId,
    signing_public_key: signingPub,
    exchange_public_key: exchangePub,
    exchange_key_signature: signature,
  });
  if (keyError) throw new Error("Die Schlüssel ließen sich nicht ablegen.");

  const bund: Schluesselbund = { signing, exchange };
  const roh = await packen(bund);

  // Immer per Phrase sichern — die PRF-Erweiterung ist kein verlässlicher
  // Weg, und ohne zweiten Weg wäre ein verlorener Passkey endgültig.
  const phrase = generateRecoveryPhrase();
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const phraseKey = await deriveKeyFromPhrase(phrase, salt as Uint8Array<ArrayBuffer>);
  const versiegelt = await seal(phraseKey, roh);

  await supabase.from("wrapped_keys").insert({
    user_id: userId,
    method: "phrase",
    salt: toBase64(salt),
    iv: versiegelt.iv,
    data: versiegelt.data,
  });

  const prfVerfuegbar = await zusaetzlichPerPasskeySichern(userId, roh);

  offen = bund;
  zwischenspeicher.clear();
  return { phrase, prfVerfuegbar };
}

/**
 * Legt zusätzlich eine Kopie ab, die der Passkey öffnet. Schlägt fehl,
 * wenn der Authenticator die PRF-Erweiterung nicht beherrscht — das ist
 * kein Fehler, sondern der übliche Fall bei manchen Geräten.
 */
export async function zusaetzlichPerPasskeySichern(
  userId: string,
  roh: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  const supabase = createClient();

  const { data: options, error } = await supabase.auth.passkey.startAuthentication();
  if (error || !options) return false;

  const { prf, credential } = await evaluatePrf(
    options as unknown as PublicKeyCredentialRequestOptions,
    PRF_SALT as Uint8Array<ArrayBuffer>,
  );
  if (!prf.ok || !credential) return false;

  const wrapKey = await deriveKeyFrom(prf.material, "wrap-identity");
  const versiegelt = await seal(wrapKey, roh);

  await supabase.from("wrapped_keys").insert({
    user_id: userId,
    method: "passkey",
    credential_id: credential.id,
    salt: toBase64(PRF_SALT),
    iv: versiegelt.iv,
    data: versiegelt.data,
  });

  return true;
}

/** Entsperrt mit dem Passkey. */
export async function entsperrenMitPasskey(): Promise<boolean> {
  const supabase = createClient();

  const { data: options, error } = await supabase.auth.passkey.startAuthentication();
  if (error || !options) return false;

  const { prf, credential } = await evaluatePrf(
    options as unknown as PublicKeyCredentialRequestOptions,
    PRF_SALT as Uint8Array<ArrayBuffer>,
  );
  if (!prf.ok || !credential) return false;

  const { data: row } = await supabase
    .from("wrapped_keys")
    .select("iv, data")
    .eq("method", "passkey")
    .eq("credential_id", credential.id)
    .maybeSingle();

  if (!row) return false;

  try {
    const wrapKey = await deriveKeyFrom(prf.material, "wrap-identity");
    const roh = await open(wrapKey, { iv: row.iv, data: row.data });
    offen = await entpacken(roh);
    zwischenspeicher.clear();
    return true;
  } catch {
    return false;
  }
}

/** Entsperrt mit der Wiederherstellungsphrase. */
export async function entsperrenMitPhrase(phrase: string): Promise<boolean> {
  const supabase = createClient();

  const { data: row } = await supabase
    .from("wrapped_keys")
    .select("salt, iv, data")
    .eq("method", "phrase")
    .maybeSingle();

  if (!row) return false;

  try {
    const key = await deriveKeyFromPhrase(phrase, fromBase64(row.salt));
    const roh = await open(key, { iv: row.iv, data: row.data });
    offen = await entpacken(roh);
    zwischenspeicher.clear();
    return true;
  } catch {
    return false;
  }
}

/** Hat der Nutzer überhaupt schon Schlüssel? */
export async function hatSchluessel(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_keys")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------
// Unterhaltungsschlüssel
// ---------------------------------------------------------------------

const zwischenspeicher = new Map<
  string,
  { key: CryptoKey; herkunft: Herkunft }
>();

/**
 * Wie gut ist belegt, woher der Schlüssel stammt?
 *
 * Die Sicherheitsgrenze ist NICHT die Unterschrift, sondern die Frage, ob
 * der Absender überhaupt zu dieser Unterhaltung gehört. Wer im dm_key
 * steht, ist ohnehin Mitleser — von ihm eine ungültige Unterschrift zu
 * bekommen bringt ihm nichts, was er nicht schon hätte.
 *
 * Deshalb führt eine nicht nachrechenbare Unterschrift zu „unpruefbar"
 * und nicht zur Ablehnung. Andernfalls zerstörte jede Schlüsselerneuerung
 * — die 0008:40-43 ausdrücklich vorsieht — die betroffenen Unterhaltungen
 * endgültig: conversation_keys kennt kein Update, der Primärschlüssel
 * verhindert eine zweite Zeile, und der Schreiben-Knopf legt keinen
 * zweiten Schlüssel an. Es gäbe keinen Weg zurück.
 */
export type Herkunft =
  /** Unterschrift geprüft, Absender gehört zur Unterhaltung. */
  | "belegt"
  /** Zeile von vor Migration 0013 — trägt gar keine Unterschrift. */
  | "altbestand"
  /** Unterschrift vorhanden, aber nicht nachrechenbar. */
  | "unpruefbar";

export type SchluesselErgebnis =
  /** Schlüssel liegt vor. `herkunft` sagt, wie gut das belegt ist. */
  | { status: "offen"; key: CryptoKey; herkunft: Herkunft }
  /** Für diese Unterhaltung wurde noch kein Schlüssel abgelegt. */
  | { status: "keiner" }
  /** Der Schlüsselbund ist gesperrt — erst entsperren. */
  | { status: "gesperrt" }
  /** Die Herkunft ist nachweislich falsch. Nicht benutzen. */
  | { status: "abgelehnt"; grund: string };

/**
 * Der zu unterschreibende Text einer Schlüsselzeile.
 *
 * Unterschrieben wird über alles, was die Zeile ausmacht: In welcher
 * Unterhaltung sie liegt, von wem sie kommt, FÜR WEN sie ist, und das
 * Chiffrat selbst. Ohne den Empfänger liesse sich eine gültig
 * unterschriebene Zeile auf einen anderen Empfänger umschreiben, ohne die
 * Unterhaltung in eine andere verschieben.
 */
function schluesselKlartext(e: {
  conversationId: string;
  senderId: string;
  empfaengerId: string;
  ephemeralPublicKey: string;
  iv: string;
  data: string;
}) {
  return [
    e.conversationId,
    e.senderId,
    e.empfaengerId,
    e.ephemeralPublicKey,
    e.iv,
    e.data,
  ].join("|");
}

/**
 * Wer darf in dieser Unterhaltung einen Schlüssel abgelegt haben?
 *
 * Bei einem Zweiergespräch stehen die beiden Beteiligten im dm_key, und
 * der ist unveränderlich: conversations kennt weder eine UPDATE- noch eine
 * DELETE-Regel. Die Teilnehmerliste taugt als Anker NICHT — in sie lässt
 * sich schreiben, und genau das wäre der Angriff.
 *
 * Für Gruppen gibt es keinen solchen Anker; dort bleibt nur die
 * Teilnehmerliste. Das ist schwächer und hier ausdrücklich vermerkt —
 * Gruppen haben noch keine Oberfläche, und wer eine baut, muss sich diese
 * Frage vorher stellen.
 */
async function berechtigteAbsender(
  conversationId: string,
): Promise<Set<string> | null> {
  const supabase = createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("is_group, dm_key")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) return null;

  // Für Gruppen gibt es keinen Anker. Auf die Teilnehmerliste
  // zurückzufallen wäre schlimmer als nichts: Sie liesse einen
  // untergeschobenen Schlüssel als „belegt" durchgehen und bescheinigte
  // damit genau das, was hier verhindert werden soll. Lieber ablehnen —
  // Gruppen lassen sich seit 0012 ohnehin nicht mehr anlegen, und wer
  // ihnen eine Oberfläche gibt, muss diese Frage vorher beantworten.
  if (conv.is_group) return null;

  const teile = String(conv.dm_key ?? "").split(":");
  return teile.length === 2 ? new Set(teile) : null;
}

/** Öffnet den Schlüssel einer Unterhaltung und prüft seine Herkunft. */
export async function unterhaltungsschluessel(
  conversationId: string,
): Promise<SchluesselErgebnis> {
  // Die Sperre zuerst, dann erst der Zwischenspeicher — umgekehrt lieferte
  // ein gesperrter Bund weiterhin Schlüssel aus, die vor dem Sperren
  // geöffnet wurden.
  if (!offen) return { status: "gesperrt" };

  const gemerkt = zwischenspeicher.get(conversationId);
  if (gemerkt) return { status: "offen", ...gemerkt };

  const supabase = createClient();
  const { data: row } = await supabase
    .from("conversation_keys")
    .select("user_id, sender_id, signature, ephemeral_public_key, iv, data")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (!row) return { status: "keiner" };

  // Erst die Herkunft klären, dann erst entschlüsseln. Ein Schlüssel
  // falscher Herkunft soll gar nicht erst in den Zwischenspeicher geraten.
  const absenderId = typeof row.sender_id === "string" ? row.sender_id : null;
  const unterschrift =
    typeof row.signature === "string" && row.signature.length > 0
      ? row.signature
      : null;

  // Auf null prüfen, nicht auf Wahrheitswerte: Eine leere Zeichenkette ist
  // nicht null, aber falsy, und diese Zeile liefe dann als Altbestand durch.
  let herkunft: Herkunft = "unpruefbar";

  if (absenderId === null && unterschrift === null) {
    // Beides fehlt: Zeile von vor 0013.
    herkunft = "altbestand";
  } else if (absenderId !== null && unterschrift === null) {
    // Absender ohne Unterschrift. Die Bedingung conversation_keys_herkunft
    // lässt das nicht zu — hier wurde also gedreht.
    return {
      status: "abgelehnt",
      grund: "Der Schlüssel nennt einen Absender, trägt aber keine Unterschrift.",
    };
  } else if (absenderId === null && unterschrift !== null) {
    // Unterschrift ohne Absender: der Zustand nach einer Kontolöschung.
    // Die Unterschrift bleibt, nur nachrechnen kann sie niemand mehr.
    herkunft = "unpruefbar";
  } else if (absenderId && unterschrift) {
    // Das ist die Sicherheitsgrenze, und zwar die einzige harte: Wer nicht
    // zur Unterhaltung gehört, hat hier gar nichts abzulegen.
    const erlaubt = await berechtigteAbsender(conversationId);
    if (!erlaubt || !erlaubt.has(absenderId)) {
      return {
        status: "abgelehnt",
        grund:
          "Der Schlüssel wurde von jemandem abgelegt, der nicht zu dieser Unterhaltung gehört.",
      };
    }

    const { data: absender } = await supabase
      .from("user_keys")
      .select("signing_public_key")
      .eq("user_id", absenderId)
      .maybeSingle();

    if (!absender) {
      // Der Absender hat seine Schlüssel gelöscht (0008:44-47 erlaubt das
      // ausdrücklich). Kein Angriff, aber auch kein Beleg.
      herkunft = "unpruefbar";
    } else {
      let stimmt = false;
      try {
        const pub = await importSigningPublicKey(
          absender.signing_public_key as string,
        );
        stimmt = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          pub,
          fromBase64(unterschrift),
          ENC.encode(
            schluesselKlartext({
              conversationId,
              senderId: absenderId,
              empfaengerId: row.user_id as string,
              ephemeralPublicKey: row.ephemeral_public_key as string,
              iv: row.iv as string,
              data: row.data as string,
            }),
          ),
        );
      } catch {
        stimmt = false;
      }

      // Stimmt sie nicht, hat der Absender seit dem Ablegen neue Schlüssel
      // eingerichtet — oder jemand hat an der Zeile gedreht. Beides ist
      // hier NICHT der Grund abzulehnen: Der Absender gehört zur
      // Unterhaltung, er liest ohnehin mit. Abzulehnen kostete dagegen die
      // ganze Unterhaltung, unwiderruflich.
      herkunft = stimmt ? "belegt" : "unpruefbar";
    }
  }

  try {
    const ephemeral = await importExchangePublicKey(row.ephemeral_public_key);
    const gemeinsam = await crypto.subtle.deriveKey(
      { name: "ECDH", public: ephemeral },
      offen.exchange.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const roh = await open(gemeinsam, { iv: row.iv, data: row.data });
    const key = await crypto.subtle.importKey(
      "raw",
      roh,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    zwischenspeicher.set(conversationId, { key, herkunft });
    return { status: "offen", key, herkunft };
  } catch {
    // Der Schlüssel ist da, lässt sich aber nicht öffnen — er ist nicht
    // für diesen Empfänger verschlüsselt. „keiner" wäre hier falsch: Der
    // Schreiben-Knopf legte daraufhin einen neuen an und liefe in den
    // Primärschlüssel.
    return {
      status: "abgelehnt",
      grund: "Der Schlüssel dieser Unterhaltung lässt sich nicht öffnen.",
    };
  }
}

/**
 * Erzeugt einen Unterhaltungsschlüssel und legt ihn für jeden Teilnehmer
 * verschlüsselt und unterschrieben ab.
 */
export async function unterhaltungsschluesselAnlegen(
  conversationId: string,
  absenderId: string,
  teilnehmer: { userId: string; exchangePublicKey: string }[],
): Promise<void> {
  if (!offen) {
    throw new Error("Der Schlüsselbund ist gesperrt.");
  }

  const supabase = createClient();
  const roh = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));

  const eintraege = [];
  for (const person of teilnehmer) {
    // Ein frisches Einmal-Schlüsselpaar je Empfänger.
    const einmal = await generateExchangeKeyPair();
    const empfaenger = await importExchangePublicKey(person.exchangePublicKey);

    const gemeinsam = await crypto.subtle.deriveKey(
      { name: "ECDH", public: empfaenger },
      einmal.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const versiegelt = await seal(gemeinsam, roh as Uint8Array<ArrayBuffer>);
    const ephemeralPublicKey = await exportPublicKey(einmal.publicKey);

    const signature = toBase64(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        offen.signing.privateKey,
        ENC.encode(
          schluesselKlartext({
            conversationId,
            senderId: absenderId,
            empfaengerId: person.userId,
            ephemeralPublicKey,
            iv: versiegelt.iv,
            data: versiegelt.data,
          }),
        ),
      ),
    );

    eintraege.push({
      conversation_id: conversationId,
      user_id: person.userId,
      sender_id: absenderId,
      ephemeral_public_key: ephemeralPublicKey,
      iv: versiegelt.iv,
      data: versiegelt.data,
      signature,
    });
  }

  const { error } = await supabase.from("conversation_keys").insert(eintraege);
  if (error) throw new Error("Der Unterhaltungsschlüssel ließ sich nicht ablegen.");
}

// ---------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------

export async function nachrichtVerschluesseln(
  conversationId: string,
  text: string,
): Promise<{ iv: string; data: string; signature: string } | null> {
  const ergebnis = await unterhaltungsschluessel(conversationId);
  if (ergebnis.status !== "offen" || !offen) return null;
  const key = ergebnis.key;

  const bytes = ENC.encode(text);
  const versiegelt = await seal(
    key,
    new Uint8Array(bytes.buffer.slice(0)) as Uint8Array<ArrayBuffer>,
  );

  // Unterschrieben wird über Unterhaltung und Chiffrat zusammen, damit
  // eine Nachricht nicht in eine andere Unterhaltung verschoben werden kann.
  const signature = toBase64(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      offen.signing.privateKey,
      ENC.encode(`${conversationId}|${versiegelt.iv}|${versiegelt.data}`),
    ),
  );

  return { ...versiegelt, signature };
}

export type EntschluesselteNachricht = {
  text: string;
  echt: boolean;
};

export async function nachrichtEntschluesseln(
  conversationId: string,
  nachricht: { iv: string; data: string; signature: string },
  absenderSigningKey: string | null,
): Promise<EntschluesselteNachricht | null> {
  const ergebnis = await unterhaltungsschluessel(conversationId);
  if (ergebnis.status !== "offen") return null;
  const key = ergebnis.key;

  let text: string;
  try {
    const roh = await open(key, { iv: nachricht.iv, data: nachricht.data });
    text = DEC.decode(roh);
  } catch {
    return null;
  }

  // Ohne gültige Unterschrift wird die Nachricht angezeigt, aber als
  // nicht überprüfbar markiert — stilles Verwerfen würde einen Angriff
  // verbergen statt ihn sichtbar zu machen.
  let echt = false;
  if (absenderSigningKey) {
    try {
      const pub = await importSigningPublicKey(absenderSigningKey);
      echt = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pub,
        fromBase64(nachricht.signature),
        ENC.encode(`${conversationId}|${nachricht.iv}|${nachricht.data}`),
      );
    } catch {
      echt = false;
    }
  }

  return { text, echt };
}
