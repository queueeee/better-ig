/**
 * Prüft, ob die Supabase-Einrichtung vollständig ist, bevor man den
 * Anmeldeablauf im Browser testet. Aufruf: npm run check
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
const hint = (msg) => console.log(`    \x1b[2m${msg}\x1b[0m`);

let failed = false;
const fail = (msg, tip) => {
  bad(msg);
  if (tip) hint(tip);
  failed = true;
};

console.log("\nSupabase-Einrichtung\n");

if (!url || url.includes("dein-projekt")) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL fehlt oder ist noch der Platzhalter",
    "Dashboard → Project Settings → API Keys",
  );
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  fail(`URL sieht ungewöhnlich aus: ${url}`, "Erwartet: https://<ref>.supabase.co");
} else {
  ok("Projekt-URL gesetzt");
}

if (!key || key.includes("...")) {
  fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt oder ist noch der Platzhalter");
} else if (key.startsWith("sb_secret_")) {
  fail(
    "Das ist der Secret Key — er darf nicht in eine NEXT_PUBLIC_-Variable",
    "Er umgeht Row Level Security und landet sonst im Browser-Bundle.",
  );
} else if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")) {
  fail("Der Schlüssel sieht nicht nach einem Publishable Key aus");
} else {
  ok("Publishable Key gesetzt");
}

if (failed) {
  console.log("\nTrag die Werte in .env.local ein, dann nochmal.\n");
  process.exit(1);
}

const base = url.replace(/\/$/, "");

try {
  const res = await fetch(`${base}/auth/v1/settings`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (res.status === 401) {
    fail("Der Schlüssel wird abgelehnt (401)", "Passt er zu genau diesem Projekt?");
  } else if (!res.ok) {
    fail(`Auth-Dienst antwortet mit HTTP ${res.status}`);
  } else {
    ok("Verbindung steht, Schlüssel gültig");

    const settings = await res.json();

    if (settings.disable_signup) {
      fail(
        "Registrierung ist deaktiviert",
        "Dashboard → Authentication → Sign In / Providers → Allow new users to sign up",
      );
    } else {
      ok("Registrierung neuer Nutzer erlaubt");
    }

    if (settings.external?.email === false) {
      fail(
        "E-Mail-Anmeldung ist deaktiviert — ohne sie kommt niemand hinein",
        "Dashboard → Authentication → Sign In / Providers → Email",
      );
    } else {
      ok("E-Mail-Anmeldung aktiv");
    }

    if (settings.passkeys_enabled === true) {
      ok("Passkeys sind aktiviert");
    } else if (settings.passkeys_enabled === false) {
      fail(
        "Passkeys sind im Projekt NICHT aktiviert",
        "Dashboard → Authentication → Passkeys einschalten, RP ID: localhost, Origin: http://localhost:3000",
      );
    } else {
      console.log(
        "  \x1b[33m?\x1b[0m Passkey-Status nicht in der Antwort — Feldname kann sich geändert haben",
      );
      hint("Im Dashboard prüfen: Authentication → Passkeys");
    }

    if (settings.mailer_autoconfirm === false) {
      hint(
        "Hinweis: Neue Nutzer müssen ihre E-Mail bestätigen. Deren erste Mail",
      );
      hint(
        "kommt aus der Vorlage „Confirm signup\", nicht aus „Magic Link\" —",
      );
      hint("beide brauchen {{ .Token }}, sonst kommt ein Link statt eines Codes.");
    }
  }
} catch (err) {
  fail(`Projekt nicht erreichbar: ${err.message}`);
}

console.log(
  failed
    ? "\nNoch nicht startklar.\n"
    : [
        "",
        "Startklar. Zwei Dinge prüft dieses Skript nicht, weil sie von außen",
        "nicht sichtbar sind:",
        "",
        "  1. Enthält die Magic-Link-Vorlage {{ .Token }}? Ohne das kommt ein",
        "     Link statt eines sechsstelligen Codes an.",
        "  2. Steht die Relying Party ID auf localhost? Sie lässt sich später",
        "     nicht mehr ändern, ohne alle Passkeys ungültig zu machen.",
        "",
        "Dann: npm run dev",
        "",
      ].join("\n"),
);

process.exitCode = failed ? 1 : 0;
