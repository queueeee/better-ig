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

const zwischenspeicher = new Map<string, CryptoKey>();

/** Öffnet den Schlüssel einer Unterhaltung. */
export async function unterhaltungsschluessel(
  conversationId: string,
): Promise<CryptoKey | null> {
  const gemerkt = zwischenspeicher.get(conversationId);
  if (gemerkt) return gemerkt;
  if (!offen) return null;

  const supabase = createClient();
  const { data: row } = await supabase
    .from("conversation_keys")
    .select("ephemeral_public_key, iv, data")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (!row) return null;

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
    zwischenspeicher.set(conversationId, key);
    return key;
  } catch {
    return null;
  }
}

/**
 * Erzeugt einen Unterhaltungsschlüssel und legt ihn für jeden Teilnehmer
 * verschlüsselt ab.
 */
export async function unterhaltungsschluesselAnlegen(
  conversationId: string,
  teilnehmer: { userId: string; exchangePublicKey: string }[],
): Promise<void> {
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

    eintraege.push({
      conversation_id: conversationId,
      user_id: person.userId,
      ephemeral_public_key: await exportPublicKey(einmal.publicKey),
      iv: versiegelt.iv,
      data: versiegelt.data,
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
  const key = await unterhaltungsschluessel(conversationId);
  if (!key || !offen) return null;

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
  const key = await unterhaltungsschluessel(conversationId);
  if (!key) return null;

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
