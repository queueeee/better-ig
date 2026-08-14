/**
 * Kryptografische Grundlage für verschlüsselte Nachrichten.
 *
 * Ausschliesslich WebCrypto, keine Abhängigkeiten. P-256 statt der
 * hübscheren Kurve 25519, weil ECDSA und ECDH mit P-256 in jedem Browser
 * verfügbar sind — Ed25519 ist es 2026 noch nicht überall.
 *
 * WAS DAS SCHÜTZT und was nicht:
 * Verschlüsselt wird im Browser, der Server sieht nur Chiffrat. Das
 * schützt gegen ein Datenleck, gegen Beschlagnahme der Datenbank und
 * gegen jeden, der die Tabellen liest.
 *
 * Es schützt NICHT gegen den Betreiber selbst: Er liefert diesen Code
 * aus und könnte jederzeit eine Fassung ausspielen, die den Schlüssel
 * mitschickt. Das ist keine Nachlässigkeit, sondern die Natur einer
 * Web-Anwendung — deshalb ist Signal eine native App mit
 * nachvollziehbaren Builds. Wer das nicht akzeptieren kann, darf dieser
 * App keine Geheimnisse anvertrauen.
 */

const ENC = new TextEncoder();

/**
 * WebCrypto verlangt Puffer, die nachweislich nicht geteilt sind. Seit
 * TypeScript 5.7 unterscheidet der Typ das, weshalb hier durchgehend die
 * enge Form steht statt des blossen Uint8Array.
 */
type Bytes = Uint8Array<ArrayBuffer>;

// ---------------------------------------------------------------------
// Kodierung
// ---------------------------------------------------------------------

export function toBase64(bytes: ArrayBuffer | Uint8Array<ArrayBufferLike>): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------
// Schlüsselpaare
// ---------------------------------------------------------------------

/** Zum Signieren — beweist, wer eine Nachricht geschrieben hat. */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
}

/** Zum Schlüsselaustausch — damit lassen sich Gruppenschlüssel zustellen. */
export async function generateExchangeKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(await crypto.subtle.exportKey("spki", key));
}

export async function importSigningPublicKey(spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    fromBase64(spki),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
}

export async function importExchangePublicKey(spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    fromBase64(spki),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

// ---------------------------------------------------------------------
// Symmetrische Verschlüsselung
// ---------------------------------------------------------------------

export type Sealed = { iv: string; data: string };

/**
 * Der Zähler ist bewusst kein Zähler: Ein wiederverwendeter
 * Initialisierungsvektor bricht AES-GCM vollständig, und ein Zähler
 * überlebt weder mehrere Geräte noch einen zurückgesetzten Zustand.
 */
export async function seal(key: CryptoKey, plain: Bytes): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: toBase64(iv), data: toBase64(data) };
}

export async function open(key: CryptoKey, sealed: Sealed): Promise<Bytes> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    key,
    fromBase64(sealed.data),
  );
  return new Uint8Array(plain) as Bytes;
}

export async function generateContentKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// ---------------------------------------------------------------------
// Ableitung
// ---------------------------------------------------------------------

/**
 * Rohes Schlüsselmaterial wird nie direkt verwendet, sondern immer durch
 * HKDF mit einem Verwendungszweck geschickt. Sonst ergäbe derselbe
 * Ursprung an zwei Stellen denselben Schlüssel, und ein Fehler an einer
 * Stelle würde die andere mitreissen.
 */
export async function deriveKeyFrom(
  material: Bytes,
  zweck: string,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", material, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(new ArrayBuffer(32)),
      info: ENC.encode(`bilder|v1|${zweck}`),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Aus der Wiederherstellungsphrase, absichtlich langsam. */
export async function deriveKeyFromPhrase(
  phrase: string,
  salt: Bytes,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    ENC.encode(phrase.trim().toUpperCase().replace(/\s+/g, "")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------------
// Wiederherstellungsphrase
// ---------------------------------------------------------------------

/** Ohne I, O, 0 und 1 — die verwechselt man beim Abschreiben. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Sechs Fünfergruppen, rund 150 Bit. */
export function generateRecoveryPhrase(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(30)));
  const zeichen = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]);
  const gruppen: string[] = [];
  for (let i = 0; i < zeichen.length; i += 5) {
    gruppen.push(zeichen.slice(i, i + 5).join(""));
  }
  return gruppen.join("-");
}

// ---------------------------------------------------------------------
// Passkey als Schlüsselquelle
// ---------------------------------------------------------------------

/**
 * Ob der Authenticator die PRF-Erweiterung beherrscht, lässt sich nicht
 * vorhersagen — es hängt an Browser, Betriebssystem und Passwortmanager
 * zugleich. Deshalb wird es zur Laufzeit ermittelt und nie angenommen.
 *
 * Wichtig: Das Ergebnis hängt am einzelnen Passkey, nicht am Konto. Ein
 * zweiter Passkey liefert ein anderes Geheimnis. Deshalb wird der
 * Hauptschlüssel pro Passkey einzeln verpackt abgelegt, statt zu hoffen,
 * dass ein Passkey überall dasselbe ergibt.
 */
export type PrfResult =
  | { ok: true; material: Bytes }
  | { ok: false; grund: "nicht-unterstuetzt" | "abgebrochen" | "fehler" };

export async function evaluatePrf(
  options: PublicKeyCredentialRequestOptions,
  salt: Bytes,
): Promise<{ prf: PrfResult; credential: PublicKeyCredential | null }> {
  try {
    const credential = (await navigator.credentials.get({
      publicKey: {
        ...options,
        extensions: { ...options.extensions, prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { prf: { ok: false, grund: "abgebrochen" }, credential: null };
    }

    const results = credential.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    };
    const first = results.prf?.results?.first;

    if (!first) {
      // Leeres prf-Objekt heisst: Der Authenticator kann es nicht.
      return { prf: { ok: false, grund: "nicht-unterstuetzt" }, credential };
    }

    return { prf: { ok: true, material: new Uint8Array(first) }, credential };
  } catch (error) {
    const name =
      typeof error === "object" && error !== null && "name" in error
        ? String((error as { name: unknown }).name)
        : "";
    return {
      prf: {
        ok: false,
        grund:
          name === "NotAllowedError" || name === "AbortError"
            ? "abgebrochen"
            : "fehler",
      },
      credential: null,
    };
  }
}

// ---------------------------------------------------------------------
// Sicherheitsnummer
// ---------------------------------------------------------------------

/**
 * Zwei Personen vergleichen diese Zahl über einen anderen Kanal. Stimmt
 * sie überein, hat niemand einen falschen Schlüssel untergeschoben.
 *
 * Ohne diesen Abgleich bleibt die Verschlüsselung eine Vertrauensfrage an
 * den Server: Er verwaltet das Schlüsselverzeichnis und könnte einen
 * eigenen Schlüssel ausliefern, ohne dass es jemandem auffällt.
 */
export async function safetyNumber(
  publicKeyA: string,
  publicKeyB: string,
): Promise<string> {
  const [erst, zweit] = [publicKeyA, publicKeyB].sort();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ENC.encode(`bilder|safety|${erst}|${zweit}`),
  );
  const bytes = new Uint8Array(digest).slice(0, 15);

  const ziffern = [...bytes].map((byte) =>
    String(byte % 100).padStart(2, "0"),
  );
  const gruppen: string[] = [];
  for (let i = 0; i < ziffern.length; i += 5) {
    gruppen.push(ziffern.slice(i, i + 5).join(""));
  }
  return gruppen.join(" ");
}
