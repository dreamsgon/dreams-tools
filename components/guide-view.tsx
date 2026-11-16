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
    <div className="guide-layout">
      <nav className="guide-contents guide-contents-side" aria-label="Guide contents"><Contents slug={slug} contents={contents} /></nav>
      <details className="guide-contents guide-contents-fold"><summary>Guide contents</summary><nav aria-label="Guide contents"><Contents slug={slug} contents={contents} /></nav></details>
      <article className="guide-article" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </main>;
}
