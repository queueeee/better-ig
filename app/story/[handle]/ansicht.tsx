"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { storyUrl, type Story } from "@/lib/post";

const DAUER_MS = 5000;

type Props = {
  handle: string;
  displayName: string | null;
  stories: Story[];
};

export function StoryAnsicht({ handle, displayName, stories }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [fortschritt, setFortschritt] = useState(0);
  const [pausiert, setPausiert] = useState(false);

  const weiter = useCallback(() => {
    setIndex((aktuell) => {
      if (aktuell + 1 < stories.length) {
        setFortschritt(0);
        return aktuell + 1;
      }
      router.push("/");
      return aktuell;
    });
  }, [stories.length, router]);

  const zurueck = useCallback(() => {
    setIndex((aktuell) => {
      setFortschritt(0);
      return Math.max(0, aktuell - 1);
    });
  }, []);

  // Fortschritt in kleinen Schritten, damit der Balken flüssig läuft.
  useEffect(() => {
    if (pausiert) return;
    const schritt = 50;
    const timer = setInterval(() => {
      setFortschritt((wert) => {
        const naechster = wert + (schritt / DAUER_MS) * 100;
        if (naechster >= 100) {
          weiter();
          return 0;
        }
        return naechster;
      });
    }, schritt);
    return () => clearInterval(timer);
  }, [pausiert, weiter]);

  useEffect(() => {
    function taste(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === " ") weiter();
      if (event.key === "ArrowLeft") zurueck();
      if (event.key === "Escape") router.push("/");
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [weiter, zurueck, router]);

  const aktuelle = stories[index];
  if (!aktuelle) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4">
        {/* Ein Balken je Story, gefüllt nach Fortschritt. */}
        <div className="flex gap-1">
          {stories.map((story, i) => (
            <div
              key={story.id}
              className="h-0.5 flex-1 overflow-hidden rounded-full bg-paper/25"
            >
              <div
                className="h-full bg-paper transition-[width] duration-75 ease-linear"
                style={{
                  width:
                    i < index ? "100%" : i === index ? `${fortschritt}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-4">
          <p className="text-[0.9rem] font-medium text-paper">
            {displayName ?? `@${handle}`}
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-[0.85rem] text-paper/70 transition-colors hover:text-paper"
          >
            Schließen
          </button>
        </div>

        <div
          className="relative mt-3 flex-1 overflow-hidden rounded-xl bg-paper/5"
          onPointerDown={() => setPausiert(true)}
          onPointerUp={() => setPausiert(false)}
          onPointerLeave={() => setPausiert(false)}
        >
          <Image
            key={aktuelle.id}
            src={storyUrl(aktuelle.image_path)}
            alt=""
            fill
            sizes="(max-width: 448px) 100vw, 448px"
            className="object-contain"
            priority
          />

          {/* Tippen links zurück, rechts weiter — wie überall gewohnt. */}
          <button
            type="button"
            onClick={zurueck}
            aria-label="Vorherige Story"
            className="absolute inset-y-0 left-0 w-1/3 cursor-default"
          />
          <button
            type="button"
            onClick={weiter}
            aria-label="Nächste Story"
            className="absolute inset-y-0 right-0 w-2/3 cursor-default"
          />
        </div>

        <p className="mt-3 text-center text-[0.75rem] text-paper/50">
          Verschwindet 24 Stunden nach dem Hochladen
        </p>
      </div>
    </div>
  );
}
