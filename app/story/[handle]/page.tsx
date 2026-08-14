import { notFound, redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/profile";
import { getStoriesOf } from "@/lib/stories";
import { SetupHinweis } from "@/app/setup-hinweis";
import { StoryAnsicht } from "./ansicht";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const viewer = await getOwnProfile();

  if (viewer.status === "no-session") redirect("/login");
  if (viewer.status === "table-missing") return <SetupHinweis />;
  if (!viewer.profile) redirect("/willkommen");

  const daten = await getStoriesOf(handle);
  // Keine sichtbaren Stories heisst: abgelaufen oder nie welche gehabt.
  // Beides ist für den Betrachter dasselbe.
  if (!daten || daten.stories.length === 0) notFound();

  return (
    <StoryAnsicht
      handle={daten.handle}
      displayName={daten.display_name}
      stories={daten.stories}
    />
  );
}
