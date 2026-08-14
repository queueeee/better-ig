"use client";

import { useCallback, useEffect, useState } from "react";
import type { PasskeyListItem } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function Passkeys() {
  const [items, setItems] = useState<PasskeyListItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.passkey.list();
    if (error) {
      setError("Die Passkeys konnten nicht geladen werden.");
      setItems([]);
      return;
    }
    setItems(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPasskey() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      await load();
    } catch (err) {
      const name =
        typeof err === "object" && err !== null && "name" in err
          ? String((err as { name: unknown }).name)
          : "";
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";

      if (name === "NotAllowedError" || name === "AbortError") {
        setError("Abgebrochen.");
      } else if (code === "webauthn_credential_exists") {
        setError("Dieser Passkey ist bereits hinterlegt.");
      } else if (code === "too_many_passkeys") {
        setError("Du hast die maximale Anzahl an Passkeys erreicht.");
      } else {
        setError("Der Passkey konnte nicht eingerichtet werden.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(passkeyId: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    if (error) {
      setError("Der Passkey konnte nicht entfernt werden.");
    } else {
      await load();
    }
    setBusy(false);
  }

  const isEmpty = items !== null && items.length === 0;

  return (
    <section className="mt-14">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Deine Passkeys
      </h2>

      {isEmpty ? (
        <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
          Noch keiner eingerichtet. Leg einen an, dann kommst du beim nächsten
          Mal ohne E-Mail-Code hinein.
        </p>
      ) : (
        <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
          Ein Passkey pro Gerät. Verlierst du ein Gerät, entfern ihn hier.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-4 border-l-2 border-danger pl-3 text-[0.9rem] text-danger"
        >
          {error}
        </p>
      ) : null}

      {items === null ? (
        <p className="mt-6 text-[0.9rem] text-muted">Wird geladen …</p>
      ) : items.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.95rem]">
                  {item.friendly_name || "Passkey"}
                </p>
                <p className="mt-0.5 text-[0.8rem] text-muted">
                  Seit {formatDate(item.created_at)}
                  {item.last_used_at
                    ? ` · zuletzt ${formatDate(item.last_used_at)}`
                    : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removePasskey(item.id)}
                disabled={busy}
                className="shrink-0 text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-danger disabled:opacity-50"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={addPasskey}
        disabled={busy}
        className="mt-6 rounded-lg border border-accent px-5 py-2.5 text-[0.9rem] font-medium text-accent transition-colors hover:bg-accent hover:text-paper disabled:opacity-50"
      >
        {busy ? "Moment …" : "Passkey einrichten"}
      </button>
    </section>
  );
}
