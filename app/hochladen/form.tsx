"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ImageError, prepareImage, type PreparedImage } from "@/lib/bild";

type Phase = "leer" | "bereit" | "laedt";

function readableError(error: unknown): string {
  if (error instanceof ImageError) return error.message;

  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : "";

  if (/exceeded the maximum allowed size|payload too large/i.test(message)) {
    return "Das Bild ist zu gross. Nimm ein kleineres.";
  }
  if (/mime type|not supported/i.test(message)) {
    return "Dieses Dateiformat wird nicht unterstützt.";
  }
  if (/row-level security|violates/i.test(message)) {
    return "Der Upload wurde abgelehnt. Melde dich einmal ab und wieder an.";
  }
  return "Das Hochladen hat nicht geklappt. Versuch es noch einmal.";
}

export function HochladenForm({
  userId,
  art,
}: {
  userId: string;
  art: "post" | "story";
}) {
  const istStory = art === "story";
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("leer");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Object-URLs belegen Speicher, bis sie freigegeben werden.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setPhase("laedt");
    try {
      const prepared = await prepareImage(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setImage(prepared);
      setPreviewUrl(URL.createObjectURL(prepared.blob));
      setPhase("bereit");
    } catch (err) {
      setError(readableError(err));
      setPhase("leer");
    } finally {
      // Damit dieselbe Datei erneut gewählt werden kann.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!image) return;

    setError(null);
    setPhase("laedt");
    const supabase = createClient();
    const bucket = istStory ? "stories" : "posts";
    // Zufälliger Name statt des Originalnamens: Dateinamen verraten oft
    // mehr, als man denkt, und der Pfad ist bei einem öffentlichen Bucket
    // die einzige Hürde.
    const path = `${userId}/${crypto.randomUUID()}.jpg`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, image.blob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
        });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from(istStory ? "stories" : "posts")
        .insert(
          istStory
            ? {
                author_id: userId,
                image_path: path,
                image_width: image.width,
                image_height: image.height,
              }
            : {
                author_id: userId,
                image_path: path,
                image_width: image.width,
                image_height: image.height,
                caption: caption.trim() || null,
              },
        );

      if (insertError) {
        // Sonst bliebe eine Datei ohne Eintrag im Speicher liegen —
        // Supabase räumt nichts automatisch auf.
        await supabase.storage.from(bucket).remove([path]);
        throw insertError;
      }

      router.refresh();
      router.push("/");
    } catch (err) {
      setError(readableError(err));
      setPhase("bereit");
    }
  }

  return (
    <form onSubmit={publish} className="mt-8">
      {error ? (
        <p
          role="alert"
          className="mb-6 border-l-2 border-danger pl-3 text-[0.9rem] leading-relaxed text-danger"
        >
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        id="datei"
        type="file"
        accept="image/*"
        onChange={chooseFile}
        className="sr-only"
      />

      {previewUrl && image ? (
        <div className="overflow-hidden rounded-xl border border-line">
          {/* Kein next/image: Die Vorschau ist eine lokale Object-URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Vorschau des gewählten Bildes"
            width={image.width}
            height={image.height}
            className="w-full"
          />
        </div>
      ) : (
        <label
          htmlFor="datei"
          className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-center transition-colors hover:border-accent"
        >
          <span className="text-[0.95rem] font-medium">Bild auswählen</span>
          <span className="max-w-[24ch] text-[0.85rem] leading-relaxed text-muted">
            Wird auf dem Gerät verkleinert. Ort und Kameradaten bleiben hier.
          </span>
        </label>
      )}

      {image ? (
        <p className="mt-3 text-[0.8rem] text-muted">
          {image.width} × {image.height} Pixel ·{" "}
          {Math.round(image.blob.size / 1024)} KB ·{" "}
          <label
            htmlFor="datei"
            className="cursor-pointer underline decoration-line underline-offset-4 hover:text-ink"
          >
            anderes Bild
          </label>
        </p>
      ) : null}

      {istStory ? (
        <p className="mt-8 text-[0.85rem] leading-relaxed text-muted">
          Stories verschwinden nach 24 Stunden von selbst.
        </p>
      ) : (
        <>
          <label
            htmlFor="caption"
            className="mt-8 block text-[0.8rem] font-medium uppercase tracking-wider text-muted"
          >
            Text <span className="normal-case">(optional)</span>
          </label>
          <textarea
            id="caption"
            rows={3}
            maxLength={2200}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Mit #hashtags findet man es wieder"
            className="mt-2 w-full resize-none rounded-lg border border-line bg-transparent px-4 py-3 text-[0.95rem] leading-relaxed outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
          />
        </>
      )}

      <button
        type="submit"
        disabled={!image || phase === "laedt"}
        className="mt-6 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {phase === "laedt"
          ? "Moment …"
          : istStory
            ? "Zur Story hinzufügen"
            : "Veröffentlichen"}
      </button>
    </form>
  );
}
