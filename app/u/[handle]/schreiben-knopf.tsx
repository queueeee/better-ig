"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  istEntsperrt,
  unterhaltungsschluessel,
  unterhaltungsschluesselAnlegen,
} from "@/lib/schluesselbund";

type Props = {
  targetId: string;
  /** Ohne öffentlichen Schlüssel des Gegenübers geht nichts. */
  targetHasKeys: boolean;
};

export function SchreibenKnopf({ targetId, targetHasKeys }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function schreiben() {
    setFehler(null);

    if (!istEntsperrt()) {
      // Ohne eigene Schlüssel liesse sich die Unterhaltung zwar anlegen,
      // aber ihr Schlüssel nicht — deshalb vorher dorthin schicken.
      router.push("/nachrichten");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();

      const { data: conversationId, error } = await supabase.rpc(
        "get_or_create_dm",
        { other_user: targetId },
      );
      if (error || !conversationId) throw error ?? new Error("kein Ergebnis");

      const meineId = (await supabase.auth.getClaims()).data?.claims?.sub;
      if (!meineId) throw new Error("nicht angemeldet");

      // Existiert schon ein Schlüssel, war die Unterhaltung nicht neu.
      const vorhanden = await unterhaltungsschluessel(conversationId as string);

      // Ein Schlüssel falscher Herkunft wird nicht stillschweigend durch
      // einen neuen ersetzt. Das ginge ohnehin nicht — conversation_keys
      // kennt kein Update — und würde vor allem den Angriff verbergen,
      // statt ihn zu zeigen.
      if (vorhanden.status === "abgelehnt") {
        setFehler(vorhanden.grund);
        setBusy(false);
        return;
      }

      if (vorhanden.status === "keiner") {
        const { data: keys } = await supabase
          .from("user_keys")
          .select("user_id, exchange_public_key")
          .in("user_id", [targetId, meineId]);

        const teilnehmer = (keys ?? []).map((row) => ({
          userId: row.user_id as string,
          exchangePublicKey: row.exchange_public_key as string,
        }));

        if (teilnehmer.length < 2) {
          setFehler("Die Gegenseite hat noch keine Schlüssel eingerichtet.");
          setBusy(false);
          return;
        }

        await unterhaltungsschluesselAnlegen(
          conversationId as string,
          meineId,
          teilnehmer,
        );
      }

      router.push(`/nachrichten/${conversationId}`);
    } catch {
      setFehler("Die Unterhaltung ließ sich nicht öffnen.");
      setBusy(false);
    }
  }

  if (!targetHasKeys) {
    return (
      <p className="text-[0.8rem] leading-relaxed text-muted">
        Kann noch keine Nachrichten empfangen
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={schreiben}
        disabled={busy}
        className="rounded-lg border border-line px-5 py-2.5 text-[0.9rem] font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy ? "Moment …" : "Nachricht"}
      </button>
      {fehler ? (
        <p role="alert" className="mt-2 text-[0.8rem] text-danger">
          {fehler}
        </p>
      ) : null}
    </div>
  );
}
