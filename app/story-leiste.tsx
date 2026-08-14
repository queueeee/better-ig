import Image from "next/image";
import Link from "next/link";
import { storyUrl } from "@/lib/post";
import type { StoryGruppe } from "@/lib/stories";

/** Die Ringe über dem Feed. */
export function StoryLeiste({ gruppen }: { gruppen: StoryGruppe[] }) {
  const eigene = gruppen.find((gruppe) => gruppe.isMe);

  return (
    <div className="-mx-6 overflow-x-auto px-6 py-5">
      <ul className="flex gap-4">
        {/* Der eigene Eintrag steht immer vorn — mit Ring, wenn etwas da
            ist, sonst als Aufforderung. */}
        {!eigene ? (
          <li className="shrink-0">
            <Link href="/hochladen?art=story" className="group block w-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-line text-xl text-muted transition-colors group-hover:border-accent group-hover:text-accent">
                +
              </div>
              <p className="mt-1.5 truncate text-center text-[0.7rem] text-muted">
                Deine Story
              </p>
            </Link>
          </li>
        ) : null}

        {gruppen.map((gruppe) => {
          const letzte = gruppe.stories[gruppe.stories.length - 1];
          return (
            <li key={gruppe.handle} className="shrink-0">
              <Link href={`/story/${gruppe.handle}`} className="group block w-16">
                <div className="rounded-full bg-accent p-[2px]">
                  <div className="overflow-hidden rounded-full border-2 border-paper">
                    <Image
                      src={storyUrl(letzte.image_path)}
                      alt=""
                      width={letzte.image_width}
                      height={letzte.image_height}
                      sizes="64px"
                      className="h-14 w-14 object-cover"
                    />
                  </div>
                </div>
                <p className="mt-1.5 truncate text-center text-[0.7rem] text-muted transition-colors group-hover:text-ink">
                  {gruppe.isMe ? "Du" : `@${gruppe.handle}`}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
