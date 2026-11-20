"use client";
import { uiZoom } from "@/lib/appearance";
import {useRef,useState,type ReactNode} from "react";
import {Lock,Map as MapIcon,ArrowUpRight,FileText,Plus} from "lucide-react";
import {rollTarget,tableTarget,plainExcerpt} from "@/lib/encyclopedia/inline";
import {leadText,linkParts,sectionText,headingId,type PageListOptions} from "@/lib/encyclopedia/markup";
import {TableChip,TableEmbed} from "./table-library";
import {RollChip} from "./rolls";
import {OPEN_CHAT_EVENT} from "@/lib/ai/chat-text";
import {resolveLink,visibleEntries,type Entry,type Workspace} from "@/lib/encyclopedia/world-model";
import {WikiProse,scrollToHeading,type WikiEnv} from "./wiki-prose";
export const maptableHref = (sceneId: string) => `/maptable?scene=${encodeURIComponent(sceneId)}`;
const KIND_NAME: Record<string, string> = { faction: "Organization", note: "Page", folder: "Category" };
const kindName = (e: Entry) => e.kind === "character" ? ({ pc: "Player character", creature: "Creature", companion: "Companion", npc: "NPC" } as const)[e.character?.role ?? "npc"] : KIND_NAME[e.kind] ?? e.kind[0]!.toUpperCase() + e.kind.slice(1);

/**
 * The GM's page text (the reader is wiki-prose.tsx). Links open pages and their sections; a link to a page that
 * doesn't exist yet offers to create it; embeds show other pages, sections and page lists. Secrets, asides and
 * GM-only rows show here, marked; the server takes them out for players.
 */
export function ArticleBody({ entry, data, onOpen, onChange, onCreate }: {
    entry: Entry;
    data: Workspace;
    onOpen: (id: string) => void;
    onChange: (body: string) => void;
    /** Creates a page for a link that has none yet (red link). */
    onCreate?: (title: string) => void;
}) {
    const [preview, setPreview] = useState<{ entry: Entry; x: number; y: number } | null>(null);
    const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showPreview = (target: Entry, el: HTMLElement) => { if (hover.current) clearTimeout(hover.current); hover.current = setTimeout(() => { const r = el.getBoundingClientRect(), z = uiZoom(); setPreview({ entry: target, x: Math.min(r.left / z, window.innerWidth / z - 316), y: r.bottom / z + 6 }); }, 350); };
    const hidePreview = () => { if (hover.current) clearTimeout(hover.current); hover.current = null; setPreview(null); };
    const go = (target: Entry, section: string | null) => { hidePreview(); if (target.id !== entry.id) onOpen(target.id); if (section) scrollToHeading(headingId(section)); };
    const envFor = (page: Entry): WikiEnv => ({
        gm: true,
        title: page.title,
        link: (inner, i) => {
            const scene = inner.match(/^maptable:([A-Za-z0-9_-]{1,120})(?:\|(.*))?$/);
            if (scene) return <a key={i} className="wiki-link maptable-inline" href={maptableHref(scene[1]!)} target="_blank" rel="noopener" title="Open this battle map in Maptable">{scene[2]?.trim() || "Battle map"}<ArrowUpRight size={13} aria-hidden="true"/></a>;
            const chat = inner.match(/^ai-chat:([A-Za-z0-9-]{8,64})(?:\|(.*))?$/);
            if (chat) return <button key={i} className="wiki-link" title="Open this chat in the AI panel" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: chat[1] }))}>{chat[2]?.trim() || "Open the chat"}</button>;
            const table = tableTarget(inner);
            if (table) return <TableChip key={i} name={table.name} label={table.label} page={page.title} campaignId={page.campaignId}/>;
            const roll = rollTarget(inner);
            if (roll) return <RollChip key={i} title={page.title} formula={roll.formula} label={roll.label}/>;
            const { page: target, section, label } = linkParts(inner);
            const found = target ? resolveLink(data, page, target) : page;
            const text = label ?? (section ? (target ? `${found?.title ?? target}, ${section}` : section) : found?.title ?? target);
            if (found) return <button key={i} className="wiki-link" onClick={() => go(found, section)} onMouseEnter={e => showPreview(found, e.currentTarget)} onMouseLeave={hidePreview} onFocus={e => showPreview(found, e.currentTarget)} onBlur={hidePreview}>{text}{found.overviewVisibility !== "players" && <Lock className="wiki-link-lock" size={11} aria-label="GM only"/>}</button>;
            return onCreate ? <button key={i} className="red-link" title="No page with this name yet. Click to create it." onClick={() => onCreate(target)}>{text}</button> : <span key={i} className="broken-link" title="No matching article in this scope">{text}</span>;
        },
        randomTable: (inner, i) => { const t = tableTarget(inner); return t ? <TableEmbed key={i} name={t.name} page={page.title} campaignId={page.campaignId}/> : null; },
        maptable: (sceneId, label, i) => <div className="maptable-card" key={i}><span className="maptable-card-thumb" aria-hidden="true"><MapIcon size={18}/></span><span className="maptable-card-text"><strong>{label}</strong><small>Battle map in Maptable · only you can open it</small></span><a className="button" href={maptableHref(sceneId)} target="_blank" rel="noopener">Open in Maptable <ArrowUpRight size={14} aria-hidden="true"/></a></div>,
        embed: (raw, options, depth) => {
            const t = tableTarget(raw);
            if (t) return <TableEmbed name={t.name} page={page.title} campaignId={page.campaignId}/>;
            const { page: target, section } = linkParts(raw);
            const found = target ? resolveLink(data, page, target) : page;
            if (!found) return <div className="wiki-embed gone">No page called “{target}” yet.{onCreate && <> <button className="red-link" onClick={() => onCreate(target)}><Plus size={12} aria-hidden="true"/> Create it</button></>}</div>;
            if (found.id === page.id && !section) return null;
            const full = options.some(o => /^full$/i.test(o));
            const text = section ? sectionText(found.body, section) : full ? found.body : leadText(found.body);
            const head = <header><FileText size={14} aria-hidden="true"/><button className="wiki-link" onClick={() => go(found, section)}>{found.title}</button>{section && <span>{section}</span>}{found.overviewVisibility !== "players" && <span className="gm-tag"><Lock size={11} aria-hidden="true"/> GM only, players don’t get this</span>}<span className="kind">{kindName(found)}</span></header>;
            if (text === null) return <div className="wiki-embed gone">“{found.title}” has no section called “{section}”.</div>;
            const more = !section && !full && found.body.trim().length > text.length;
            return <section className="wiki-embed">{head}<div className="wiki-embed-body prose">{text ? <WikiProse text={text} env={envFor(found)} depth={depth + 1}/> : <p className="muted">Nothing written yet.</p>}</div>{more && <button className="text-button wiki-embed-more" onClick={() => go(found, null)}>Read the whole page</button>}</section>;
        },
        pageList: (o, i) => <PageList key={i} options={o} pages={visibleEntries(data, page.worldId, page.campaignId).filter(e => e.id !== page.id)} parent={o.inside ? resolveLink(data, page, o.inside) ?? null : undefined} onOpen={id => { hidePreview(); onOpen(id); }} gm/>,
        onTask: page.id === entry.id ? (line, done) => { const lines = entry.body.split("\n"); const m = lines[line]?.match(/^(\s*)- \[([ xX])\] (.*)$/); if (!m) return; lines[line] = `${m[1]}- [${done ? "x" : " "}] ${m[3]}`; onChange(lines.join("\n")); } : undefined,
    });
    const p = preview?.entry, c = p?.kind === "character" ? p.character : undefined;
    return <><WikiProse text={entry.body} env={envFor(entry)}/>{p && preview && <div className="link-preview" role="tooltip" style={{ left: preview.x, top: preview.y }}><span className="eyebrow">{[kindName(p), c?.faction || c?.location].filter(Boolean).join(" · ")}</span><strong>{p.title}</strong>{plainExcerpt(p.body) && <p>{plainExcerpt(p.body)}</p>}</div>}</>;
}

type ListPage = { id: string; title: string; kind: string; updatedAt?: string; parentId?: string | null; overviewVisibility?: string; excerpt?: string };
/** `::: pages`: a list of pages that keeps itself up to date. `parent` undefined means no `inside:`; null means it named a page that isn't there. */
export function PageList({ options: o, pages, parent, onOpen, gm }: { options: PageListOptions; pages: readonly (ListPage | Entry)[]; parent?: { id: string } | null; onOpen: (id: string) => void; gm?: boolean }): ReactNode {
    let list = pages.filter(p => p.kind !== "folder" && (!o.kinds.length || o.kinds.includes(p.kind)));
    if (parent !== undefined) list = list.filter(p => parent && "parentId" in p && p.parentId === parent.id);
    list = [...list].sort(o.sort === "changed" ? (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") : (a, b) => a.title.localeCompare(b.title));
    if (o.limit) list = list.slice(0, o.limit);
    if (!list.length) return <p className="muted wiki-list-empty">No pages match this list yet.</p>;
    const kind = (p: ListPage | Entry) => "body" in p ? kindName(p as Entry) : KIND_NAME[p.kind] ?? p.kind[0]!.toUpperCase() + p.kind.slice(1);
    const lock = (p: ListPage | Entry) => gm && p.overviewVisibility !== "players" ? <Lock size={11} aria-label="GM only"/> : null;
    const excerpt = (p: ListPage | Entry) => "body" in p ? plainExcerpt(leadText((p as Entry).body), 110) : p.excerpt ?? "";
    if (o.show === "cards") return <div className="wiki-cards">{list.map(p => <button key={p.id} onClick={() => onOpen(p.id)}><strong>{p.title} {lock(p)}</strong><span>{excerpt(p) || kind(p)}</span></button>)}</div>;
    return <div className="wiki-list">{list.map(p => <button key={p.id} onClick={() => onOpen(p.id)}><strong>{p.title} {lock(p)}</strong><span>{kind(p)}{o.show === "table" && p.updatedAt ? `, changed ${new Date(p.updatedAt).toLocaleDateString()}` : ""}</span></button>)}</div>;
}
