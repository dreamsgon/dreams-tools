"use client";
import { ArrowRight, ArrowUpRight, FileText, User } from "lucide-react";
import type { ResolvedFrontPage, ResolvedWidget } from "@/lib/encyclopedia/front-page";
import "./front-page.css";

/** "Wed 18 Nov · 7 PM" in the viewer's own time zone, plus "in 6 days". */
export function sessionTime(iso: string, now = Date.now()) {
  const t = new Date(iso);
  if (!iso || Number.isNaN(t.getTime())) return null;
  const day = t.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = t.toLocaleTimeString(undefined, { hour: "numeric", minute: t.getMinutes() ? "2-digit" : undefined });
  const days = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
  const relative = t.getTime() < now ? "already happened" : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return { label: `${day} · ${time}`, relative };
}

type Open = { open?: (entryId: string) => void; href?: (entryId: string) => string };

/** The campaign front page. Players see it first; the campaign hub shows the same thing. */
export function FrontPageView({ page, ...link }: { page: ResolvedFrontPage } & Open) {
  if (!page.widgets.length) return <p className="front-empty">Nothing on the front page yet.</p>;
  return <div className="front-grid">{page.widgets.map(w => <section key={w.id} className={`front-widget front-${w.type}${w.wide ? " front-wide" : ""}`} aria-label={w.title}>
    <h2>{w.title}</h2>
    <Body widget={w} {...link} />
  </section>)}</div>;
}

function EntryLink({ id, children, open, href, className }: { id: string; children: React.ReactNode; className?: string } & Open) {
  if (open) return <button type="button" className={`front-link ${className ?? ""}`} onClick={() => open(id)}>{children}</button>;
  if (href) return <a className={`front-link ${className ?? ""}`} href={href(id)}>{children}</a>;
  return <span className={className}>{children}</span>;
}

function Body({ widget: w, ...link }: { widget: ResolvedWidget } & Open) {
  switch (w.type) {
    case "next": {
      const time = sessionTime(w.when);
      return time ? <><strong className="front-big">{time.label}</strong><p className="front-muted">{[time.relative, w.where].filter(Boolean).join(" · ")}</p></>
        : <p className="front-muted">Not scheduled yet.{w.where ? ` ${w.where}` : ""}</p>;
    }
    case "date": return <><strong className="front-big">{w.date}</strong><p className="front-muted">{w.calendar}</p></>;
    case "party": return w.members.length ? <ul className="front-list">{w.members.map(m => <li key={m.id}><User size={15} aria-hidden="true" /><EntryLink id={m.id} {...link}>{m.title}</EntryLink></li>)}</ul>
      : <p className="front-muted">No player characters shared yet.</p>;
    case "recap": return w.entryId ? <><strong className="front-heading">{w.heading}</strong>{w.excerpt && <p className="front-prose">{w.excerpt}</p>}<EntryLink id={w.entryId} className="front-more" {...link}>Read the recap <ArrowRight size={14} aria-hidden="true" /></EntryLink></>
      : <p className="front-muted">No session notes shared yet.</p>;
    case "story": return <>{w.body.trim() ? <div className="front-prose front-text front-story-text">{w.body}</div> : <p className="front-muted">The story so far isn’t written yet.</p>}
      {w.sessions.length > 0 && <ul className="front-list front-story-sessions">{w.sessions.map(x => <li key={x.id}><FileText size={15} aria-hidden="true" /><EntryLink id={x.id} {...link}>{x.title}</EntryLink></li>)}</ul>}</>;
    case "text": return w.body.trim() ? <div className="front-prose front-text">{w.body}</div> : <p className="front-muted">Nothing written here yet.</p>;
    case "links": return w.links.length ? <ul className="front-list">{w.links.map((l, i) => <li key={i}>
      {l.url ? <><ArrowUpRight size={15} aria-hidden="true" /><a className="front-link" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a></>
        : <><FileText size={15} aria-hidden="true" /><EntryLink id={l.entryId!} {...link}>{l.label}</EntryLink></>}
    </li>)}</ul> : <p className="front-muted">No links yet.</p>;
  }
}
