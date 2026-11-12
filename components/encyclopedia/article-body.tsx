"use client";
import type {ReactNode} from "react";
import {Lock,Map as MapIcon,ArrowUpRight} from "lucide-react";
import {resolveLink,SECRET_OPEN,SECRET_CLOSE,type Entry,type Workspace} from "@/lib/encyclopedia/world-model";
export const maptableHref = (sceneId: string) => `/maptable?scene=${encodeURIComponent(sceneId)}`;
export function ArticleBody({ entry, data, onOpen, onChange }: {
    entry: Entry;
    data: Workspace;
    onOpen: (id: string) => void;
    onChange: (body: string) => void;
}) {
    const lines = entry.body.split("\n");
    let fenced = false;
    function inline(text: string): ReactNode { return text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => { if (part.startsWith("[[")) {
        const [target, label] = part.slice(2, -2).split("|");
        const scene = target.match(/^maptable:([A-Za-z0-9_-]{1,120})$/);
        if (scene) return <a key={i} className="wiki-link maptable-inline" href={maptableHref(scene[1])} target="_blank" rel="noopener" title="Open this battle map in Maptable">{label?.trim() || "Battle map"}<ArrowUpRight size={13} aria-hidden="true"/></a>;
        const found = resolveLink(data, entry, target);
        return found ? <button key={i} className="wiki-link" onClick={() => onOpen(found.id)}>{label ?? found.title}</button> : <span key={i} className="broken-link" title="No matching article in this scope">{label ?? target}</span>;
    } if (part.startsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>; if (part.startsWith("`"))
        return <code key={i}>{part.slice(1, -1)}</code>; return part; }); }
    function render(line: string, index: number): ReactNode { const card = !fenced && line.trim().match(/^\[\[maptable:([A-Za-z0-9_-]{1,120})(?:\|([^\]]*))?\]\]$/); if (card)
        return <div className="maptable-card" key={index}><span className="maptable-card-thumb" aria-hidden="true"><MapIcon size={18}/></span><span className="maptable-card-text"><strong>{card[2]?.trim() || "Battle map"}</strong><small>Battle map in Maptable · only you can open it</small></span><a className="button" href={maptableHref(card[1])} target="_blank" rel="noopener">Open in Maptable <ArrowUpRight size={14} aria-hidden="true"/></a></div>;
        if (line.startsWith("```")) {
        fenced = !fenced;
        return null;
    } if (fenced)
        return <pre key={index}>{line || " "}</pre>; const task = line.match(/^(\s*)- \[([ xX])\] (.*)$/); if (task)
        return <label className="task-line" key={index} style={{ marginLeft: Math.min(task[1].length, 40) * 8 }}><input type="checkbox" checked={task[2].toLowerCase() === "x"} onChange={e => { const copy = [...lines]; copy[index] = `${task[1]}- [${e.target.checked ? "x" : " "}] ${task[3]}`; onChange(copy.join("\n")); }}/><span className={task[2].toLowerCase() === "x" ? "done" : ""}>{inline(task[3])}</span></label>; const h = line.match(/^(#{1,6}) (.*)$/); if (h) {
        const Heading = `h${Math.min(h[1].length + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
        return <Heading key={index}>{inline(h[2])}</Heading>;
    } const bullet = line.match(/^(\s*)[-*] (.*)$/); if (bullet)
        return <div className="bullet-line" key={index} style={{ marginLeft: Math.min(bullet[1].length, 40) * 8 }}>• <span>{inline(bullet[2])}</span></div>; if (line.startsWith("> "))
        return <blockquote key={index}>{inline(line.slice(2))}</blockquote>; return line ? <p key={index}>{inline(line)}</p> : <div className="paragraph-gap" key={index}/>; }
    // "::: secret" … ":::" blocks are GM-only. The server removes them from player views; here they are marked.
    const out: ReactNode[] = [];
    let secret: { start: number; children: ReactNode[] } | null = null;
    const close = () => { if (!secret) return; out.push(<div className="secret-block" key={`secret-${secret.start}`}><div className="secret-label"><Lock size={12} aria-hidden="true"/> GM secret · hidden from players</div>{secret.children}</div>); secret = null; fenced = false; };
    lines.forEach((line, index) => { if (!secret && SECRET_OPEN.test(line.replace(/\r$/, ""))) { secret = { start: index, children: [] }; return; } if (secret && SECRET_CLOSE.test(line.replace(/\r$/, ""))) { close(); return; } const node = render(line, index); (secret ? secret.children : out).push(node); });
    close();
    return <>{out}</>;
}
