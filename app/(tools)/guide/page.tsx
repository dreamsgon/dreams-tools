import GuideView from "@/components/guide-view";
import { guideContents, guidePage } from "@/lib/guide/pages";

export const dynamic = "force-static";
export const metadata = { title: "Guide | RPG Tools", description: "How to use Maptable and the RPG Encyclopedia, with examples and short tutorials." };

export default function GuideHome() {
  const page = guidePage("")!;
  return <GuideView slug="" html={page.html} contents={guideContents()} />;
}
