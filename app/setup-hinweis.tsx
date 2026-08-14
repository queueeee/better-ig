/**
 * Wird gezeigt, wenn die profiles-Tabelle fehlt — also die Migration noch
 * nicht ausgeführt wurde. Ohne diesen Zustand liefe die App in eine
 * Umleitungsschleife, und der Fehler sähe aus wie ein Bug im Code.
 */
export function SetupHinweis() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.22em] text-accent">
          Bilder
        </p>
        <h1 className="mt-3 font-display text-[1.8rem] leading-tight font-semibold tracking-tight">
          Die Datenbank fehlt noch
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
          In diesem Supabase-Projekt fehlt mindestens eine Migration. Führ die
          Dateien aus <code className="rounded bg-line/50 px-1.5 py-0.5 font-mono text-[0.85rem] text-ink">supabase/migrations/</code>{" "}
          der Reihe nach aus:
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-relaxed text-muted">
          <li>
            Im Supabase-Dashboard den <span className="text-ink">SQL Editor</span>{" "}
            öffnen
          </li>
          <li>
            Den Inhalt der noch fehlenden Migration einfügen — die Dateien sind
            nach Reihenfolge nummeriert
          </li>
          <li>
            Auf <span className="text-ink">Run</span> klicken und diese Seite neu
            laden
          </li>
        </ol>
        <p className="mt-6 text-[0.85rem] leading-relaxed text-muted">
          Ob alles passt, zeigt danach{" "}
          <code className="rounded bg-line/50 px-1.5 py-0.5 font-mono text-[0.8rem] text-ink">
            npm run check
          </code>
          .
        </p>
      </div>
    </main>
  );
}
