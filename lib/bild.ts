/**
 * Bildaufbereitung im Browser, vor dem Upload.
 *
 * Zwei Gründe, warum das hier passiert und nicht auf dem Server:
 *
 * 1. Supabase bietet Bildtransformation erst ab dem Pro-Plan. Ohne
 *    Verkleinerung landen 12-Megapixel-Fotos in voller Grösse im Speicher
 *    und im Feed — bei 1 GB Kontingent wären das keine 300 Bilder.
 * 2. Das Neuzeichnen auf ein Canvas entfernt sämtliche EXIF-Daten, also
 *    auch die GPS-Koordinaten, die Handys in jedes Foto schreiben. Es
 *    entsteht eine neue Datei, die nur noch Pixel enthält. Das ist der
 *    eigentliche Gewinn: Ein Foto, das den Wohnort verrät, verlässt das
 *    Gerät gar nicht erst.
 */

/** Lange Kante. Reicht für jeden Feed und jedes Retina-Display. */
const MAX_EDGE = 1440;

/** Kompromiss aus Dateigrösse und sichtbarer Qualität. */
const QUALITY = 0.82;

export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
};

export class ImageError extends Error {}

function targetSize(width: number, height: number) {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const scale = MAX_EDGE / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Dekodiert, dreht, verkleinert und kodiert neu. Gibt immer JPEG zurück.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImageError("Das ist keine Bilddatei.");
  }

  let bitmap: ImageBitmap;
  try {
    // imageOrientation ist inzwischen der Standardwert, wird hier aber
    // ausdrücklich gesetzt: Ohne ihn liegen Hochformatfotos vom iPhone
    // quer, weil deren Drehung nur im EXIF steht.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Häufigster Fall: HEIC vom iPhone. Chrome und Firefox können das
    // nicht dekodieren, Safari schon.
    throw new ImageError(
      file.name.toLowerCase().match(/\.(heic|heif)$/)
        ? "HEIC-Bilder kann dieser Browser nicht öffnen. Exportier das Foto als JPEG."
        : "Das Bild konnte nicht gelesen werden.",
    );
  }

  const { width, height } = targetSize(bitmap.width, bitmap.height);

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new ImageError("Der Browser kann das Bild nicht verarbeiten.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY })
      : await new Promise<Blob | null>((resolve) =>
          (canvas as HTMLCanvasElement).toBlob(
            resolve,
            "image/jpeg",
            QUALITY,
          ),
        );

  if (!blob) throw new ImageError("Das Bild konnte nicht gespeichert werden.");

  return { blob, width, height };
}
