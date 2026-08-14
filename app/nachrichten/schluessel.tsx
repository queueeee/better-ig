"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  einrichten,
  entsperrenMitPasskey,
  entsperrenMitPhrase,
} from "@/lib/schluesselbund";

type Props = {
  userId: string;
  /** Gibt es schon Schlüssel, oder müssen erst welche entstehen? */
  vorhanden: boolean;
};

/**
 * Erste Einrichtung und Entsperren. Ohne entsperrte Schlüssel lässt sich
 * keine Nachricht lesen — auch nicht die eigene, denn der Server hat
 * keine Kopie im Klartext.
 */
export function Schluesselverwaltung({ userId, vorhanden }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [prfOk, setPrfOk] = useState(false);
  const [notiert, setNotiert] = useState(false);
  const [eingabe, setEingabe] = useState("");

  async function anlegen() {
    setBusy(true);
    setFehler(null);
    try {
      const ergebnis = await einrichten(userId);
      setPhrase(ergebnis.phrase);
      setPrfOk(ergebnis.prfVerfuegbar);
    } catch {
      setFehler("Die Schlüssel ließen sich nicht anlegen.");
    } finally {
      setBusy(false);
    }
  }

  async function perPasskey() {
    setBusy(true);
    setFehler(null);
    const ok = await entsperrenMitPasskey();
    if (ok) {
      router.refresh();
    } else {
      setFehler(
        "Das hat nicht geklappt. Entweder unterstützt dieser Passkey keine Schlüsselableitung, oder er gehört nicht zu diesem Gerät — nimm die Wiederherstellungsphrase.",
      );
      setBusy(false);
    }
  }

  async function perPhrase(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFehler(null);
    const ok = await entsperrenMitPhrase(eingabe);
    if (ok) {
      router.refresh();
    } else {
      setFehler("Diese Phrase passt nicht.");
      setBusy(false);
    }
  }

  // Frisch angelegt: Phrase zeigen, bis sie bestätigt ist.
  if (phrase) {
    return (
      <div className="mt-10">
        <h1 className="font-display text-[1.8rem] leading-tight font-semibold tracking-tight">
          Schreib das auf
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
          Diese Phrase ist der einzige Weg zurück zu deinen Nachrichten, wenn
          du deine Passkeys verlierst. Wir haben keine Kopie — sie steht
          nirgends auf dem Server und lässt sich nicht neu erzeugen.
        </p>

        <p className="mt-6 rounded-xl border border-accent bg-accent/5 p-5 text-center font-mono text-[1.1rem] leading-relaxed tracking-wide break-all">
          {phrase}
        </p>

        <p className="mt-4 text-[0.85rem] leading-relaxed text-muted">
          {prfOk
            ? "Zusätzlich öffnet dein Passkey die Nachrichten auf diesem Gerät."
            : "Dein Passkey kann hier keine Schlüssel ableiten — die Phrase ist damit dein einziger Weg. Bewahr sie entsprechend auf."}
        </p>

        <label className="mt-8 flex items-start gap-3 text-[0.9rem] leading-relaxed">
          <input
            type="checkbox"
            checked={notiert}
            onChange={(event) => setNotiert(event.target.checked)}
            className="mt-1"
          />
          <span>
            Ich habe die Phrase an einem sicheren Ort notiert und weiß, dass
            meine Nachrichten ohne sie verloren sind.
          </span>
        </label>

        <button
          type="button"
          disabled={!notiert}
          onClick={() => router.refresh()}
          className="mt-6 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          Weiter
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <h1 className="font-display text-[1.8rem] leading-tight font-semibold tracking-tight">
        {vorhanden ? "Nachrichten entsperren" : "Nachrichten einrichten"}
      </h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
        {vorhanden
          ? "Deine Nachrichten sind verschlüsselt. Zum Lesen braucht es deinen Schlüssel."
          : "Nachrichten werden auf deinem Gerät verschlüsselt. Dafür legen wir einmalig Schlüssel an."}
      </p>

      {fehler ? (
        <p
          role="alert"
          className="mt-6 border-l-2 border-danger pl-3 text-[0.9rem] leading-relaxed text-danger"
        >
          {fehler}
        </p>
      ) : null}

      {vorhanden ? (
        <>
          <button
            type="button"
            onClick={perPasskey}
            disabled={busy}
            className="mt-8 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Moment …" : "Mit Passkey entsperren"}
          </button>

          <form onSubmit={perPhrase} className="mt-8">
            <label
              htmlFor="phrase"
              className="block text-[0.8rem] font-medium uppercase tracking-wider text-muted"
            >
              Oder Wiederherstellungsphrase
            </label>
            <input
              id="phrase"
              value={eingabe}
              onChange={(event) => setEingabe(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCDE-FGHJK-…"
              className="mt-2 w-full rounded-lg border border-line bg-transparent px-4 py-3 font-mono text-[0.95rem] outline-none transition-colors placeholder:text-muted/50 focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy || eingabe.trim().length < 10}
              className="mt-3 w-full rounded-lg border border-line px-5 py-3 text-[0.9rem] transition-colors hover:border-accent disabled:opacity-50"
            >
              Mit Phrase entsperren
            </button>
          </form>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={anlegen}
            disabled={busy}
            className="mt-8 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Wird angelegt …" : "Schlüssel anlegen"}
          </button>
          <p className="mt-4 text-[0.8rem] leading-relaxed text-muted">
            Danach bekommst du eine Wiederherstellungsphrase zum Aufschreiben.
          </p>
        </>
      )}
    </div>
  );
}
