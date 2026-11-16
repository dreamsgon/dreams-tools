import { notFound } from "next/navigation";
import GuideView from "@/components/guide-view";
import { guideContents, guidePage, guideSlugs } from "@/lib/guide/pages";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return guideSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const page = guidePage((await params).slug);
  return { title: `${page?.title ?? "Guide"} | RPG Tools Guide` };
}

export default async function GuideArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = guidePage(slug);
  if (!page) notFound();
  return <GuideView slug={slug} html={page.html} contents={guideContents()} />;
}
