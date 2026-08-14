"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "choose" | "email" | "code";

/** Übersetzt die Fehlercodes, die im Anmeldeweg tatsächlich vorkommen. */
function readableError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  if (name === "NotAllowedError" || name === "AbortError") {
    return "Anmeldung abgebrochen.";
  }

  switch (code) {
    case "webauthn_credential_not_found":
      return "Für dieses Gerät ist kein Passkey hinterlegt. Melde dich per E-Mail-Code an und richte hier einen ein.";
    case "webauthn_challenge_expired":
      return "Der Anmeldeversuch ist abgelaufen. Versuch es noch einmal.";
    case "webauthn_verification_failed":
      return "Der Passkey konnte nicht geprüft werden. Versuch es noch einmal.";
    case "passkey_disabled":
      return "Passkeys sind für dieses Projekt nicht aktiviert.";
    case "email_not_confirmed":
      return "Bestätige zuerst deine E-Mail-Adresse.";
    case "user_banned":
      return "Dieses Konto ist gesperrt.";
    case "over_email_send_rate_limit":
      return "Zu viele Codes angefordert. Warte einen Moment.";
    case "otp_expired":
      return "Der Code ist abgelaufen. Fordere einen neuen an.";
    default:
      return "Das hat nicht geklappt. Versuch es noch einmal.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(true);

  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" && !!window.PublicKeyCredential,
    );
  }, []);

  function done() {
    router.refresh();
    router.push("/");
  }

  async function signInWithPasskey() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      done();
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep("code");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      done();
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent">
          Bilder
        </p>
        <h1 className="mt-3 font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight">
          Kein Passwort.
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
          Dein Schlüssel liegt auf deinem Gerät und wird nie an uns übertragen.
          Nichts, was hier gespeichert ist, kann irgendwo geleakt werden.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-6 border-l-2 border-danger pl-3 text-[0.9rem] leading-relaxed text-danger"
          >
            {error}
          </p>
        ) : null}

        {step === "choose" ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={signInWithPasskey}
              disabled={busy || !passkeySupported}
              className="w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {busy ? "Moment …" : "Mit Passkey anmelden"}
            </button>

            {!passkeySupported ? (
              <p className="mt-3 text-[0.85rem] leading-relaxed text-muted">
                Dieser Browser unterstützt keine Passkeys. Nimm den E-Mail-Code.
              </p>
            ) : null}

            <div className="mt-8 flex items-center gap-4">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[0.75rem] uppercase tracking-widest text-muted">
                oder
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("email");
              }}
              className="mt-8 w-full text-[0.9rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
            >
              Code per E-Mail schicken
            </button>
          </div>
        ) : null}

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-8">
            <label
              htmlFor="email"
              className="block text-[0.8rem] font-medium uppercase tracking-wider text-muted"
            >
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-transparent px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {busy ? "Wird gesendet …" : "Code schicken"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("choose");
              }}
              className="mt-6 w-full text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
            >
              Zurück
            </button>
          </form>
        ) : null}

        {step === "code" ? (
          <form onSubmit={verifyCode} className="mt-8">
            <p className="text-[0.9rem] leading-relaxed text-muted">
              Wir haben einen sechsstelligen Code an{" "}
              <span className="text-ink">{email}</span> geschickt.
            </p>
            <label
              htmlFor="code"
              className="mt-6 block text-[0.8rem] font-medium uppercase tracking-wider text-muted"
            >
              Code
            </label>
            <input
              id="code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              autoComplete="one-time-code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              className="mt-2 w-full rounded-lg border border-line bg-transparent px-4 py-3 font-mono text-lg tracking-[0.4em] outline-none transition-colors focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="mt-4 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {busy ? "Wird geprüft …" : "Anmelden"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCode("");
                setStep("email");
              }}
              className="mt-6 w-full text-[0.85rem] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
            >
              Andere E-Mail-Adresse
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
