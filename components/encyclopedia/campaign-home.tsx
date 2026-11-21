"use client";
/*
 * The Wiki's front page for a campaign (or a world, with no campaign open): the hero with the campaign's banner
 * picture behind its name, a strip into the main sections, what changed lately, active quests and the world's lore.
 *
 * The GM changes the banner right here (Banner, or a picture dropped on the hero); it's the campaign's look
 * (campaign.look.banner), the same one Look and the Admin CP's Banner tab set. A live campaign theme draws its own art
 * in the hero; a banner picture takes its place.
 */
import { useCallback, useEffect, useRef, useState, type ComponentType, type DragEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, Flag, Goal, ImagePlus, Map as MapIcon, Move, Palette, Plus, RotateCcw, ScrollText, Settings, Trash2, Users } from "lucide-react";
import type { Campaign, Entry, Workspace, World } from "@/lib/encyclopedia/world-model";
import type { Look } from "@/lib/encyclopedia/look";
import { column, nextStep, questProgress } from "@/lib/encyclopedia/quests";
import { uploadMapImage } from "./map-transfer";
import { usePopover } from "./page-look";
import { openThemeEditor } from "../campaign-theme-dock";
import { useHeroPicture } from "./look-section";
import { BannerZoom, useBannerDrag } from "../banner-frame";
import { cleanFraming } from "@/lib/banner-frame";
import "./campaign-home.css";

type Kind = Entry["kind"];
type Section = "characters" | "quests" | "maps";
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** "3 days ago", from an ISO time. */
export function updatedAgo(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s > -45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of [["minute", 60], ["hour", 3600], ["day", 86400], ["week", 604800], ["month", 2629800], ["year", 31557600]] as const) {
    const next = { minute: 3600, hour: 86400, day: 604800, week: 2629800, month: 31557600, year: Infinity }[unit];
    if (-s < next) return rtf.format(Math.round(s / size), unit);
  }
  return "";
}

export function CampaignHome({ data, world, campaign, worldId, scope, shown, linkedWorlds, gm, icons, labels, excerpt, onOpen, onNew, onEdit, onExplore, onCampaign, onNewCampaign, onSection, onUnlink, setLook }: {
  data: Workspace; world: World; campaign: Campaign | null; worldId: string;
  /** Pages in this campaign (or the world's own lore, with no campaign open). */
  scope: Entry[];
  /** Everything readable here: the campaign's pages and the lore it uses. */
  shown: Entry[];
  linkedWorlds: World[];
  /** Whoever is looking may change the campaign's details and look (not a co-GM). */
  gm: boolean;
  icons: Record<Kind, ComponentType<{ size?: number }>>; labels: Record<Kind, string>;
  excerpt: (e: Entry) => string;
  onOpen: (id: string) => void; onNew: (kind?: Kind, shared?: boolean) => void; onEdit: () => void; onExplore: () => void;
  onCampaign: (id: string) => void; onNewCampaign: () => void; onSection: (s: Section) => void; onUnlink: (worldId: string) => void;
  setLook: (look: Look | undefined) => void;
}) {
  const pages = (list: Entry[]) => list.filter(e => e.kind !== "folder");
  const recent = pages(scope).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const lore = pages(shown.filter(e => e.campaignId === null)).sort((a, b) => Number(a.worldId !== worldId) - Number(b.worldId !== worldId) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const active = campaign ? column(data, worldId, campaign.id, "active") : [];
  const sessions = pages(scope).filter(e => e.kind === "session").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const count = (kind: Kind) => shown.filter(e => e.kind === kind).length;
  const campaigns = data.campaigns.filter(c => c.worldId === worldId);
  const tiles: { id: string; Icon: ComponentType<{ size?: number }>; label: string; sub: string; go: () => void }[] = [
    { id: "characters", Icon: Users, label: "Characters", sub: count("character") ? plural(count("character"), "page") : "Add a character", go: () => onSection("characters") },
    ...(campaign ? [
      { id: "quests", Icon: Goal, label: "Quests", sub: active.length ? `${active.length} active` : "None active", go: () => onSection("quests") },
      { id: "sessions", Icon: ScrollText, label: "Sessions", sub: sessions.length ? plural(sessions.length, "recap") : "Write the first recap", go: () => sessions[0] ? onOpen(sessions[0].id) : onNew("session") },
    ] : [
      { id: "campaigns", Icon: Flag, label: "Campaigns", sub: campaigns.length ? plural(campaigns.length, "campaign") : "Begin a campaign", go: () => campaigns[0] ? onCampaign(campaigns[0].id) : onNewCampaign() },
    ]),
    { id: "maps", Icon: MapIcon, label: "Maps", sub: count("map") ? plural(count("map"), "map") : "Add a map", go: () => onSection("maps") },
  ];
  const icon = (kind: Kind) => { const I = icons[kind]; return <I size={16} />; };

  return <section className="page-content dashboard campaign-home">
    <Hero world={world} campaign={campaign} linkedWorlds={linkedWorlds} gm={gm} onEdit={onEdit} onUnlink={onUnlink} setLook={setLook} />

    <nav className="home-shelf" aria-label="Sections">{tiles.map(t => <button key={t.id} className="home-shelf-item" onClick={t.go}>
      <t.Icon size={18} />
      <span className="home-shelf-text"><span className="home-shelf-label">{t.label}</span><small>{t.sub}</small></span>
      <ChevronRight size={15} className="home-shelf-go" />
    </button>)}</nav>

    <div className="home-columns">
      <div className="home-main">
        <div className="section-heading home-heading"><h2>{campaign ? "Pick up the story" : "Recently written"}</h2><button className="button small home-add" onClick={() => onNew()}><Plus size={14} /> New page</button></div>
        {recent.length ? <ul className="home-recent">{recent.map(e => <li key={e.id}><button onClick={() => onOpen(e.id)}>
          <span className={`entry-icon ${e.kind}`}>{icon(e.kind)}</span>
          <span className="home-recent-text"><strong>{e.title}</strong><span className="home-recent-meta">{labels[e.kind]}<span aria-hidden="true"> · </span>edited {updatedAgo(e.updatedAt)}</span>{excerpt(e) && <span className="home-recent-excerpt">{excerpt(e)}</span>}</span>
          <ChevronRight size={16} className="home-go" />
        </button></li>)}</ul>
          : <div className="home-empty">
            <p><strong>{campaign ? "Nothing written for this campaign yet." : `Nothing written for ${world.name} yet.`}</strong> Start with whatever is on your mind.</p>
            <div className="home-starters">{(campaign ? [["session", "Session recap"], ["character", "Character"], ["place", "Place"], ["quest", "Quest"]] as const : [["place", "Place"], ["character", "Character"], ["faction", "Organization"], ["lore", "Lore"]] as const).map(([kind, label]) =>
              <button key={kind} className="button small home-add" onClick={() => onNew(kind, !campaign)}>{icon(kind)} {label}</button>)}</div>
          </div>}
      </div>

      <aside className="home-side">
        {campaign && <div className="home-block">
          <div className="section-heading home-heading"><h2>Active quests</h2><button className="text-button" onClick={() => onSection("quests")}>Quest board <ArrowUpRight size={14} /></button></div>
          {active.length ? <ul className="home-quests">{active.slice(0, 4).map(({ entry: e, quest: q }) => { const p = questProgress(q), step = nextStep(q); return <li key={e.id}><button onClick={() => onOpen(e.id)}>
            <strong>{e.title}</strong>
            {step && <span className="home-quest-step">Next: {step}</span>}
            {p.total > 0 && <span className="home-quest-progress"><span className="home-meter" aria-hidden="true"><i style={{ width: `${Math.round(p.done / p.total * 100)}%` }} /></span>{p.done} of {plural(p.total, "goal")}</span>}
          </button></li>; })}</ul>
            : <p className="home-quiet">No quests in progress. <button className="text-button home-add" onClick={() => onNew("quest")}>Add a quest</button></p>}
          {active.length > 4 && <button className="text-button home-more" onClick={() => onSection("quests")}>{plural(active.length - 4, "more active quest")}</button>}
        </div>}

        {campaign ? <div className="home-block">
          <div className="section-heading home-heading"><h2>World lore</h2><button className="text-button" onClick={onExplore}>{world.name} <ArrowUpRight size={14} /></button></div>
          {lore.length ? <ul className="home-lore">{lore.map(e => <li key={e.id}><button onClick={() => onOpen(e.id)}>{icon(e.kind)}<span>{e.title}<small>{labels[e.kind]}{e.worldId !== worldId ? ` from ${data.worlds.find(w => w.id === e.worldId)?.name ?? "a linked world"}` : ""}</small></span><ChevronRight size={15} className="home-go" /></button></li>)}</ul>
            : <p className="home-quiet">Places, people and history every campaign in {world.name} shares. <button className="text-button home-add" onClick={() => onNew("lore", true)}>Add world lore</button></p>}
        </div> : <div className="home-block">
          <div className="section-heading home-heading"><h2>Campaigns</h2><button className="text-button home-add" onClick={onNewCampaign}>Begin another <Plus size={14} /></button></div>
          {campaigns.length ? <ul className="home-lore">{campaigns.map(c => <li key={c.id}><button onClick={() => onCampaign(c.id)}><Flag size={16} /><span>{c.name}<small>{plural(data.entries.filter(e => e.campaignId === c.id && e.kind !== "folder").length, "page")}</small></span><ChevronRight size={15} className="home-go" /></button></li>)}</ul>
            : <p className="home-quiet">No campaigns in {world.name} yet.</p>}
        </div>}
      </aside>
    </div>
  </section>;
}

/** The campaign's name over its banner picture, with the GM's Banner and details buttons. */
function Hero({ world, campaign, linkedWorlds, gm, onEdit, onUnlink, setLook }: {
  world: World; campaign: Campaign | null; linkedWorlds: World[]; gm: boolean; onEdit: () => void; onUnlink: (id: string) => void; setLook: (look: Look | undefined) => void;
}) {
  const look = campaign?.look, banner = look?.banner;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [dropping, setDropping] = useState(false);
  // Reposition: the hero itself becomes the frame. Drag the picture, zoom it, then Save or Cancel.
  const [framing, setFraming] = useState<NonNullable<Look["banner"]> | null>(null);
  const hero = useHeroPicture(look, undefined, framing), drag = useBannerDrag(framing, hero.box, setFraming);
  const heroEl = useRef<HTMLDivElement | null>(null), heroRef = hero.ref;
  const setHeroEl = useCallback((el: HTMLDivElement | null) => { heroEl.current = el; heroRef(el); }, [heroRef]);
  useEffect(() => { if (framing) heroEl.current?.focus({ preventScroll: true }); }, [framing !== null]); // eslint-disable-line react-hooks/exhaustive-deps -- focus once, when Reposition starts
  const box = usePopover(open, setOpen), file = useRef<HTMLInputElement>(null);
  const canBanner = gm && !!campaign;
  const set = (next: Look["banner"]) => { const l: Look = { ...look, banner: next }; if (!next) delete l.banner; setLook(Object.keys(l).length ? l : undefined); };
  async function upload(f: File) {
    if (!PICTURE_TYPES.includes(f.type)) { setError("Choose a PNG, JPEG or WebP picture."); setOpen(true); return; }
    setBusy(true); setError("");
    try { const image = await uploadMapImage(f); set({ imageId: image.imageId, width: image.imageWidth, height: image.imageHeight, y: .5 }); }
    catch (e) { setError(e instanceof Error ? e.message : "The picture could not be uploaded."); setOpen(true); }
    finally { setBusy(false); }
  }
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const drop = canBanner ? {
    onDragOver: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropping(true); },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); },
    onDrop: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); setDropping(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); },
  } : {};

  const stopFraming = () => setFraming(null);
  const saveFraming = () => { if (framing) set(cleanFraming(framing)); setFraming(null); };
  const centred = framing && cleanFraming({ ...framing, x: .5, y: .5, zoom: 1 });
  const framingKeys = framing ? {
    tabIndex: 0, role: "application", "aria-label": "Banner picture: drag to move it, or use the arrow keys; + and − zoom. Enter saves, Escape cancels.",
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") { e.preventDefault(); stopFraming(); }
      else if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); saveFraming(); }
      else drag.handlers.onKeyDown?.(e);
    },
  } : {};

  return <div className="home-hero-wrap" ref={box}>
    <div ref={setHeroEl} className={`dashboard-intro home-hero ${hero.className}${dropping ? " is-dropping" : ""}${framing ? " is-framing" : ""}${drag.dragging ? " is-dragging" : ""}`} style={hero.style}
      {...(framing ? { ...drag.handlers, ...framingKeys } : drop)}>
      <div className="home-hero-text">
        <span className="eyebrow">{campaign ? world.name : "World"}</span>
        <h1>{campaign?.name ?? world.name}</h1>
        {(campaign?.description ?? world.description) && <p className="subtitle">{campaign?.description ?? world.description}</p>}
        {campaign && linkedWorlds.length > 0 && <p className="linked-worlds"><span>Also uses lore from:</span> {linkedWorlds.map(w => <span className="chip" key={w.id}>{w.name}<button aria-label={`Stop using lore from ${w.name}`} title="Stop showing this lore here" onClick={() => onUnlink(w.id)}>×</button></span>)}</p>}
      </div>
      {framing && <>
        <span className="home-frame-hint" aria-hidden="true"><Move size={14} /> Drag the picture to move it</span>
      </>}
      {gm && !framing && <div className="home-hero-actions">
        {canBanner && <button className="icon-button hero-action hero-banner-button" aria-expanded={open} aria-haspopup="dialog" aria-label={banner ? "Banner picture" : "Add a banner picture"} title={banner ? "Change the banner picture" : "Add a banner picture"} onClick={() => setOpen(!open)}><ImagePlus size={17} /><span>{busy ? "Uploading…" : banner ? "Banner" : "Add banner"}</span></button>}
        <button className="icon-button hero-action" title="Edit name and description" aria-label="Edit name and description" onClick={onEdit}><Settings size={17} /></button>
      </div>}
      {dropping && <span className="home-hero-drop" aria-hidden="true">Drop to use as the banner</span>}
    </div>
    {framing && <div className="home-frame-bar" role="group" aria-label="Reposition the banner">
        <BannerZoom banner={framing} onChange={setFraming} className="home-frame-zoom" />
        <button type="button" className="hero-action home-frame-reset" title="Centre the picture with no zoom" disabled={JSON.stringify(cleanFraming(framing)) === JSON.stringify(centred)} onClick={() => centred && setFraming(centred)}><RotateCcw size={14} aria-hidden="true" /><span>Reset</span></button>
        <button type="button" className="hero-action" onClick={stopFraming}>Cancel</button>
        <button type="button" className="hero-action home-frame-save" onClick={saveFraming}><Check size={15} aria-hidden="true" />Save position</button>
      </div>}
    {open && canBanner && <div className="home-banner-pop" role="dialog" aria-label="Banner picture">
      {banner ? <>
        <p className="home-pop-hint">Drag the picture right in the banner to choose what stays in view, and zoom in to show less of it.</p>
        <button type="button" className="button small primary home-reposition" onClick={() => { setOpen(false); setFraming(banner); }}><Move size={14} aria-hidden="true" /> Reposition and zoom</button>
        <div className="button-row"><button className="button small" disabled={busy} onClick={() => file.current?.click()}><ImagePlus size={14} /> {busy ? "Uploading…" : "Replace"}</button><button className="button small" onClick={() => { set(undefined); setOpen(false); }}><Trash2 size={14} /> Remove</button></div>
      </> : <button type="button" className="look-banner-empty home-banner-empty" disabled={busy} onClick={() => file.current?.click()}><ImagePlus size={20} /><span><strong>{busy ? "Uploading…" : "Upload a picture"}</strong><small>Wide pictures work best. PNG, JPEG or WebP up to 8 MB. You can also drop one on the banner.</small></span></button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="home-pop-hint home-pop-foot"><span>The same banner shows on the dashboard, the player site and the forum.</span>
        <button type="button" className="text-button" onClick={() => { setOpen(false); openThemeEditor(); }}><Palette size={13} /> Theme in the Admin CP</button></p>
    </div>}
    <input ref={file} type="file" accept={PICTURE_TYPES.join(",")} hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
  </div>;
}
