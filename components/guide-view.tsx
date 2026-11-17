import { BookOpen, Download, Flag, Map as MapIcon } from "lucide-react";
import SiteHeader from "./site-header";
import type { GuideGroup } from "@/lib/guide/markdown";
import "./guide.css";

function Contents({ slug, contents }: { slug: string; contents: GuideGroup[] }) {
  return <>
    <a href="/guide" className="guide-contents-home" aria-current={slug === "" ? "page" : undefined}>RPG Tools Guide</a>
    {contents.map(g => <div key={g.title} className="guide-contents-group">
      <p>{g.title}</p>
      <ul>{g.links.map(l => <li key={l.slug}><a href={`/guide${l.slug ? `/${l.slug}` : ""}`} aria-current={l.slug === slug ? "page" : undefined}>{l.text}</a></li>)}</ul>
    </div>)}
  </>;
}

/** One page of the user guide: the contents on the side (folded on a phone), the page beside it. */
export default function GuideView({ slug, html, contents }: { slug: string; html: string; contents: GuideGroup[] }) {
  return <main className="rpg-hub guide-page">
    <SiteHeader active="guide" account />
    <nav className="guide-tools" aria-label="Tools and downloads">
      <a href="/maptable"><MapIcon size={16} aria-hidden="true" />Open Maptable</a>
      <a href="/encyclopedia"><BookOpen size={16} aria-hidden="true" />Open the Encyclopedia</a>
      <a href="/campaigns"><Flag size={16} aria-hidden="true" />Campaigns</a>
      <a href="/guide/tools-and-downloads" className="guide-tools-downloads" aria-current={slug === "tools-and-downloads" ? "page" : undefined}><Download size={16} aria-hidden="true" />Tools and downloads</a>
    </nav>
    <div className="guide-layout">
      <nav className="guide-contents guide-contents-side" aria-label="Guide contents"><Contents slug={slug} contents={contents} /></nav>
      <details className="guide-contents guide-contents-fold"><summary>Guide contents</summary><nav aria-label="Guide contents"><Contents slug={slug} contents={contents} /></nav></details>
      <article className="guide-article" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </main>;
}
