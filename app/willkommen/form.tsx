"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const HANDLE_MIN = 3;
const HANDLE_MAX = 30;

/**
 * Namen, die zu Verwechslung mit dem Betreiber einladen. Nur eine
 * UX-Hürde — die harte Eindeutigkeit erzwingt die Datenbank.
 */
const RESERVED = new Set([
  "admin",
  "administrator",
  "bilder",
  "hilfe",
  "mod",
  "moderator",
  "official",
  "root",
  "support",
  "system",
]);

function readableError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "23505":
      return "Der Name ist schon vergeben. Such dir einen anderen aus.";
    case "23514":
      return `Nur Kleinbuchstaben, Ziffern und Unterstrich, ${HANDLE_MIN} bis ${HANDLE_MAX} Zeichen.`;
    case "42501":
      return "Das Profil durfte nicht angelegt werden. Melde dich einmal ab und wieder an.";
    case "PGRST205":
    case "42P01":
      return "Die Datenbank-Migration fehlt. Führ supabase/migrations/0001_profiles.sql im SQL Editor aus.";
    default:
      return "Das hat nicht geklappt. Versuch es noch einmal.";
  }
}

export function WillkommenForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (RESERVED.has(handle)) {
      setError("Der Name ist reserviert. Such dir einen anderen aus.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").insert({
        id: userId,
        handle,
        display_name: displayName.trim() || null,
      });
      if (error) throw error;
      router.refresh();
      router.push("/");
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8">
      {error ? (
        <p
          role="alert"
          className="mb-6 border-l-2 border-danger pl-3 text-[0.9rem] leading-relaxed text-danger"
        >
          {error}
        </p>
      ) : null}

      <label
        htmlFor="handle"
        className="block text-[0.8rem] font-medium uppercase tracking-wider text-muted"
      >
        Name
      </label>
      <div className="mt-2 flex items-center rounded-lg border border-line transition-colors focus-within:border-accent">
        <span className="pl-4 text-[0.95rem] text-muted" aria-hidden="true">
          @
        </span>
        <input
          id="handle"
          required
          autoFocus
          autoComplete="off"
          spellCheck={false}
          minLength={HANDLE_MIN}
          maxLength={HANDLE_MAX}
          value={handle}
          onChange={(event) =>
            setHandle(
              event.target.value
                .toLowerCase()
                .replace(/[\s-]+/g, "_")
                .replace(/[^a-z0-9_]/g, ""),
            )
          }
          className="w-full bg-transparent py-3 pr-4 pl-1 text-[0.95rem] outline-none"
        />
      </div>
      <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">
        Kleinbuchstaben, Ziffern und Unterstrich — {HANDLE_MIN} bis {HANDLE_MAX}{" "}
        Zeichen.
      </p>

      <label
        htmlFor="display_name"
        className="mt-6 block text-[0.8rem] font-medium uppercase tracking-wider text-muted"
      >
        Anzeigename <span className="normal-case">(optional)</span>
      </label>
      <input
        id="display_name"
        autoComplete="name"
        maxLength={50}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="So stehst du über deinen Bildern"
        className="mt-2 w-full rounded-lg border border-line bg-transparent px-4 py-3 text-[0.95rem] outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
      />

      <button
        type="submit"
        disabled={busy || handle.length < HANDLE_MIN}
        className="mt-6 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? "Wird angelegt …" : "Los geht's"}
      </button>
    </form>
  );
}
