import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { guideSlug, guideTitle, readSidebar, render, type GuideGroup } from "./markdown.ts";

/*
 * The user guide's pages, read from content/guide at build time. The guide routes are
 * force-static, so this runs during `next build` and no Vercel Function reads these files.
 */

const dir = () => path.join(process.cwd(), "content", "guide");

export type GuidePage = { slug: string; title: string; html: string };

export function guideSlugs(): string[] {
  return readdirSync(dir()).filter(f => f.endsWith(".md") && !f.startsWith("_")).map(guideSlug).filter(Boolean);
}

export function guidePage(slug: string): GuidePage | null {
  const file = readdirSync(dir()).find(f => f.endsWith(".md") && !f.startsWith("_") && guideSlug(f) === slug);
  if (!file) return null;
  const md = readFileSync(path.join(dir(), file), "utf8");
  return { slug, title: guideTitle(md), html: render(md) };
}

export function guideContents(): GuideGroup[] {
  return readSidebar(readFileSync(path.join(dir(), "_Sidebar.md"), "utf8"));
}
