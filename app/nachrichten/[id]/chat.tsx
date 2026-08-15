"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { relativeTime } from "@/lib/post";
import {
  istEntsperrt,
  nachrichtEntschluesseln,
  nachrichtVerschluesseln,
  unterhaltungsschluessel,
} from "@/lib/schluesselbund";
import type { RohNachricht, Teilnehmer } from "@/lib/nachrichten";

type Props = {
  conversationId: string;
  userId: string;
  teilnehmer: Teilnehmer[];
  anfang: RohNachricht[];
};

type Anzeige = {
  id: string;
  senderId: string;
  createdAt: string;
  text: string | null;
  echt: boolean;
};

export function Chat({ conversationId, userId, teilnehmer, anfang }: Props) {
  const [nachrichten, setNachrichten] = useState<Anzeige[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [schluessel, setSchluessel] = useState<
    { art: "warnung" | "fehler"; text: string } | null
  >(null);
  const ende = useRef<HTMLDivElement>(null);

  const schluesselVon = useCallback(
    (senderId: string) =>
      teilnehmer.find((t) => t.userId === senderId)?.signingPublicKey ?? null,
    [teilnehmer],
  );

  const nameVon = useCallback(
    (senderId: string) => {
      if (senderId === userId) return "Du";
      const person = teilnehmer.find((t) => t.userId === senderId);
      return person?.displayName ?? `@${person?.handle ?? "unbekannt"}`;
    },
    [teilnehmer, userId],
  );

  const entschluesseln = useCallback(
    async (roh: RohNachricht): Promise<Anzeige> => {
      const ergebnis = await nachrichtEntschluesseln(
        conversationId,
        roh,
        schluesselVon(roh.senderId),
      );
      return {
        id: roh.id,
        senderId: roh.senderId,
        createdAt: roh.createdAt,
        text: ergebnis?.text ?? null,
        echt: ergebnis?.echt ?? false,
      };
    },
    [conversationId, schluesselVon],
  );

  // Woher stammt der Schlüssel dieser Unterhaltung?
  //
  // Das gehört sichtbar an den Anfang des Gesprächs und nicht in die
  // Konsole: Ein untergeschobener Schlüssel sieht im Betrieb aus wie ein
  // richtiger — beide Seiten schreiben munter weiter, nur eben für
  // jemand anderen mit. Wenn die App das merkt, muss sie es sagen.
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const ergebnis = await unterhaltungsschluessel(conversationId);
      if (abgebrochen) return;

      if (ergebnis.status === "abgelehnt") {
        setSchluessel({ art: "fehler", text: ergebnis.grund });
      } else if (ergebnis.status === "offen" && !ergebnis.geprueft) {
        setSchluessel({
          art: "warnung",
          text:
            "Der Schlüssel dieser Unterhaltung trägt keine überprüfbare " +
            "Unterschrift. Er stammt aus der Zeit, bevor die App eine " +
            "verlangt hat. Lesbar bleibt alles — belegt ist seine Herkunft " +
            "aber nicht.",
        });
      } else {
        setSchluessel(null);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [conversationId]);

  // Vorhandene Nachrichten öffnen.
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const offen = await Promise.all(anfang.map(entschluesseln));
      if (!abgebrochen) setNachrichten(offen);
    })();
    return () => {
      abgebrochen = true;
    };
  }, [anfang, entschluesseln]);

  // Neue Nachrichten in Echtzeit.
  useEffect(() => {
    const supabase = createClient();
    const kanal = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            sender_id: string;
            iv: string;
            data: string;
            signature: string;
            created_at: string;
          };
          const offen = await entschluesseln({
            id: row.id,
            senderId: row.sender_id,
            iv: row.iv,
            data: row.data,
            signature: row.signature,
            createdAt: row.created_at,
          });
          setNachrichten((bisher) =>
            bisher.some((n) => n.id === offen.id) ? bisher : [...bisher, offen],
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [conversationId, entschluesseln]);

  useEffect(() => {
    ende.current?.scrollIntoView({ behavior: "smooth" });
  }, [nachrichten.length]);

  async function senden(event: React.FormEvent) {
    event.preventDefault();
    const text = eingabe.trim();
    if (!text) return;

    setSendet(true);
    setFehler(null);
    try {
      const verschluesselt = await nachrichtVerschluesseln(conversationId, text);
      if (!verschluesselt) {
        setFehler("Der Schlüssel ist gesperrt. Lad die Seite neu.");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        iv: verschluesselt.iv,
        data: verschluesselt.data,
        signature: verschluesselt.signature,
      });
      if (error) throw error;
      setEingabe("");
    } catch {
      setFehler("Die Nachricht ging nicht raus.");
    } finally {
      setSendet(false);
    }
  }

  if (!istEntsperrt()) {
    return (
      <p className="mt-10 text-[0.95rem] leading-relaxed text-muted">
        Die Schlüssel sind gesperrt. Geh zurück zur Übersicht und entsperre
        sie, dann werden die Nachrichten lesbar.
      </p>
    );
  }

  return (
    <>
      {schluessel ? (
        <p
          role={schluessel.art === "fehler" ? "alert" : undefined}
          className={
            schluessel.art === "fehler"
              ? "mt-6 border-l-2 border-danger pl-3 text-[0.85rem] leading-relaxed text-danger"
              : "mt-6 border-l-2 border-line pl-3 text-[0.85rem] leading-relaxed text-muted"
          }
        >
          {schluessel.text}
        </p>
      ) : null}

      <div className="mt-6 flex-1 space-y-4">
        {nachrichten.length === 0 ? (
          <p className="py-10 text-center text-[0.9rem] text-muted">
            Noch nichts geschrieben.
          </p>
        ) : (
          nachrichten.map((nachricht) => {
            const eigene = nachricht.senderId === userId;
            return (
              <div
                key={nachricht.id}
                className={eigene ? "flex justify-end" : "flex justify-start"}
              >
                <div className="max-w-[75%]">
                  <div
                    className={
                      eigene
                        ? "rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-paper"
                        : "rounded-2xl rounded-bl-sm border border-line px-4 py-2.5"
                    }
                  >
                    {nachricht.text === null ? (
                      <span className="text-[0.9rem] italic opacity-70">
                        Nicht lesbar — für dich nicht verschlüsselt
                      </span>
                    ) : (
                      <span className="text-[0.95rem] leading-relaxed whitespace-pre-line">
                        {nachricht.text}
                      </span>
                    )}
                  </div>
                  <p
                    className={
                      eigene
                        ? "mt-1 text-right text-[0.7rem] text-muted"
                        : "mt-1 text-[0.7rem] text-muted"
                    }
                  >
                    {!eigene ? `${nameVon(nachricht.senderId)} · ` : null}
                    {relativeTime(nachricht.createdAt)}
                    {nachricht.text !== null && !nachricht.echt ? (
                      <span className="text-danger">
                        {" "}
                        · Unterschrift nicht prüfbar
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={ende} />
      </div>

      {fehler ? (
        <p
          role="alert"
          className="mt-4 border-l-2 border-danger pl-3 text-[0.9rem] text-danger"
        >
          {fehler}
        </p>
      ) : null}

      <form onSubmit={senden} className="mt-6 flex gap-3">
        <label htmlFor="nachricht" className="sr-only">
          Nachricht
        </label>
        <input
          id="nachricht"
          value={eingabe}
          onChange={(event) => setEingabe(event.target.value)}
          placeholder="Nachricht"
          className="w-full rounded-lg border border-line bg-transparent px-4 py-3 text-[0.95rem] outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={sendet || eingabe.trim().length === 0}
          className="shrink-0 rounded-lg bg-accent px-5 py-3 text-[0.9rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          Senden
        </button>
      </form>
    </>
  );
}
