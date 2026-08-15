/**
 * Greift die Zugriffsregeln als angemeldeter Nutzer an.
 *
 * Aufruf:  npm run regeln
 * Nötig:   PRUEF_EMAIL und PRUEF_PASSWORT in .env.local
 *
 * Die Zugriffsregeln sind der eigentliche Schutz dieser App — sie stehen in
 * der Datenbank, nicht im Anwendungscode. Geprüft wurden sie bisher nur
 * durch Nachdenken. Dieses Skript meldet sich mit einem echten Konto an und
 * versucht, was niemand können soll.
 *
 * Es braucht ein WEGWERFKONTO, nicht das eigene: Dashboard → Authentication
 * → Users → „Add user", Haken bei „Auto Confirm User". Dasselbe Konto, das
 * supabase/testnutzer.sql erwartet.
 *
 * Ein Fehlschlag heisst hier: Etwas hat funktioniert, das nicht funktionieren
 * darf.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.PRUEF_EMAIL;
const passwort = process.env.PRUEF_PASSWORT;

const gruen = (s) => `\x1b[32m${s}\x1b[0m`;
const rot = (s) => `\x1b[31m${s}\x1b[0m`;
const grau = (s) => `\x1b[2m${s}\x1b[0m`;

let durchgefallen = 0;

/** Etwas, das ABGELEHNT werden muss. */
async function verboten(was, fn, aufraeumen) {
  const { error } = await fn();
  if (error) {
    console.log(`  ${gruen("✓")} ${was}`);
    console.log(grau(`      abgelehnt: ${error.message}`));
  } else {
    console.log(`  ${rot("✗")} ${was}`);
    console.log(rot("      GING DURCH — das darf nicht sein"));
    durchgefallen += 1;
    if (aufraeumen) await aufraeumen();
  }
}

/**
 * Ein UPDATE, das nichts bewirken darf.
 *
 * Hier reicht „kein Fehler" als Urteil NICHT. Passt eine Zeile nicht auf die
 * using-Bedingung einer Regel, filtert Postgres sie stillschweigend weg;
 * PostgREST meldet dann Erfolg mit null betroffenen Zeilen. Ein Aufruf ohne
 * select() sähe damit genauso aus wie ein gelungener Angriff.
 *
 * Mit select() kommen die tatsächlich geänderten Zeilen zurück — und nur
 * die zählen.
 */
async function verbotenesUpdate(was, fn) {
  const { data, error } = await fn();
  if (error) {
    console.log(`  ${gruen("✓")} ${was}`);
    console.log(grau(`      abgelehnt: ${error.message}`));
  } else if (!data || data.length === 0) {
    console.log(`  ${gruen("✓")} ${was}`);
    console.log(grau("      keine Zeile geändert — die Regel greift"));
  } else {
    console.log(`  ${rot("✗")} ${was}`);
    console.log(rot(`      ${data.length} Zeile(n) GEÄNDERT — das darf nicht sein`));
    durchgefallen += 1;
  }
}

/** Etwas, das FUNKTIONIEREN muss. */
async function erlaubt(was, fn) {
  const { error, hinweis } = await fn();
  if (error) {
    console.log(`  ${rot("✗")} ${was}`);
    console.log(rot(`      scheiterte: ${error.message}`));
    durchgefallen += 1;
  } else {
    console.log(`  ${gruen("✓")} ${was}`);
    if (hinweis) console.log(grau(`      ${hinweis}`));
  }
}

if (!url || !key) {
  console.error("\nNEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY fehlen in .env.local.\n");
  process.exit(1);
}
if (!email || !passwort) {
  console.error(
    [
      "",
      "PRUEF_EMAIL und PRUEF_PASSWORT fehlen in .env.local.",
      "",
      "Nimm dafür das Wegwerfkonto aus supabase/testnutzer.sql, nicht dein",
      "eigenes — das Skript versucht absichtlich Dinge, die scheitern sollen.",
      "",
      "  PRUEF_EMAIL=test@example.com",
      "  PRUEF_PASSWORT=<das Passwort aus dem Dashboard>",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const supabase = createClient(url, key);

console.log("\nAnmelden\n");
const { data: sitzung, error: loginFehler } =
  await supabase.auth.signInWithPassword({ email, password: passwort });

if (loginFehler || !sitzung?.user) {
  console.log(`  ${rot("✗")} Anmeldung fehlgeschlagen: ${loginFehler?.message}`);
  console.log(
    grau("      Konto im Dashboard angelegt? Haken bei „Auto Confirm User\"?"),
  );
  process.exit(1);
}

const ich = sitzung.user.id;
console.log(`  ${gruen("✓")} angemeldet als ${email}`);
console.log(grau(`      ${ich}`));

// Eine fremde Kennung, die es garantiert nicht gibt.
const fremd = "11111111-2222-3333-4444-555555555555";

console.log("\nBenachrichtigungen (0010)\n");

await erlaubt("eigene Benachrichtigungen lesen", async () => {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id");
  if (error) return { error };
  const fremde = (data ?? []).filter((r) => r.user_id !== ich);
  if (fremde.length > 0) {
    return { error: new Error(`${fremde.length} FREMDE Zeilen sichtbar`) };
  }
  return { hinweis: `${data?.length ?? 0} eigene, keine fremden` };
});

await verboten("sich selbst eine Benachrichtigung schreiben", () =>
  supabase.from("notifications").insert({
    user_id: ich,
    typ: "folgt",
    follow_follower_id: ich,
  }),
);

await erlaubt("ungelesene Nachrichten zählen", async () => {
  const { data, error } = await supabase.rpc("ungelesene_nachrichten");
  if (error) return { error };
  return { hinweis: `${data} ungelesen` };
});

await erlaubt("Lesemarke fortschreiben", () =>
  supabase.rpc("benachrichtigungen_gelesen", {
    bis: new Date().toISOString(),
  }),
);

await verbotenesUpdate("Lesemarke in die Zukunft setzen", () =>
  supabase
    .from("notification_state")
    .update({ read_at: "infinity" })
    .eq("user_id", ich)
    .select("read_at"),
);

// Gegenprobe: Steht die Marke danach wirklich noch in der Vergangenheit?
// Ohne sie bliebe offen, ob oben nur die Zeile fehlte.
await erlaubt("Lesemarke steht danach noch in der Vergangenheit", async () => {
  const { data, error } = await supabase
    .from("notification_state")
    .select("read_at")
    .eq("user_id", ich)
    .maybeSingle();
  if (error) return { error };
  if (!data) {
    return { error: new Error("keine Lesemarke vorhanden — Prüfung wertlos") };
  }
  if (new Date(data.read_at).getTime() > Date.now()) {
    return { error: new Error(`Marke steht in der Zukunft: ${data.read_at}`) };
  }
  return { hinweis: data.read_at };
});

console.log("\nUnterhaltungen (0011, 0012)\n");

await verboten(
  "eine Unterhaltung selbst anlegen",
  () =>
    supabase.from("conversations").insert({
      is_group: false,
      dm_key: `${ich}:${fremd}`,
      created_by: ich,
    }),
  async () => {
    await supabase.from("conversations").delete().eq("dm_key", `${ich}:${fremd}`);
  },
);

await verboten(
  "sich in eine fremde Unterhaltung eintragen",
  () =>
    supabase.from("conversation_participants").insert({
      conversation_id: fremd,
      user_id: ich,
    }),
  async () => {
    await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", fremd)
      .eq("user_id", ich);
  },
);

await verboten("die eigene Teilnehmerzeile umhängen", () =>
  supabase
    .from("conversation_participants")
    .update({ conversation_id: fremd })
    .eq("user_id", ich),
);

console.log("\nSchlüssel (0013)\n");

await verboten("eine Schlüsselzeile ohne Unterschrift ablegen", () =>
  supabase.from("conversation_keys").insert({
    conversation_id: fremd,
    user_id: ich,
    ephemeral_public_key: "x",
    iv: "x",
    data: "x",
  }),
);

await verboten("eine Schlüsselzeile mit leerer Unterschrift ablegen", () =>
  supabase.from("conversation_keys").insert({
    conversation_id: fremd,
    user_id: ich,
    ephemeral_public_key: "x",
    iv: "x",
    data: "x",
    sender_id: ich,
    signature: "",
  }),
);

await verboten("eine Schlüsselzeile im Namen eines anderen ablegen", () =>
  supabase.from("conversation_keys").insert({
    conversation_id: fremd,
    user_id: ich,
    ephemeral_public_key: "x",
    iv: "x",
    data: "x",
    sender_id: fremd,
    signature: "a".repeat(88),
  }),
);

console.log("\nProfile und Beiträge\n");

await verbotenesUpdate("ein fremdes Profil umbenennen", () =>
  supabase
    .from("profiles")
    .update({ display_name: "gekapert" })
    .neq("id", ich)
    .select("id, display_name"),
);

// Gegenprobe: Heisst danach wirklich niemand „gekapert"?
await erlaubt("kein Profil heisst danach „gekapert“", async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle")
    .eq("display_name", "gekapert");
  if (error) return { error };
  if ((data ?? []).length > 0) {
    return {
      error: new Error(`${data.length} Profil(e) umbenannt: ${data.map((p) => p.handle).join(", ")}`),
    };
  }
  return { hinweis: "keins" };
});

await verboten("einen Like im Namen eines anderen setzen", () =>
  supabase.from("likes").insert({ post_id: fremd, user_id: fremd }),
);

await supabase.auth.signOut();

console.log(
  durchgefallen === 0
    ? gruen("\nAlle Regeln halten.\n")
    : rot(`\n${durchgefallen} Regel(n) halten NICHT.\n`),
);

process.exitCode = durchgefallen === 0 ? 0 : 1;
