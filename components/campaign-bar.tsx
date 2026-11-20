"use client";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { CampaignRow, CampaignSummary } from "@/lib/campaign-links";
import { campaignToolLinks, matchesRef, memberCampaign, ownCampaign, type BarCampaign, type CampaignRef, type CampaignTool, type JoinedCampaign } from "@/lib/campaign-nav";
import CampaignSwitcher, { useCampaignSwitcherShortcut } from "./campaign-switcher";
import NotificationBell from "./notification-bell";
import { AccountLink } from "./tool-switch";
import "./campaign-bar.css";

/*
 * The campaign bar: the one top bar on every page inside a campaign (its Dashboard, Maptable, the Wiki and the
 * Forum). Left to right: the RPG Tools mark (home), the campaign switcher, the campaign's places, the page's own
 * trail, then the page's actions, notifications and account. lib/campaign-nav.ts decides where everything goes.
 * Links between places are full-page anchors: each tool has its own layout and stylesheet.
 */

type Loaded = { rows: CampaignRow[]; joined: JoinedCampaign[] };
let loading: Promise<Loaded> | null = null;
/** Your campaigns and the ones you joined, read once per page load and shared by every bar on the page. */
function loadCampaigns(): Promise<Loaded> {
  loading ??= Promise.all([
    fetch("/api/campaigns", { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<CampaignSummary> : null).catch(() => null),
    fetch("/api/members?mine=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([summary, mine]) => ({ rows: summary?.rows ?? [], joined: Array.isArray(mine?.campaigns) ? mine.campaigns : [] }));
  return loading;
}

const unmodified = (e: ReactMouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

export type CampaignBarProps = {
  /** The place this page is. Its tab is underlined. */
  tool: CampaignTool;
  /** Which campaign this page is in, by whatever id the page knows. */
  campaign: CampaignRef;
  /** The campaign's name, shown at once while the bar reads the rest. */
  name?: string;
  /** The page's own path below the campaign (a scene, a page, a board). Never the campaign again. */
  trail?: ReactNode;
  /** The page's own controls at the right end (save state, its main button). */
  actions?: ReactNode;
  /** In place switching for a tool that can (Maptable, the Wiki). Left out, picking a campaign loads its page. */
  onPick?: (row: CampaignRow) => void;
  /** Called before the page is left. Return false to stay (the page says why, e.g. a save failed). */
  beforeLeave?: () => Promise<boolean>;
  /** Whether Ctrl/Cmd+Shift+O may open the switcher now (no dialog on top). Defaults to always. */
  canOpenSwitcher?: () => boolean;
  /** The Wiki's Worlds button in the switcher. */
  onWorlds?: () => void;
  /** On a phone the places get their own row. A page that needs the height (a map) can leave them to the switcher. */
  phonePlaces?: boolean;
  /** On a phone the trail is hidden unless the page needs it there (the Wiki's menu button and breadcrumb): then it gets a row of its own. */
  phoneTrail?: boolean;
  /** Notifications for the campaigns you run. Off for a page a member opened. */
  bell?: boolean;
  className?: string;
};

export default function CampaignBar({ tool, campaign: ref, name, trail, actions, onPick, beforeLeave, canOpenSwitcher, onWorlds, phonePlaces = true, phoneTrail = false, bell = true, className = "" }: CampaignBarProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null), [open, setOpen] = useState(false);
  useEffect(() => { let live = true; void loadCampaigns().then(l => { if (live) setLoaded(l); }); return () => { live = false; }; }, []);
  const refKey = JSON.stringify(ref);
  const current = useMemo<BarCampaign | null>(() => {
    if (!loaded) return null;
    const own = loaded.rows.find(r => matchesRef(ownCampaign(r), ref));
    if (own) return ownCampaign(own);
    const joined = loaded.joined.find(j => matchesRef(memberCampaign(j), ref));
    return joined ? memberCampaign(joined) : null;
  }, [loaded, refKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const places = useMemo(() => current ? campaignToolLinks(current) : [], [current]);
  useCampaignSwitcherShortcut(() => { if (canOpenSwitcher?.() ?? true) setOpen(true); });

  async function go(href: string) {
    if (beforeLeave && !(await beforeLeave())) return;
    window.location.assign(href);
  }
  const follow = (href: string) => (e: ReactMouseEvent) => { if (beforeLeave && unmodified(e)) { e.preventDefault(); void go(href); } };
  const title = current?.name ?? name ?? "Campaign";
  const member = current?.kind === "member";

  return <header className={`campaign-bar${phonePlaces ? "" : " campaign-bar--no-phone-places"}${phoneTrail ? " campaign-bar--phone-trail" : ""} ${className}`}>
    <Link href="/" className="cbar-mark" aria-label="RPG Tools home" title="RPG Tools home" onClick={beforeLeave ? follow("/") : undefined}><span className="tool-switch-mark" aria-hidden="true" /></Link>
    <CampaignSwitcher variant="bar" className="cbar-switcher" tool={tool} title={title} subtitle={member ? `Run by ${current.joined.ownerName || "the GM"}` : current?.world}
      isCurrent={c => matchesRef(c, ref)} onPick={onPick} places={places} onWorlds={onWorlds} open={open} onOpenChange={setOpen} beforeLeave={beforeLeave} />
    <nav className="cbar-places" aria-label={`${title}: places`}>
      {/* Full-page links: Maptable, the Wiki and the Forum each have their own layout. */}
      {current ? places.map(p => p.href
        ? <a key={p.tool} href={p.href} aria-current={p.tool === tool ? "page" : undefined} onClick={follow(p.href)}>{p.name}</a>
        : p.add ? <a key={p.tool} href={p.add} className="cbar-add" title={`${title} has no ${p.name} yet`} onClick={follow(p.add)}><Plus size={13} aria-hidden="true" />{p.name}</a> : null)
        // Until the campaign list arrives: the page's own tab, so the bar doesn't jump.
        : <span className="cbar-wait" aria-hidden="true">{["dashboard", "maptable", "encyclopedia", "forum"].map(t => <span key={t} className={t === tool ? "cur" : ""}>{t === "encyclopedia" ? "Wiki" : t[0].toUpperCase() + t.slice(1)}</span>)}</span>}
    </nav>
    {trail && <div className="cbar-trail">{trail}</div>}
    <div className="cbar-end">
      {actions}
      {bell && !member && <NotificationBell />}
      <AccountLink />
    </div>
  </header>;
}
