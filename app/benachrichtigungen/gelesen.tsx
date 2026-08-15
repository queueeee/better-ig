"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { alsGelesenMarkieren } from "./actions";

/**
 * Markiert beim Einhängen als gelesen — bewusst NICHT im Rendern der
 * Seite. Prefetching führt Server-Renderings aus: Schon das Überfahren
 * des Glockenlinks leerte sonst den Zähler, ohne dass jemand hingesehen
 * hat.
 */
export function Gelesen({ bis }: { bis: string | null }) {
  const router = useRouter();
  const erledigt = useRef(false);

  useEffect(() => {
    if (!bis || erledigt.current) return;
    erledigt.current = true;

    void alsGelesenMarkieren(bis).then(() => {
      // Damit die Glocke oben sofort auf den neuen Stand fällt. Der
      // Wächter oben verhindert, dass daraus eine Schleife wird.
      router.refresh();
    });
  }, [bis, router]);

  return null;
}
