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
      fail("Passkeys sind im Projekt NICHT aktiviert");
      hint("Dashboard → Authentication → Passkeys, dort „Enable Passkey");
      hint("authentication\". NICHT der WebAuthn-Schalter unter Multi-Factor");
      hint("Authentication — der ist eine andere Einstellung und lässt");
      hint("passkeys_enabled unberührt.");
      hint("");
      hint("Alle drei Felder sind Pflicht, sonst speichert der Server nicht:");
      hint("  Relying Party ID       localhost");
      hint("  Relying Party Origins  http://localhost:3000");
      hint("  Display Name           (frei wählbar)");
      hint("");
      hint("Die RP ID ist die nackte Domain — ohne https://, Port und Slash.");
      hint("Jeder Origin-Host muss der RP ID entsprechen oder eine Subdomain");
      hint("davon sein.");
    } else {
      console.log(
        "  \x1b[33m?\x1b[0m Passkey-Status nicht in der Antwort — Feldname kann sich geändert haben",
      );
      hint("Im Dashboard prüfen: Authentication → Passkeys");
    }

    // Existiert die profiles-Tabelle? PostgREST antwortet auf eine Anfrage
    // gegen eine unbekannte Tabelle mit 404, auf eine bekannte mit 200 —
    // Row Level Security liefert dann nur eine leere Liste, was hier genügt.
    const table = await fetch(`${base}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });

    if (table.status === 404) {
      fail("Die Tabelle „profiles\" fehlt");
      hint("Dashboard → SQL Editor → Inhalt von");
      hint("supabase/migrations/0001_profiles.sql einfügen und Run klicken.");
    } else if (table.ok || table.status === 401 || table.status === 403) {
      ok("Tabelle „profiles\" vorhanden");
    } else {
      console.log(
        `  \x1b[33m?\x1b[0m Tabelle „profiles\" — unerwartete Antwort HTTP ${table.status}`,
      );
    }

    // Jede Migration bringt eine Tabelle mit; fehlt eine, ist klar welche.
    const tables = [
      ["posts", "0002_posts.sql"],
      ["likes", "0003_likes_kommentare.sql"],
      ["comments", "0003_likes_kommentare.sql"],
      ["follows", "0004_folgen.sql"],
      ["stories", "0006_stories.sql"],
      ["conversations", "0007_unterhaltungen.sql"],
      ["user_keys", "0008_schluessel.sql"],
      ["messages", "0009_nachrichten.sql"],
    ];

    // Migration 0005 legt keine Tabelle an, sondern Spalten — erkennbar
    // daran, ob nach hashtags gefragt werden darf.
    const hashtagCol = await fetch(
      `${base}/rest/v1/posts?select=hashtags&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (hashtagCol.status === 400) {
      fail("Suche und Hashtags fehlen");
      hint("Dashboard → SQL Editor → Inhalt von");
      hint("supabase/migrations/0005_suche_hashtags.sql einfügen und Run.");
    } else if (hashtagCol.ok || [401, 403].includes(hashtagCol.status)) {
      ok("Suche und Hashtags eingerichtet");
    }

    for (const [name, migration] of tables) {
      const res = await fetch(`${base}/rest/v1/${name}?select=*&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });

      if (res.status === 404) {
        fail(`Die Tabelle „${name}" fehlt`);
        hint(`Dashboard → SQL Editor → Inhalt von`);
        hint(`supabase/migrations/${migration} einfügen und Run klicken.`);
      } else if (res.ok || [401, 403].includes(res.status)) {
        ok(`Tabelle „${name}" vorhanden`);
      }
    }

    // Ein öffentlicher Bucket antwortet auf eine Anfrage nach einer nicht
    // existierenden Datei mit 400/404 — fehlt der Bucket selbst, meldet
    // Storage das ausdrücklich im Text.
    const bucket = await fetch(
      `${base}/storage/v1/object/public/posts/.probe`,
      { headers: { apikey: key } },
    );
    const bucketBody = await bucket.text();

    if (/bucket not found/i.test(bucketBody)) {
      fail("Der Speicher-Bucket „posts\" fehlt");
      hint("Er wird von derselben Migration 0002 mit angelegt.");
    } else {
      ok("Speicher-Bucket „posts\" vorhanden");
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

// Optionaler Testversand: npm run check -- --mail dein@postfach.de
// Verschickt eine echte Anmeldemail und zeigt, woran der Versand scheitert.
const mailArg = process.argv.indexOf("--mail");
if (mailArg !== -1) {
  const to = process.argv[mailArg + 1] ?? process.env.CHECK_TEST_EMAIL;

  if (!to) {
    fail(
      "Keine Testadresse angegeben",
      "npm run check -- --mail du@example.com, oder CHECK_TEST_EMAIL in .env.local setzen",
    );
  } else {
    console.log(`\nTestversand an ${to} …`);
    hint(
      "Muss die Adresse sein, mit der dein Resend-Konto angelegt wurde —",
    );
    hint("solange dort keine eigene Domain verifiziert ist.");

    // Welche Vorlage greift, hängt am Kontozustand, nicht am Aufruf: Ein
    // bestätigtes Konto bekommt "Magic Link", ein neues oder unbestätigtes
    // bekommt "Confirm signup". Wer die falsche bearbeitet, sieht seine
    // Änderung nie.
    //
    // Erst mit create_user=false anfragen: Existiert das Konto, geht die Mail
    // sofort raus und wir wissen zugleich, welche Vorlage greift. Existiert es
    // nicht, lehnt Supabase ohne Mailversand ab — dann erst der zweite Aufruf,
    // sodass die 60-Sekunden-Sperre pro Adresse nicht unnötig ausgelöst wird.
    let res = await fetch(`${base}/auth/v1/otp`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email: to, create_user: false }),
    });
    let body = await res.text();

    if (res.ok) {
      ok("Konto existiert und ist bestätigt");
      hint("→ Es greift die Vorlage „Magic Link\".");
    } else if (body.includes("otp_disabled")) {
      ok("Konto existiert noch nicht oder ist unbestätigt");
      hint("→ Es greift die Vorlage „Confirm signup\".");
      res = await fetch(`${base}/auth/v1/otp`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ email: to, create_user: true }),
      });
      body = await res.text();
    }

    if (res.ok) {
      ok("Supabase hat die Mail an den SMTP-Dienst übergeben");
      hint("Kommt trotzdem nichts an, liegt es an Zustellung oder Spamfilter.");
      hint("Im Resend-Dashboard unter „Emails\" steht der tatsächliche Inhalt.");
    } else {
      let msg = body;
      try {
        msg = JSON.parse(body).msg ?? body;
      } catch {}
      fail(`Versand fehlgeschlagen (HTTP ${res.status}): ${msg}`);

      if (res.status === 429) {
        hint("Nur die Sperre von 60 Sekunden pro Adresse — kurz warten und");
        hint("nochmal. Kein Konfigurationsfehler.");
      }

      if (/sending (confirmation|magic link|recovery) email/i.test(msg)) {
        hint("Supabase konnte die Mail nicht an den SMTP-Dienst übergeben.");
        hint("Zwei Ursachen sind möglich, und sie sehen von aussen gleich aus:");
        hint("");
        hint("A) Die Vorlage lässt sich nicht rendern. Prüfen, indem man");
        hint("   „Confirm signup\" vorübergehend durch <p>{{ .Token }}</p>");
        hint("   ersetzt. Geht es dann, war es ein Tippfehler in der Variable.");
        hint("");
        hint("B) Der SMTP-Versand scheitert. Bei Resend der Reihe nach:");
        hint("   1. Empfänger — ohne eigene verifizierte Domain nimmt Resend");
        hint("      NUR die Adresse an, mit der das Konto angelegt wurde.");
        hint("   2. Absender — dann zwingend onboarding@resend.dev.");
        hint("   3. Username — wörtlich „resend\", nicht die E-Mail-Adresse.");
        hint("   4. Passwort — der API-Key (re_…) mit Recht „Sending access\".");
        hint("   5. Port 465.");
        hint("");
        hint("Den Klartext-Fehler zeigt das Dashboard unter Logs → Auth Logs.");
      }
      failed = true;
    }
  }
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
        "     Link statt eines Zahlencodes an.",
        "  2. Steht die Relying Party ID auf localhost? Sie lässt sich später",
        "     nicht mehr ändern, ohne alle Passkeys ungültig zu machen.",
        "",
        "Dann: npm run dev",
        "",
      ].join("\n"),
);

process.exitCode = failed ? 1 : 0;
