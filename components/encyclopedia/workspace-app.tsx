"use client";
import { readRemembered, remember } from "@/lib/navigation-state";
import SaveChip from "../save-chip";
import { altStep } from "../folder-reorder";
import { useAutosave } from "../use-autosave";
import { writingKinds, type WritingKind } from "@/lib/encyclopedia/ai-styles";
import { mergeWorkspaces } from "@/lib/encyclopedia/merge";
import { coGmRefusal } from "@/lib/encyclopedia/co-gm-edit";
import { withoutDeletedStats } from "@/lib/encyclopedia/stat-arrange";
import { useState, useEffect, useRef, type CSSProperties, type ReactNode, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { useIdlePreload } from "@/lib/idle-preload";
import { ArrowLeftRight, Bot, Network, Backpack, UserRound, LayoutTemplate, LayoutDashboard, CalendarDays, Map as MapIcon, Compass, Plus, Search, ChevronRight, ChevronDown, Users, Flag, ScrollText, ListChecks, Check, Download, Upload, Settings, GitBranch as Github, ArrowUpRight, Menu, X, Archive, Pencil, Globe, PanelLeftClose, PanelLeftOpen, LoaderCircle, Dices, Goal, Library, Palette, Sparkles, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUpDown, GripVertical } from "lucide-react";
import type { CampaignRow } from "@/lib/campaign-links";
import { emptyWorkspace, demoWorkspace, newId, workspaceSchema, campaignExport, importCopy, resolveLink, visibleEntries, linkedLoreWorldIds, setWorldLink, defaultCharacter, playerCampaign, searchableText, compareEntries, reorderEntry, folderPath, type Workspace, type Entry } from "@/lib/encyclopedia/world-model";
import { descendantCount, dropProblem, movePage, type DropPlace } from "@/lib/encyclopedia/page-tree";
import {FogImageSync} from "./fog-image-sync";
import {ContentTransfer} from "./content-transfer";
import {WorkspaceDashboard} from "./workspace-dashboard";
import {useNavigationSections,useSidebarLayout,SidebarResize} from "./sidebar-controls";
import {SidebarNav} from "./sidebar-nav";
import {addCategoryLink,sidebarOf,sidebarToSave,type Sidebar,type ToolId} from "@/lib/encyclopedia/sidebar";
import {ThemeToggle} from "./theme";
import {BottomBar,MoreSheet,type MoreGroup} from "./bottom-bar";
import {openDiceTray} from "@/lib/dice-open";
import ToolSwitch,{AccountLink} from "@/components/tool-switch";
import CampaignBar from "@/components/campaign-bar";
import PlayerViewBanner from "@/components/player-view-banner";
import { useViewAsPlayer } from "@/lib/view-as-player";
import { PlayerView } from "./player-view";
import { useCampaignOpened } from "@/lib/opened-campaign";
import {TagsManager} from "@/components/tags";
import type {Tag} from "@/lib/tags";
import {RollResults} from "./rolls";
import {DiscordRollsSetting} from "./discord-rolls";
import {LookSection,LookFont} from "./look-section";
import {CampaignHome} from "./campaign-home";
import {BANNER_CHANGED} from "../campaign-theme-entry";
import { pageIcon } from "./page-icons";
import {lookAttributes} from "@/lib/encyclopedia/look";
import Breadcrumbs,{type Crumb} from "@/components/breadcrumbs";
import {placeFromQuery,placeQuery,isNewPlace,defaultTab,themeCampaignId,type Place} from "@/lib/encyclopedia/place";
import {encyclopediaTitle} from "@/lib/page-title";
import {usePageTitle} from "../use-page-title";
import {useDiceTarget} from "../use-dice-target";
import {OPEN_CHAT_EVENT} from "@/lib/ai/chat-text";
import {encyclopediaDiceTarget,NO_CAMPAIGN} from "@/lib/dice-target";
import { confirmDialog } from "../confirm-dialog";
import {pageFromTemplate,saveTemplate,templatesFor,type FieldValue} from "@/lib/encyclopedia/templates";
import {defaultOrg} from "@/lib/encyclopedia/org-profile";
import {defaultProfile} from "@/lib/encyclopedia/character-profile";
import {KIND_ICONS,TypePicker,NewTypeForm} from "./entry-types";
import {KIND_LABELS} from "@/lib/encyclopedia/entry-kinds";
import {kindStarts} from "@/lib/encyclopedia/entry-type";
import type {PageTemplate} from "@/lib/encyclopedia/world-model";
import {memberHtml,memberReadOnly,memberRef,memberRefFromHash,setMemberEdit,setMemberHtml,setMemberRef,uploaded,workspaceUrl} from "./member-view";
import Link from "next/link";
import {endPageDrag,startPageDrag} from "./page-drag";
import {orgListItems} from "@/lib/encyclopedia/org-holdings";
import {useCampaignSkin} from "../campaign-skin";
import {useThemeDock} from "../campaign-theme-dock";

// Sections, the article editor, the dialogs (AI, backups, item settings, templates) and the AI activity
// button load as separate chunks so the dashboard appears sooner; they are fetched while the browser is idle, so opening one is still instant.
const lazyParts = {
  CalendarSection: () => import("./calendar-section").then(m => ({ default: m.CalendarSection })),
  MapsSection: () => import("./maps-section").then(m => ({ default: m.MapsSection })),
  ArticleEditor: () => import("./article-editor").then(m => ({ default: m.ArticleEditor })),
  QuickSearch: () => import("./quick-search").then(m => ({ default: m.QuickSearch })),
  RandomTablesSection: () => import("./random-tables").then(m => ({ default: m.RandomTablesSection })),
  QuestsSection: () => import("./quests-section").then(m => ({ default: m.QuestsSection })),
  CodexSection: () => import("./codex-section").then(m => ({ default: m.CodexSection })),
  RelationshipsSection: () => import("./relationships-section").then(m => ({ default: m.RelationshipsSection })),
  CharactersSection: () => import("./character-tools").then(m => ({ default: m.CharactersSection })),
  StatFormBuilder: () => import("./character-tools").then(m => ({ default: m.StatFormBuilder })),
  PlayerSharing: () => import("./character-tools").then(m => ({ default: m.PlayerSharing })),
  AiConnectionDialog: () => import("./ai-connection").then(m => ({ default: m.AiConnectionDialog })),
  AiWritingDialog: () => import("./ai-writing").then(m => ({ default: m.AiWritingDialog })),
  TemplatesSection: () => import("./templates").then(m => ({ default: m.TemplatesSection })),
  TemplateFields: () => import("./templates").then(m => ({ default: m.TemplateFields })),
  ItemSettingsDialog: () => import("./item-settings").then(m => ({ default: m.ItemSettingsDialog })),
  BackupsSheet: () => import("../rp-backups").then(m => ({ default: m.BackupsSheet })),
  BridgeAccess: () => import("./bridge-access"),
  EncyclopediaAgentAccess: () => import("./agent-access"),
  AiActivity: () => import("./ai-activity").then(m => ({ default: m.AiActivity })),
};
const CalendarSection = dynamic(lazyParts.CalendarSection);
const MapsSection = dynamic(lazyParts.MapsSection);
const ArticleEditor = dynamic(lazyParts.ArticleEditor);
const QuickSearch = dynamic(lazyParts.QuickSearch);
const RandomTablesSection = dynamic(lazyParts.RandomTablesSection);
const QuestsSection = dynamic(lazyParts.QuestsSection);
const CodexSection = dynamic(lazyParts.CodexSection);
const RelationshipsSection = dynamic(lazyParts.RelationshipsSection);
const CharactersSection = dynamic(lazyParts.CharactersSection);
const StatFormBuilder = dynamic(lazyParts.StatFormBuilder);
const PlayerSharing = dynamic(lazyParts.PlayerSharing);
const AiConnectionDialog = dynamic(lazyParts.AiConnectionDialog);
const AiWritingDialog = dynamic(lazyParts.AiWritingDialog);
const TemplatesSection = dynamic(lazyParts.TemplatesSection);
const TemplateFields = dynamic(lazyParts.TemplateFields);
const ItemSettingsDialog = dynamic(lazyParts.ItemSettingsDialog);
const BackupsSheet = dynamic(lazyParts.BackupsSheet);
const BridgeAccess = dynamic(lazyParts.BridgeAccess);
const EncyclopediaAgentAccess = dynamic(lazyParts.EncyclopediaAgentAccess);
const AiActivity = dynamic(lazyParts.AiActivity);
const preloadParts = Object.values(lazyParts);
const PLACE_KEY = "encyclopedia:place";
const icons = KIND_ICONS;
const labels = KIND_LABELS;
type Modal = {
    type: "world" | "campaign" | "entry" | "settings" | "library" | "rename" | "connections";
    id?: string;
    name?: string;
    /** New entry: the page it goes inside. */
    parent?: string;
    /** New entry: the kind to start with, and whether it's shared world lore. */
    kind?: Entry["kind"];
    shared?: boolean;
    /** New entry from a sidebar category's +: the GM type to start with, and the category it should show in. */
    templateId?: string; category?: string;
};
function excerpt(e: Entry, s: Workspace) { return e.body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? resolveLink(s, e, target)?.title ?? target).replace(/^[ \t]*- \[[ xX]\] /gm, "").replace(/[#*`]/g, "").replace(/\s+/g, " ").trim().slice(0, 150); }
function download(value: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
/** A co-GM in someone else's campaign: whose it is and their role, for the bar at the top. */
type CoGm = { ownerName: string; role: string; campaignId: string; edit?: boolean; maps?: boolean; html?: boolean };
const CO_GM_READ_ONLY = "The GM has set your group to read this campaign, not edit it.";
export default function WorkspaceApp() {
  useIdlePreload(preloadParts);
    const [member, setMember] = useState<CoGm | null>(null);
    const [arranging, setArranging] = useState(false);
    // Switch to Player view (the account menu): the open campaign as its players read it.
    const asPlayer = useViewAsPlayer();
    const [data, setData] = useState<Workspace>(emptyWorkspace), [loaded, setLoaded] = useState(false), [signedOut, setSignedOut] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("Loading"), [worldId, setWorldId] = useState(""), [campaignId, setCampaignId] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null), [query, setQuery] = useState(""), [editing, setEditing] = useState(false), [modal, setModal] = useState<Modal | null>(null), [palette, setPalette] = useState(false), [paletteTags, setPaletteTags] = useState<string[]>([]), [tagsOpen, setTagsOpen] = useState(false), [aiOpen, setAiOpen] = useState(false), [writing, setWriting] = useState<WritingKind | "chat" | "extract" | null>(null), [mobile, setMobile] = useState(false), [moreOpen, setMoreOpen] = useState(false), [closed, setClosed] = useState<Set<string>>(new Set), [toast, setToast] = useState(""), [dragging, setDragging] = useState<string | null>(null), [dropAt, setDropAt] = useState<{ id: string; place: DropPlace } | null>(null);
    const sidebar=useSidebarLayout(),navigation=useNavigationSections();
    const pagesBtn = useRef<HTMLButtonElement>(null), moreBtn = useRef<HTMLButtonElement>(null), drawerWas = useRef(false);
    // Phone page sheet: focus moves into it when it opens and back to the Pages button when it closes.
    useEffect(() => { if (!sidebar.narrow) return; if (mobile) document.querySelector<HTMLElement>("#workspace-sidebar .sidebar-mobile-close")?.focus(); else if (drawerWas.current) pagesBtn.current?.focus(); drawerWas.current = mobile; }, [mobile, sidebar.narrow]);
    const [castRole,setCastRole]=useState<'pc'|'companion'|'npc'|'creature'>('pc');
    const [view,setView]=useState<"dashboard"|"overview"|"characters"|"maps"|"calendar"|"tables"|"templates"|"quests"|"codex"|"relationships"|"look">("dashboard"),[tool,setTool]=useState<"form"|"share"|"items"|"transfer"|null>(null),[tablesHome,setTablesHome]=useState(0),[tabAt,setTabAt]=useState<{entry:string;tab:string}|null>(null);
    const lastPlace = useRef<Place | null>(null);
    // A remembered tab belongs to the page it was chosen on; opening another page forgets it.
    if (tabAt && tabAt.entry !== selected) setTabAt(null);
    const [backups, setBackups] = useState(false);
    const current = useRef(data), base = useRef(data), etag = useRef<string | null>(null), conflicts = useRef(0), revision = useRef(0), version = useRef(0), savedVersion = useRef(0), busy = useRef(false), blocked = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null), fileInput = useRef<HTMLInputElement>(null);
    const world = data.worlds.find(w => w.id === worldId), campaign = data.campaigns.find(c => c.id === campaignId), entry = data.entries.find(e => e.id === selected);
    useDiceTarget(loaded && !signedOut ? encyclopediaDiceTarget(campaign, !!memberRef()) : NO_CAMPAIGN);
    useCampaignOpened(loaded && !signedOut && !memberRef() && campaign ? `e:${campaign.id}` : null);
    // The campaign's live theme (lib/campaign-theme), in place of its look: the open campaign's, or on a world's own pages
    // the world's only campaign's (themeCampaignId). A co-GM asks through their member ref.
    const themed = themeCampaignId(data, { worldId, campaignId, view });
    const skinKey = signedOut ? null : !loaded ? undefined : memberRef() ? `m-${memberRef()}` : themed ? `c-${themed}` : null;
    // The Admin CP floats beside the Encyclopedia when it's opened (the Look section has the button).
    const themeDock = useThemeDock(skinKey, "encyclopedia", !memberRef());
    const skin = useCampaignSkin(skinKey, "encyclopedia", undefined, themeDock.editing);
    usePageTitle(loaded && !signedOut ? encyclopediaTitle({ entry: view === "overview" ? entry?.title : null, view, campaign: campaign?.name, world: world?.name }) : "");
    const linkedWorlds = campaign ? linkedLoreWorldIds(data, campaign).flatMap(id => data.worlds.filter(w => w.id === id)) : [], shown = visibleEntries(data, worldId, campaignId), scope = shown.filter(e => e.campaignId === campaignId), articles = shown.filter(e => e.kind !== "folder");
    const searchResults = articles.filter(e => searchableText(e).toLowerCase().includes(query.toLowerCase()));
    const linkQuery = useRef<URLSearchParams | null>(null);
    async function load() { try {
        setMemberRef(memberRefFromHash());
        const res = await fetch(workspaceUrl());
        const body = await res.json() as {
            error?: string;
            data: unknown;
            revision: number;
            etag?: string | null;
            member?: CoGm;
        };
        if (res.status === 401) {
            setSignedOut(true);
            return;
        }
        if (!res.ok)
            throw new Error(body.error);
        const checked = workspaceSchema.parse(body.data);
        current.current = checked;
        setData(checked);
        revision.current = body.revision;
        base.current = checked;
        etag.current = body.etag ?? null;
        const first = checked.worlds.find(w => !w.archived&&!w.isTemplate) ?? checked.worlds.find(w=>!w.isTemplate);
        // The address says where you were (?entry=, ?campaign=, ?world=&view=), so a refresh or Back returns there.
        // Links from Maptable tokens and the Campaigns page use the same address. Without one, the last place is used (this tab's, else this browser's).
        // Read the address once: a second load must not lose it.
        const query = (linkQuery.current ??= new URLSearchParams(window.location.search));
        // ?styles=story (from the Campaigns page's The story so far) opens How the AI writes.
        const styles = query.get("styles");
        if (styles) setWriting([...writingKinds, "chat", "extract"].includes(styles) ? styles as WritingKind | "chat" | "extract" : "recap");
        // ?ai=connect (from the dashboard's AI widget and the AI button on other pages) opens Connect an AI.
        if (query.get("ai") === "connect") setAiOpen(true);
        // A co-GM opens the one campaign they were let into.
        const shared = body.member ? checked.campaigns.find(c => c.id === body.member!.campaignId) : undefined;
        if (body.member && shared) {
            setMember(body.member); setMemberEdit(!!body.member.edit); setMemberHtml(body.member.html !== false);
            const place = placeFromQuery(query, checked);
            setWorldId(shared.worldId); setCampaignId(shared.id); setView(place?.view ?? "overview"); setSelected(place?.entryId ?? null); setTabAt(place?.entryId && place.tab ? { entry: place.entryId, tab: place.tab } : null);
            setLoaded(true); setStatus(body.member.edit ? "All changes saved" : "Read only");
            return;
        }
        let stored: URLSearchParams | null = null;
        stored = new URLSearchParams(readRemembered(PLACE_KEY) ?? "");
        const place = placeFromQuery(query, checked) ?? (stored ? placeFromQuery(stored, checked) : null);
        if (place) { setWorldId(place.worldId); setCampaignId(place.campaignId); setView(place.view); setSelected(place.entryId); setTabAt(place.entryId && place.tab ? { entry: place.entryId, tab: place.tab } : null); }
        else { setWorldId(first?.id ?? ""); setCampaignId(null); }
        setLoaded(true);
        setStatus("All changes saved");
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not load");
    } }
    useEffect(() => { load(); const leave = (e: BeforeUnloadEvent) => { if (version.current !== savedVersion.current) {
        e.preventDefault();
    } }; window.addEventListener("beforeunload", leave); return () => { window.removeEventListener("beforeunload", leave); if (timer.current)
        clearTimeout(timer.current); }; }, []);
    // The address always names the open page, tab or view, so it can be bookmarked or shared. A different page or view is a new history entry (Back and Forward work); a tab switch only replaces.
    useEffect(() => {
        if (!loaded) return;
        const entryId = view === "overview" ? selected : null, open = entryId ? current.current.entries.find(e => e.id === entryId) : undefined, kind = open?.kind;
        const tab = entryId && tabAt?.entry === entryId && tabAt.tab !== defaultTab(kind ?? "") ? tabAt.tab : null;
        const place: Place = { worldId, campaignId, view, entryId, tab };
        const search = placeQuery(place, open ? open.campaignId ?? null : undefined);
        if (!memberRef()) remember(PLACE_KEY, search);
        if (search !== window.location.search) {
            const url = window.location.pathname + search + window.location.hash;
            if (lastPlace.current && isNewPlace(lastPlace.current, place)) window.history.pushState(window.history.state, "", url);
            else window.history.replaceState(window.history.state, "", url);
        }
        lastPlace.current = place;
    }, [loaded, worldId, campaignId, view, selected, tabAt]);
    // Back and Forward return to the place named by the address.
    useEffect(() => {
        if (!loaded) return;
        const back = () => {
            const place = placeFromQuery(new URLSearchParams(window.location.search), current.current);
            if (!place) {
                // The address names a page that is gone: show the campaign (or world) it was in, and make the address say so.
                const last = lastPlace.current, fallback: Place | null = last && { ...last, view: last.campaignId ? "overview" : "dashboard", entryId: null, tab: null };
                setSelected(null); setTabAt(null); setEditing(false); if (fallback) setView(fallback.view);
                if (fallback) window.history.replaceState(window.history.state, "", window.location.pathname + placeQuery(fallback) + window.location.hash);
                return;
            }
            if (!memberRef()) { setWorldId(place.worldId); setCampaignId(place.campaignId); }
            setView(place.view); setSelected(place.entryId); setEditing(false); setQuery("");
            setTabAt(place.entryId && place.tab ? { entry: place.entryId, tab: place.tab } : null);
        };
        window.addEventListener("popstate", back);
        return () => window.removeEventListener("popstate", back);
    }, [loaded]);
    useEffect(() => { if (toast) {
        const t = setTimeout(() => setToast(""), 4000);
        return () => clearTimeout(t);
    } }, [toast]);
    // Save automatically (per device, shared with Maptable), the edits waiting for a save and when the last one landed.
    const autosave = useAutosave();
    const [unsaved, setUnsaved] = useState(0), [lastSaved, setLastSaved] = useState<Date | null>(null);
    /** Save now: the chip, its menu and Ctrl/Cmd+S. A failed save is tried again. */
    function saveNow() { if (blocked.current) { blocked.current = false; setError(""); } if (timer.current) clearTimeout(timer.current); void save(); }
    function setAutosave(on: boolean) { autosave.set(on); if (on && version.current !== savedVersion.current) saveNow(); }
    const saveNowRef = useRef(saveNow);
    useEffect(() => { saveNowRef.current = saveNow; });
    useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); saveNowRef.current(); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
    async function save() { if (memberReadOnly() || busy.current || blocked.current || version.current === savedVersion.current)
        return; busy.current = true; let again = false; const sent = version.current, payload = current.current; setStatus("Saving…"); try {
        const response = await fetch(workspaceUrl(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: payload, revision: revision.current }) });
        const value = await response.json() as {
            error?: string;
            revision: number;
            etag?: string | null;
        };
        // Saved somewhere else since (an AI connection, another tab): join the two and save again.
        if (response.status === 409 && conflicts.current < 3) { conflicts.current++; if (await pull()) { again = true; return; } }
        if (!response.ok)
            throw new Error(value.error ?? "Save failed");
        conflicts.current = 0;
        revision.current = value.revision;
        etag.current = value.etag ?? null;
        base.current = payload;
        savedVersion.current = sent; setUnsaved(version.current - sent); setLastSaved(new Date());
        setStatus(sent === version.current ? "All changes saved" : autosave.ref.current ? "Saving…" : "Unsaved changes");
    }
    catch (e) {
        blocked.current = true;
        setError(e instanceof Error ? e.message : "Could not save");
        setStatus("Unsaved changes");
    }
    finally {
        busy.current = false;
        // Edits made during the save follow on their own, unless Save automatically is off (a joined conflict still finishes).
        if (!blocked.current && version.current !== savedVersion.current && (again || autosave.ref.current))
            void save();
    } }
    /**
     * Takes in the latest saved copy when it changed somewhere else. Unsaved edits in this tab are joined onto it
     * page by page; when both changed the same page, this tab's version is kept and named in a toast. False when it can't.
     */
    async function pull() {
        const res = await fetch(workspaceUrl(), { cache: "no-store", headers: etag.current ? { "If-None-Match": `"${etag.current}"` } : {} });
        if (res.status === 304) return true;
        if (!res.ok) return false;
        const body = await res.json() as { data: unknown; revision: number; etag?: string | null; member?: CoGm };
        // The GM may have changed what this co-GM's group can do since the page opened.
        if (body.member && memberRef() && !!body.member.edit !== !memberReadOnly()) { setMemberEdit(!!body.member.edit); setMember(body.member); setStatus(body.member.edit ? "All changes saved" : "Read only"); }
        const theirs = workspaceSchema.safeParse(body.data);
        if (!theirs.success) return false;
        if (body.revision <= revision.current) { if (body.revision === revision.current) etag.current = body.etag ?? null; return true; }
        let next = theirs.data;
        if (version.current !== savedVersion.current) {
            const joined = mergeWorkspaces(base.current, current.current, theirs.data);
            if (!joined) return false;
            next = joined.merged;
            if (joined.both.length) setToast(`Kept your version of ${joined.both.slice(0, 3).join(", ")}${joined.both.length > 3 ? " and more" : ""}: it also changed somewhere else.`);
        }
        revision.current = body.revision; etag.current = body.etag ?? null; base.current = theirs.data;
        current.current = next; setData(next);
        return true;
    }
    /** Checks for changes made somewhere else, between saves. */
    async function poll() { if (busy.current || blocked.current || document.hidden)
        return; busy.current = true; try { await pull(); } catch { /* Try again at the next poll. */ } finally {
        busy.current = false;
        if (version.current !== savedVersion.current && autosave.ref.current) { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(save, 600); }
    } }
    const pollRef = useRef(poll);
    useEffect(() => { pollRef.current = poll; });
    // The Admin CP changed the banner picture: take in the campaign's new look now, not at the next poll.
    useEffect(() => { const again = () => void pollRef.current(); window.addEventListener(BANNER_CHANGED, again); return () => window.removeEventListener(BANNER_CHANGED, again); }, []);
    useEffect(() => { if (!loaded) return; const tick = setInterval(() => void pollRef.current(), 8000), look = () => { if (!document.hidden) void pollRef.current(); }; document.addEventListener("visibilitychange", look); window.addEventListener("focus", look); return () => { clearInterval(tick); document.removeEventListener("visibilitychange", look); window.removeEventListener("focus", look); }; }, [loaded]);
    /** Save a new workspace, or a change worked out from the latest one so changes made in the same moment don't undo each other. */
    function change(input: Workspace | ((latest: Workspace) => Workspace)) { if (memberReadOnly()) { setToast(CO_GM_READ_ONLY); return false; } const next = typeof input === 'function' ? input(current.current) : input; if (next === current.current) return true; const refused = memberRef() ? coGmRefusal(current.current, next, uploaded(), memberHtml()) : null; if (refused) { setToast(refused); return false; } const checked=workspaceSchema.safeParse(next); if(!checked.success){setToast(checked.error.issues[0].message);return false;}if(new TextEncoder().encode(JSON.stringify(next)).length>2000000){setToast("The workspace exceeds 2 MB. Export and free space before adding more content.");return false;} current.current = next; setData(next); version.current++; setUnsaved(n => n + 1); setStatus("Unsaved changes"); if (timer.current)
        clearTimeout(timer.current); timer.current = autosave.ref.current ? setTimeout(save, 600) : null; return true; }
    function updateEntry(id: string, patch: Partial<Entry>) { change({ ...current.current, entries: current.current.entries.map(e => e.id === id ? { ...e, ...patch, editedBy: undefined, updatedAt: new Date().toISOString() } : e) }); }
    /** Clicking a tag opens search with that tag, across pages, scenes and campaigns. */
    const showTag = (t: Tag) => { setPaletteTags([t.id]); setPalette(true); };
    const openSearch = () => { setPaletteTags([]); setPalette(true); };
    // The sidebar as this campaign's GM arranged it (Customize sidebar), and the arrangement being edited.
    const sidebarLayout = sidebarOf(campaign?.sidebar), [sidebarDraft, setSidebarDraft] = useState<Sidebar | null>(null), [draftFor, setDraftFor] = useState(campaignId);
    if (draftFor !== campaignId) { setDraftFor(campaignId); setSidebarDraft(null); }
    const saveSidebar = (next: Sidebar) => { if (!campaign) return; const keep = sidebarToSave(next); change(w => ({ ...w, campaigns: w.campaigns.map(c => { if (c.id !== campaign.id) return c; const rest = { ...c }; delete rest.sidebar; return keep ? { ...rest, sidebar: keep } : rest; }) })); };
    const runTool = (t: ToolId) => { setMobile(false); if (t === "form" || t === "share" || t === "items") setTool(t); else if (t === "transfer") { if (world) setTool(t); else setToast("Open a world or campaign first."); } else if (t === "dice" || t === "log") setTimeout(() => openDiceTray(t), 0); else if (t === "search") openSearch(); else if (t === "tags") setTagsOpen(true); else if (t === "ai") setAiOpen(true); else setModal({ type: "settings" }); };
    useEffect(() => { const open = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); } }; window.addEventListener("keydown", open); return () => window.removeEventListener("keydown", open); }, []);
    function showView(next: "dashboard" | "characters" | "maps" | "calendar" | "quests" | "codex" | "look") { if (next === "dashboard") { openWorlds(); return; } setView(next); setSelected(null); setQuery(""); setTool(null); setMobile(false); }
    /**
     * Picking a campaign in the switcher: the campaign's world comes along and the view stays where it makes sense
     * (Quests stays Quests). An open page falls back to the campaign's own page, and the world dashboard to the campaign.
     * Nothing is saved or discarded here; the workspace stays as it is and autosave carries on.
     */
    function switchCampaign(row: CampaignRow) {
        const next = data.campaigns.find(c => c.id === row.encyclopedia?.id);
        if (!next) { void leaveSaved().then(ok => { if (ok && row.encyclopedia) window.location.assign(`/encyclopedia?campaign=${encodeURIComponent(row.encyclopedia.id)}`); }); return; }
        setWorldId(next.worldId); setCampaignId(next.id);
        setView(v => v === "dashboard" ? "overview" : v); setSelected(null); setEditing(false); setTool(null); setQuery(""); setMobile(false);
    }
    /** Before leaving this page (a hub, the Campaigns page): save what is waiting, and stay if it cannot be saved. */
    async function leaveSaved() {
        if (memberReadOnly() || version.current === savedVersion.current) return true;
        for (let i = 0; i < 20 && busy.current; i++) await new Promise(r => setTimeout(r, 250));
        if (timer.current) clearTimeout(timer.current);
        await save();
        if (version.current === savedVersion.current) return true;
        setToast("Your changes could not be saved yet, so this page was not left. Fix the save problem or export a draft first.");
        return false;
    }
    // The Worlds page: every world, and the campaigns in the one chosen. It is not a campaign, so no campaign stays open.
    function openWorlds(){setView("dashboard");setCampaignId(null);setSelected(null);setQuery("");setTool(null);setMobile(false);}
    function selectWorld(id: string) { setView("dashboard");setTool(null); setWorldId(id); setCampaignId(null); setSelected(null); setQuery(""); setMobile(false); }
    function selectCampaign(id: string | null) { setView("overview");setTool(null); setCampaignId(id); setSelected(null); setQuery(""); setMobile(false); }
    function openEntry(id: string) { setView("overview"); setSelected(id); setQuery(""); setEditing(false); setMobile(false); }
    // The one breadcrumb trail. With a campaign open the bar above shows the campaign, so the trail starts at the section or page:
    // Overview, section or folders, page. Without one: Worlds, the world, section or folders, page.
    function crumbTrail(inBar: boolean): Crumb[] {
        const trail: Crumb[] = [];
        if (inBar) {
            if (!world || (view === "dashboard" && !query)) return trail;
            if (view !== "overview" || entry || query) trail.push({ id: "overview", label: "Overview", icon: <Flag size={14}/>, go: () => selectCampaign(campaign?.id ?? null) });
        } else {
            trail.push({ id: "worlds", label: "Worlds", icon: <Globe size={14}/>, go: openWorlds });
            if (!world || (view === "dashboard" && !query)) return trail;
            const worldsList = data.worlds.filter(w => !w.isTemplate && (!w.archived || w.id === world.id));
            trail.push({ id: "world", label: world.name, icon: <Globe size={14}/>, go: () => selectCampaign(null),
                siblings: { heading: "Worlds", items: worldsList.map(w => ({ id: w.id, label: w.name, current: w.id === world.id, go: () => { setWorldId(w.id); selectCampaign(null); } })) } });
        }
        const sections = [["characters", "Characters", <Users key="i" size={14}/>], ["maps", "World maps", <MapIcon key="i" size={14}/>], ["calendar", "Calendars", <CalendarDays key="i" size={14}/>], ["tables", "Random tables", <ListChecks key="i" size={14}/>], ["templates", "Templates", <LayoutTemplate key="i" size={14}/>], ["relationships", "Relationships", <Network key="i" size={14}/>], ...(campaign ? [["quests", "Quests", <Goal key="i" size={14}/>] as const, ["codex", "Codex", <Library key="i" size={14}/>] as const, ["look", "Look", <Palette key="i" size={14}/>] as const] : [])] as const;
        const section = sections.find(([id]) => id === view);
        if (section && !entry) trail.push({ id: "section", label: section[1], icon: section[2], go: () => showSection(section[0]),
            siblings: { heading: "Sections", items: sections.map(([id, label, icon]) => ({ id, label, icon, current: id === view, go: () => showSection(id) })) } });
        if (entry) {
            const chain: Entry[] = [];
            for (let at = entry.parentId ? data.entries.find(e => e.id === entry.parentId) : undefined; at && !chain.includes(at); at = at.parentId ? data.entries.find(e => e.id === at!.parentId) : undefined) chain.unshift(at);
            const levelOf = (e: Entry) => data.entries.filter(x => x.worldId === e.worldId && x.campaignId === e.campaignId && x.parentId === e.parentId).sort(compareEntries);
            const where = (e: Entry) => e.parentId ? data.entries.find(x => x.id === e.parentId)?.title ?? "this folder" : e.campaignId ? campaign?.name ?? "this campaign" : `${world!.name} lore`;
            for (const e of [...chain, entry]) trail.push({ id: e.id, label: e.title, icon: <EntryIcon kind={e.kind}/>, go: () => openEntry(e.id),
                siblings: { heading: `In ${where(e)}`, items: levelOf(e).map(x => ({ id: x.id, label: x.title, icon: <EntryIcon kind={x.kind}/>, current: x.id === e.id, go: () => openEntry(x.id) })),
                    ...(e === entry ? { onNew: { label: "New page here", run: () => setModal({ type: "entry" }) } } : {}) } });
        }
        return trail;
    }
    function showSection(id: "characters" | "maps" | "calendar" | "tables" | "templates" | "quests" | "codex" | "relationships" | "look") { setView(id); if (id === "tables") setTablesHome(n => n + 1); setSelected(null); setQuery(""); setMobile(false); }
    function toggleFolder(id: string) { setClosed(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
    function exportAll() { download(current.current, "world-manager-backup.json"); }
    async function importFile(file: File) { try {
        if (file.size > 2000000)
            throw new Error("Choose a JSON backup smaller than 2 MB.");
        const incoming = workspaceSchema.parse(JSON.parse(await file.text()));
        if (!incoming.worlds.length)
            throw new Error("This backup contains no worlds.");
        const next = importCopy(current.current, incoming);
        if (JSON.stringify(next).length > 2000000)
            throw new Error("The combined workspace exceeds the 2 MB first-version limit.");
        const first = next.worlds[current.current.worlds.length];
        change(next);
        setWorldId(first.id);
        setCampaignId(next.campaigns.find(c => c.worldId === first.id)?.id ?? null);
        setSelected(null);
        setToast("Imported as a separate copy. Existing worlds are unchanged.");
    }
    catch (e) {
        setToast(e instanceof Error ? e.message : "Invalid backup file");
    }
    finally {
        if (fileInput.current)
            fileInput.current.value = "";
    } }
    async function removeEntry(e: Entry) { if (data.entries.some(x => x.parentId === e.id)) {
        setToast("Move or delete the pages inside it first.");
        return;
    } if (!await confirmDialog({ title: `Delete “${e.title}”?`, message: 'This cannot be undone. Export a backup first if you need a copy.', confirm: 'Delete page', danger: true }))
        return; change({ ...data, entries: data.entries.filter(x => x.id !== e.id) }); setSelected(null); }
    // Any page can hold sub-pages. Drag a row onto the top or bottom edge of another to place it before or after, or onto its middle to put it inside.
    // Arrange: every row of the page tree gets its name to edit in place and buttons to move it up, down, out of its page or into the page above.
    function renameInPlace(e: Entry, raw: string) { const title = raw.trim().slice(0, 160); if (!title || title === e.title) return; if (change(latest => ({ ...latest, entries: latest.entries.map(x => x.id === e.id ? { ...x, title, updatedAt: new Date().toISOString() } : x) })) !== false) setToast(`Renamed to “${title}”.`); }
    function arrangeMove(e: Entry, how: "up" | "down" | "out" | "in", above?: Entry) {
        if (how === "up" || how === "down") { change(latest => reorderEntry(latest, e.id, how === "up" ? -1 : 1)); return; }
        const latest = current.current, targetId = how === "out" ? e.parentId : above?.id; if (!targetId) return;
        const place: DropPlace = how === "out" ? "after" : "inside", next = movePage(latest, e.id, targetId, place);
        if (!next) { setToast(dropProblem(latest, e.id, targetId, place) ?? "That page can’t go there."); return; }
        if (change(next) === false) return;
        if (how === "in") setClosed(old => { const n = new Set(old); n.delete(targetId); return n; });
        const target = latest.entries.find(x => x.id === targetId); setToast(how === "in" ? `Moved “${e.title}” inside “${target?.title}”.` : `Moved “${e.title}” out of “${target?.title}”.`);
    }
    function arrangeRow(e: Entry, siblings: Entry[], at: number, depth: number, Icon: ComponentType<{ size?: number }>, folds: boolean, open: boolean): ReactNode {
        const above = siblings[at - 1];
        return <div className={`tree-row arrange-row${dragging === e.id ? " dragging" : ""}`} style={{ paddingLeft: 6 + depth * 15 }}>
            {folds ? <button className="disclosure" aria-label={`${open ? "Collapse" : "Expand"} ${e.title}`} aria-expanded={open} onClick={() => toggleFolder(e.id)}>{open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button> : <span className="disclosure"/>}
            <GripVertical size={13} className="arrange-grip" aria-hidden="true"/><Icon size={14}/>
            <input key={e.title} className="arrange-name" defaultValue={e.title} maxLength={160} aria-label={`Name of ${e.title}`} onBlur={ev => renameInPlace(e, ev.currentTarget.value)} onKeyDown={ev => { if (ev.key === "Enter") ev.currentTarget.blur(); else if (ev.key === "Escape") { ev.currentTarget.value = e.title; ev.currentTarget.blur(); } }}/>
            <span className="arrange-moves">
                <button aria-label={`Move ${e.title} up`} title="Up" disabled={at === 0} onClick={() => arrangeMove(e, "up")}><ArrowUp size={12}/></button>
                <button aria-label={`Move ${e.title} down`} title="Down" disabled={at === siblings.length - 1} onClick={() => arrangeMove(e, "down")}><ArrowDown size={12}/></button>
                <button aria-label={`Move ${e.title} out of the page it is in`} title="Out of the page it is in" disabled={!e.parentId} onClick={() => arrangeMove(e, "out")}><ArrowLeft size={12}/></button>
                <button aria-label={above ? `Move ${e.title} inside ${above.title}` : `Move ${e.title} inside the page above`} title={above ? `Inside ${above.title}` : "Inside the page above"} disabled={!above} onClick={() => arrangeMove(e, "in", above)}><ArrowRight size={12}/></button>
            </span>
        </div>;
    }
    function dropOn(id: string, targetId: string, place: DropPlace) { const latest = current.current, next = movePage(latest, id, targetId, place); endPageDrag(); setDragging(null); setDropAt(null); if (!next) { setToast(dropProblem(latest, id, targetId, place) ?? "That page can’t go there."); return; } if (change(next) === false) return; const page = latest.entries.find(e => e.id === id), target = latest.entries.find(e => e.id === targetId); if (place === "inside") setClosed(old => { const n = new Set(old); n.delete(targetId); return n; }); setToast(place === "inside" ? `Moved “${page?.title}” inside “${target?.title}”.` : `Moved “${page?.title}”.`); }
    function tree(items: Entry[], parentId: string | null = null, depth = 0): ReactNode { const siblings = items.filter(e => e.parentId === parentId).sort(compareEntries); return siblings.map((e, at) => { const Icon = pageIcon(e.pageLook) ?? icons[e.kind], kids = items.some(x => x.parentId === e.id), folds = kids || e.kind === "folder", open = folds && !closed.has(e.id), count = kids ? descendantCount(data, e.id) : 0, drop = dropAt?.id === e.id ? dropAt.place : null; return <div key={e.id}>{arranging ? arrangeRow(e, siblings, at, depth, Icon, folds, open) : <div className={`tree-row ${selected === e.id ? "selected" : ""}${drop ? ` drop-${drop}` : ""}${dragging === e.id ? " dragging" : ""}`} style={{ paddingLeft: 12 + depth * 15 }} draggable onDragStart={ev => { ev.dataTransfer.setData("text/plain", e.title); ev.dataTransfer.effectAllowed = "copyMove"; startPageDrag(ev.dataTransfer, e.id); setDragging(e.id); }} onDragEnd={() => { endPageDrag(); setDragging(null); setDropAt(null); }} onDragOver={ev => { if (!dragging) return; const r = ev.currentTarget.getBoundingClientRect(), y = (ev.clientY - r.top) / r.height, place: DropPlace = y < .28 ? "before" : y > .72 ? "after" : "inside"; if (dropProblem(data, dragging, e.id, place)) { if (dropAt) setDropAt(null); return; } ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (dropAt?.id !== e.id || dropAt.place !== place) setDropAt({ id: e.id, place }); }} onDrop={ev => { ev.preventDefault(); if (dragging && dropAt?.id === e.id) dropOn(dragging, e.id, dropAt.place); }} onClick={ev => { if (e.kind === "folder" && !(ev.target as HTMLElement).closest("button")) toggleFolder(e.id); }} onKeyDown={ev => { const d = altStep(ev); if (d) { ev.preventDefault(); change(latest => reorderEntry(latest, e.id, d)); setToast(`Moved “${e.title}” ${d < 0 ? "up" : "down"}.`); } }}>{folds ? <button className="disclosure" aria-label={`${open ? "Collapse" : "Expand"} ${e.title}`} aria-expanded={open} onClick={() => toggleFolder(e.id)}>{open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button> : <span className="disclosure"/>}<button className="tree-item" aria-expanded={e.kind === "folder" ? open : undefined} onClick={() => e.kind === "folder" ? toggleFolder(e.id) : openEntry(e.id)}><Icon size={15}/><span>{e.title}</span>{count > 0 && <small className="tree-count" aria-label={`${count} pages inside`}>{count}</small>}</button>{e.kind === "folder" && <button className="tree-edit icon-button" aria-label={`Edit folder ${e.title}`} title="Edit folder" onClick={() => openEntry(e.id)}><Pencil size={12}/></button>}</div>}{open && tree(items, e.id, depth + 1)}</div>; }); }
    if (signedOut)
        return <div className="welcome"><div className="welcome-theme"><ThemeToggle/></div><div className="welcome-mark"><Compass size={38}/></div><span className="eyebrow">TTRPG world manager</span><h1>Your worlds.<br />Their stories.</h1><p>A quiet place for world lore, campaign notes, and the threads that connect them.</p><a className="button primary" href="/account" target="_top">Open your workspace <ArrowUpRight size={16}/></a><small>Private by default · Your notes belong to you</small></div>;
    if (!loaded)
        return <div className="welcome"><div className="welcome-theme"><ThemeToggle/></div><Compass size={40}/><h1>{error ? "Couldn’t open your worlds" : "Opening your worlds…"}</h1>{error ? <><p>{error}</p><button onClick={() => location.reload()}>Try again</button></> : <LoaderCircle className="spin"/>}</div>;
    const look = lookAttributes(skin.on ? undefined : campaign?.look);
    const overlay = mobile || moreOpen || palette || modal?.type === "entry", moreViews = ["dashboard", "quests", "calendar", "tables", "templates", "codex", "relationships", "characters", "look"];
    // Chosen items close the sheet first, then act; the dice tray is the shared one from global-dice.
    const later = (fn: () => void) => () => { setTimeout(fn, 0); };
    const moreGroups: MoreGroup[] = [
      { heading: "Go to", items: [
        { id: "dashboard", label: "Worlds", icon: <Globe size={18}/>, current: view === "dashboard", onSelect: openWorlds },
        ...(world ? [
          ...(campaign ? [{ id: "quests", label: "Quests", icon: <Goal size={18}/>, current: view === "quests", onSelect: () => showSection("quests") }] : []),
          ...(campaign ? [{ id: "calendar", label: "Calendar", icon: <CalendarDays size={18}/>, current: view === "calendar", onSelect: () => showSection("calendar") }] : []),
          { id: "characters", label: "Characters", icon: <Users size={18}/>, current: view === "characters", onSelect: () => showSection("characters") },
          ...(campaign ? [{ id: "codex", label: "Codex", icon: <Library size={18}/>, current: view === "codex", onSelect: () => showSection("codex") }] : []),
          { id: "relationships", label: "Relationships", icon: <Network size={18}/>, current: view === "relationships", onSelect: () => showSection("relationships") },
          { id: "tables", label: "Random tables", icon: <ListChecks size={18}/>, current: view === "tables", onSelect: () => showSection("tables") },
          { id: "templates", label: "Templates", icon: <LayoutTemplate size={18}/>, current: view === "templates", onSelect: () => showSection("templates") }] : [])] },
      { heading: "Tools", items: [
        { id: "dice", label: "Dice", icon: <Dices size={18}/>, onSelect: later(() => openDiceTray("dice")) },
        { id: "log", label: "Roll log", icon: <ScrollText size={18}/>, onSelect: later(() => openDiceTray("log")) },
        ...(campaign ? [
          { id: "askai", label: "Ask AI", icon: <Bot size={18}/>, onSelect: later(() => window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT))) },
          { id: "form", label: "Stat form", icon: <ListChecks size={18}/>, onSelect: () => setTool("form") },
          { id: "items", label: "Items and spells", icon: <Backpack size={18}/>, onSelect: () => setTool("items") },
          { id: "share", label: "Share with players", icon: <Users size={18}/>, onSelect: () => setTool("share") },
          { id: "look", label: "Look", icon: <Palette size={18}/>, current: view === "look", onSelect: () => showSection("look") }] : []),
        ...(world && !member ? [{ id: "transfer", label: "Export & import", icon: <ArrowLeftRight size={18}/>, onSelect: () => setTool("transfer") }] : [])] },
      { heading: "Settings", items: [
        ...(campaign ? [{ id: "ai", label: "Connect an AI", icon: <Sparkles size={18}/>, onSelect: () => setAiOpen(true) }] : []),
        { id: "github", label: "AI & GitHub", icon: <Github size={18}/>, onSelect: () => setModal({ type: "connections" }) },
        { id: "settings", label: "Workspace & backups", icon: <Settings size={18}/>, onSelect: () => setModal({ type: "settings" }) },
        { id: "appearance", label: "Appearance", icon: <Palette size={18}/>, onSelect: later(() => document.querySelector<HTMLElement>(".topbar .appearance-trigger, .wiki-bar .appearance-trigger")?.click()) },
        { id: "account", label: "Account", icon: <UserRound size={18}/>, href: "/account" }] },
    ];
    // One campaign bar on top while a campaign is open (a co-GM's is theirs by reference); a world on its own keeps the tool header.
    const mref = memberRef(), barOn = !!campaign || !!mref;
    const sidebarButtons = <><button className="sidebar-toggle icon-button" aria-label={sidebar.collapsed?"Show sidebar":"Hide sidebar"} title={sidebar.collapsed?"Show sidebar":"Hide sidebar"} aria-expanded={!sidebar.collapsed} aria-controls="workspace-sidebar" onClick={()=>sidebar.setCollapsed(!sidebar.collapsed)}>{sidebar.collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button><button className="mobile-menu" aria-label="Open navigation" aria-expanded={mobile} aria-controls="workspace-sidebar" onClick={() => setMobile(true)}><Menu size={20}/></button></>;
    const trailNode = barOn ? <div className="crumbs wiki-trail">{sidebarButtons}<Breadcrumbs className="topbar-crumbs" fewest={2} items={crumbTrail(true)}/></div> : <Breadcrumbs className="topbar-crumbs" fewest={2} items={crumbTrail(false)}/>;
    const topActions = <><SaveChip status={status} error={error} conflict={false} onSave={saveNow} hints={{ saved: "All changes saved. Ctrl/Cmd+S saves now.", loading: "Loading your Wiki.", offline: "Your Wiki could not be loaded." }} autosave={{ on: autosave.on, set: setAutosave, changes: unsaved, lastSaved }}/><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this campaign…" aria-label="Search the Wiki"/>{query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button> : <button className="quick-hint" aria-label="Open quick search" title="Quick search: jump to or create any entry" onClick={() => openSearch()}><kbd>Ctrl K</kbd></button>}</label><button className="button primary small" disabled={!world} onClick={() => setModal({ type: "entry" })}><Plus size={16}/> New entry</button>{campaign && <AiActivity campaignId={campaign.id} onChanged={() => void pollRef.current()} onSettings={() => setAiOpen(true)}/>}<ThemeToggle/></>;
    const wikiBar = barOn && <CampaignBar className="wiki-bar" tool="encyclopedia" campaign={mref ? { memberRef: mref } : { encyclopediaId: campaign!.id }} name={campaign?.name} phoneTrail bell={!mref}
      trail={trailNode} actions={topActions} onPick={mref ? undefined : row => switchCampaign(row)} onWorlds={mref ? undefined : () => setModal({ type: "library" })}
      beforeLeave={leaveSaved} canOpenSwitcher={() => loaded && !signedOut && !modal && !palette && !tagsOpen && !aiOpen && !backups && !writing && !tool && !moreOpen}/>;
    if (asPlayer && campaign && !member && !mref) return <div className="wiki-player-preview">{wikiBar}<PlayerViewBanner>You read {campaign.name} as its players do: only what you marked player-visible.</PlayerViewBanner><PlayerView data={playerCampaign(data, campaign.id)}/></div>;
    return <div className={`app-shell ${barOn?"wiki-shell ":""}${sidebar.collapsed?"sidebar-collapsed":""}${member?" is-co-gm":""}${member&&!member.edit?" co-gm-read":""} ${skin.className}`} {...look} style={{"--sidebar-width":sidebar.width+"px",...look.style} as CSSProperties}>{skin.on?skin.nodes:<LookFont look={campaign?.look}/>}{themeDock.node}
  <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => e.target.files?.[0] && importFile(e.target.files[0])}/>
  {mobile && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
   {barOn && wikiBar}

  <aside id="workspace-sidebar" aria-label="Workspace navigation" role={sidebar.narrow&&mobile?"dialog":undefined} aria-modal={sidebar.narrow&&mobile?true:undefined} inert={sidebar.narrow?!mobile:sidebar.collapsed} className={`sidebar ${mobile ? "is-open" : ""}`} onKeyDown={e=>{if(e.key==="Escape")setMobile(false);}}>
   <button className="sidebar-mobile-close icon-button" aria-label="Close navigation" onClick={()=>setMobile(false)}><X size={17}/></button>
   {(member||mref||!campaign) && <button className="world-picker" onClick={openWorlds}><Globe size={18}/><span><small>YOUR WORLD</small><strong>{world?.name ?? "Choose a world"}</strong></span><ChevronDown size={15}/></button>}
   {!campaign && <div className="side-section dashboard-nav"><button className={`campaign-link ${view==='dashboard'?'active':''}`} onClick={openWorlds}><Globe size={16}/><span>Worlds</span></button></div>}
   {world&&<SidebarNav layout={sidebarLayout} campaign={!!campaign} member={!!member||!!memberRef()} view={view==='overview'?'':view} selected={view==='overview'?selected:null} pages={shown} kindLabels={labels} types={templatesFor(world,campaignId)} pageIcon={kind=><EntryIcon kind={kind as Entry["kind"]}/>}
     onView={v=>showSection(v)} onTool={runTool} onPage={openEntry} isOpen={navigation.isOpen} toggle={navigation.toggle} draft={sidebarDraft} setDraft={setSidebarDraft} onSave={saveSidebar}
     headingExtra={{lore:<><span className="shared-tag">shared</span><button className={`arrange-toggle${arranging?' on':''}`} aria-pressed={arranging} title={arranging?'Done arranging':'Arrange pages: rename and move them'} onClick={()=>setArranging(!arranging)}>{arranging?<><Check size={13}/> Done</>:<ArrowUpDown size={14} aria-label="Arrange pages"/>}</button></>,notes:<><button className={`arrange-toggle${arranging?' on':''}`} aria-pressed={arranging} title={arranging?'Done arranging':'Arrange pages: rename and move them'} onClick={()=>setArranging(!arranging)}>{arranging?<><Check size={13}/> Done</>:<ArrowUpDown size={14} aria-label="Arrange pages"/>}</button><button className="add-note" aria-label="New campaign note" onClick={()=>setModal({type:'entry'})}><Plus size={15}/></button></>}} onNewIn={cat=>setModal({type:'entry',kind:cat.kinds?.[0],templateId:cat.types?.find(id=>templatesFor(world,campaignId).some(t=>t.id===id)),category:cat.id})}
     builtIn={{
      lore:<><button className="text-button section-overview" onClick={()=>selectCampaign(null)}>World overview <ArrowUpRight size={12}/></button>{tree(shown.filter(e=>e.campaignId===null&&e.worldId===worldId))}{!shown.some(e=>e.campaignId===null&&e.worldId===worldId)&&<p className="side-empty">Places, people, and possibilities.</p>}{linkedWorlds.map(w=>{const pages=shown.filter(e=>e.campaignId===null&&e.worldId===w.id);return <div key={w.id} className="linked-lore" role="group" aria-label={`${w.name} lore`}><div className="linked-lore-heading"><span>{w.name} lore</span><button className="linked-lore-remove" aria-label={`Stop showing ${w.name} lore in this campaign`} title="Stop showing this lore here" onClick={()=>change(latest=>setWorldLink(latest,campaign!.id,w.id,false))}><X size={12}/></button></div>{pages.length?tree(pages):<p className="side-empty">No pages in this world yet.</p>}</div>;})}</>,
      notes:campaign?<>{tree(scope)}{!scope.length&&<p className="side-empty">Add the first page of this story.</p>}</>:null,
      sessions:campaign?(()=>{const list=shown.filter(e=>e.kind==='session'&&e.campaignId===campaign.id).sort((a,b)=>b.title.localeCompare(a.title,undefined,{numeric:true}));return <>{list.map(e=><div key={e.id} className={`tree-row ${selected===e.id?'selected':''}`} style={{paddingLeft:12}}><span className="disclosure"/><button className="tree-item" onClick={()=>openEntry(e.id)}><EntryIcon kind="session"/><span>{e.title}</span></button></div>)}{!list.length&&<p className="side-empty">Session recaps you write show here, newest first.</p>}</>;})():null,
      orgs:<>{orgListItems(shown).map(o=><div key={o.id} className={`tree-row org-side-row ${selected===o.id?'selected':''}`} style={{paddingLeft:12}}><span className="disclosure"/><button className="tree-item" onClick={()=>openEntry(o.id)}><span className="org-dot" style={{background:o.colour}} aria-hidden="true"/><span>{o.title}</span>{o.lore&&<small className="tree-count">lore</small>}</button></div>)}{!shown.some(e=>e.kind==='faction')&&<p className="side-empty">Guilds, houses and orders appear here.</p>}</>,
     }}/>}
   {!world&&<div className="navigation-trees"/>}
   <div className="sidebar-bottom">{campaign && <button onClick={() => setAiOpen(true)}><Sparkles size={16}/> Connect an AI</button>}<button onClick={() => setModal({ type: "connections" })}><Github size={16}/> AI & GitHub <span className="tiny">BETA</span></button>{world && !member && <button onClick={() => setTool("transfer")}><ArrowLeftRight size={16}/> Export & import</button>}<button onClick={() => setModal({ type: "settings" })}><Settings size={16}/> Workspace & backups</button></div>
   <SidebarResize width={sidebar.width} maxWidth={sidebar.maxWidth} onChange={sidebar.setWidth}/>
  </aside>
  <main className="main-panel" id="main-content" tabIndex={-1}>
   {member && <div className="co-gm-bar" role="note"><Users size={15} aria-hidden="true"/><span><strong>{member.ownerName}&apos;s campaign</strong> · You&apos;re a {member.role} here. {member.edit ? "Your changes save to their Wiki." : "Your group can read it, not edit it."}</span><Link href="/campaigns">Back to Campaigns</Link></div>}
   {!barOn && <header className="topbar"><div className="crumbs">{sidebarButtons}<ToolSwitch active="encyclopedia"/></div>{trailNode}<div className="top-actions">{topActions}<AccountLink/></div></header>}
   {!member && <FogImageSync data={data} change={change}/>}{error && <div className="error-banner" role="alert"><div><strong>Your changes need attention.</strong> {error}</div><button onClick={exportAll}>Export unsaved draft</button><button onClick={async () => { if (await confirmDialog({ title: "Reload saved data?", message: "Unsaved changes in this tab will be discarded. Export your draft first.", confirm: "Reload", danger: true }))
        location.reload(); }}>Reload</button><button onClick={() => { blocked.current = false; setError(""); void save(); }}>Retry save</button></div>}
   {view==='dashboard'&&!query ? <WorkspaceDashboard data={data} worldId={worldId} change={change} onWorld={selectWorld} onCampaign={(wid,cid)=>{setWorldId(wid);selectCampaign(cid);}} onLore={wid=>{setWorldId(wid);selectCampaign(null);navigation.open('lore');}} onNewCampaign={()=>setModal({type:'campaign'})} onEdit={id=>setModal({type:'rename',id})}/> : !world ? <div className="empty-world"><span className="eyebrow">Every world starts with a page</span><h1>Make room for<br />your next adventure.</h1><p>Keep the world you imagine and the campaigns you play in one thoughtful workspace.</p><div className="button-row"><button className="button primary" onClick={() => setModal({ type: "world" })}><Plus size={17}/> Create a world</button><button className="button" onClick={() => { change(demoWorkspace()); setWorldId("demo-world"); setCampaignId("demo-campaign"); }}>Explore a sample world <ArrowUpRight size={16}/></button></div><button className="text-button" onClick={() => fileInput.current?.click()}><Upload size={15}/> Bring an existing backup</button><div className="empty-illustration"><Compass size={120} strokeWidth={.7}/><span>WORLDS / CAMPAIGNS / STORIES</span></div></div> :
            query ? <section className="page-content"><span className="eyebrow">Search · {campaign?.name ?? "WORLD LORE"}</span><h1>Find a thread</h1><p className="subtitle">{searchResults.length} results for “{query}” · includes shared world lore</p><div className="result-list">{searchResults.map(e => <button key={e.id} onClick={() => openEntry(e.id)}><span className="entry-icon"><EntryIcon kind={e.kind}/></span><span><strong>{e.title}</strong><small>{e.campaignId ? labels[e.kind] : `Shared lore · ${labels[e.kind]}`}</small><p>{excerpt(e, data)}</p></span><ChevronRight size={16}/></button>)}{!searchResults.length && <p>No matches. Try a character, place, or phrase.</p>}</div></section> :
                view==='tables' ? <RandomTablesSection home={tablesHome} campaignId={campaignId} onSaveCharacter={page=>{const id=newId();if(change({...current.current,entries:[...current.current.entries,{id,worldId,campaignId,parentId:null,title:page.title,kind:'character',character:defaultCharacter(),body:page.body,updatedAt:new Date().toISOString()}]})!==false){navigation.open(campaignId?'notes':'lore');openEntry(id);}}} campaigns={data.campaigns.map(c=>({id:c.id,name:c.name,world:data.worlds.find(w=>w.id===c.worldId)?.name??''}))}/> :
                view==='templates' ? <TemplatesSection key={worldId + (campaignId ?? '')} data={data} worldId={worldId} campaignId={campaignId} change={change}/> :
                view==='quests'&&campaign ? <QuestsSection key={campaign.id} data={data} worldId={worldId} campaign={campaign} change={change} onOpen={openEntry}/> :
                view==='look'&&campaign ? <LookSection key={campaign.id} campaign={campaign} setLook={look=>change(w=>({...w,campaigns:w.campaigns.map(c=>c.id===campaign.id?{...c,look}:c)}))}/> :
                view==='relationships' ? <RelationshipsSection key={worldId+campaignId} data={data} worldId={worldId} campaign={campaign} change={change} onOpen={openEntry}/> :
                view==='codex'&&campaign ? <CodexSection key={campaign.id} data={data} worldId={worldId} campaign={campaign} change={change} onOpen={openEntry}/> :
                view==='calendar'&&campaign ? <CalendarSection key={campaign.id} data={data} campaign={campaign} change={change}/> :
                view==='maps' ? <MapsSection key={worldId+campaignId} data={data} worldId={worldId} campaignId={campaignId} change={change} onOpen={openEntry}/> :
                view==='characters' ? <CharactersSection key={worldId+campaignId+castRole} initialRole={castRole} data={data} worldId={worldId} campaignId={campaignId} change={change} onOpen={openEntry} onForm={()=>setTool('form')} onShare={()=>setTool('share')} onNewFolder={()=>setModal({type:'entry',id:'folder'})}/> :
                entry ? <ArticleEditor key={entry.id} entry={entry} data={data} campaign={campaign} editing={editing} setEditing={setEditing} update={patch=>updateEntry(entry.id,patch)} change={change} onOpen={openEntry} onOverview={()=>setSelected(null)} onRename={()=>setModal({type:'rename',id:entry.id})} onDelete={()=>removeEntry(entry)} onNew={parent=>setModal({type:"entry",parent})} onForm={()=>setTool('form')} onTag={showTag} initialTab={tabAt?.entry === entry.id ? tabAt.tab : undefined} onTab={tab => setTabAt(tab ? { entry: entry.id, tab } : null)} onKind={e=>{if(e.kind==='character')setCastRole(e.character?.role??'npc');showSection(e.kind==='character'?'characters':e.kind==='quest'?'quests':'maps');}} onCampaign={campaign?()=>selectCampaign(campaign.id):undefined}/> :
                    <CampaignHome data={data} world={world} campaign={campaign ?? null} worldId={worldId} scope={scope} shown={shown} linkedWorlds={linkedWorlds} gm={!memberRef()} icons={icons} labels={labels} excerpt={e => excerpt(e, data)} onOpen={openEntry} onNew={(kind, shared) => setModal({ type: "entry", kind, shared })} onEdit={() => setModal({ type: "rename", id: campaign?.id ?? world.id })} onExplore={() => { selectCampaign(null); navigation.open("lore"); }} onCampaign={id => selectCampaign(id)} onNewCampaign={() => setModal({ type: "campaign" })} onSection={id => showSection(id)} onUnlink={id => campaign && change(latest => setWorldLink(latest, campaign.id, id, false))} setLook={look => campaign && change(w => ({ ...w, campaigns: w.campaigns.map(c => c.id === campaign.id ? { ...c, look } : c) }))}/>}
   <footer className="main-footer"><span>YOUR WORLDS, THEIR STORIES.</span><span>Private workspace <span>·</span> v0.11</span></footer>
  </main>
  <BottomBar pagesRef={pagesBtn} moreRef={moreBtn} pagesOpen={mobile} pagesCurrent={!overlay&&view==='overview'} onPages={()=>{setMoreOpen(false);setMobile(m=>!m);}} searchOpen={palette} onSearch={()=>{setMobile(false);openSearch();}} canCreate={!!world} newOpen={modal?.type==='entry'} onNew={()=>{setMobile(false);setModal({type:"entry"});}} mapsCurrent={!overlay&&view==='maps'} onMaps={()=>showSection("maps")} moreOpen={moreOpen} moreCurrent={!overlay&&moreViews.includes(view)} onMore={()=>{setMobile(false);setMoreOpen(true);}}/>
  {moreOpen && <MoreSheet groups={moreGroups} onClose={restore=>{setMoreOpen(false);if(restore)setTimeout(()=>moreBtn.current?.focus(),0);}}/>}
  {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
  {tool==='form'&&campaign&&<StatFormBuilder key={campaign.id} campaign={campaign} data={data} onClose={()=>setTool(null)} onSave={statFields=>change(withoutDeletedStats({...data,campaigns:data.campaigns.map(c=>c.id===campaign.id?{...c,statFields}:c)},campaign.id,(campaign.statFields??[]).filter(f=>!statFields.some(x=>x.id===f.id)).map(f=>f.id)))}/>}
  {tool==='items'&&campaign&&<ItemSettingsDialog key={campaign.id} campaign={campaign} onClose={()=>setTool(null)} onSave={items=>change({...data,campaigns:data.campaigns.map(c=>c.id===campaign.id?{...c,items}:c)})}/>}
  {tool==='transfer'&&world&&<ContentTransfer key={worldId+(campaign?.id??'')} data={data} worldId={worldId} campaignId={campaign?.id??null} change={change} onClose={()=>setTool(null)} onDone={message=>{setTool(null);setToast(message);}}/>}
  {tool==='share'&&campaign&&<PlayerSharing key={campaign.id} data={data} campaignId={campaign.id} saved={status==='All changes saved'} onClose={()=>setTool(null)}/>}
  {backups && campaign && <BackupsSheet campaignId={campaign.id} campaignName={campaign.name} workspace={data} canRestore={!memberRef()} onSaveGithub={github => change(latest => ({ ...latest, campaigns: latest.campaigns.map(c => c.id === campaign.id ? { ...c, github } : c) }))} close={() => setBackups(false)} onRestored={() => { void pull().catch(() => undefined); }}/>}
  <RollResults discord={campaign && (campaign.discord || campaign.maptableCampaignId) ? { campaignId: campaign.id, label: "Discord" } : null} onSetupDiscord={campaign ? () => setModal({ type: "connections" }) : undefined}/>
  {palette && <QuickSearch entries={shown} icons={icons} labels={labels} canCreate={!!world} scopeName={e => e.campaignId ? data.campaigns.find(c => c.id === e.campaignId)?.name ?? "Campaign" : e.worldId !== worldId ? `${data.worlds.find(w => w.id === e.worldId)?.name ?? "Linked world"} lore` : "World lore"} onOpen={openEntry} onCreate={name => setModal({ type: "entry", name })} onView={showView} onClose={() => setPalette(false)} initialTags={paletteTags} onManageTags={() => setTagsOpen(true)}/>}
  {aiOpen && campaign && <AiConnectionDialog campaignId={campaign.id} campaignName={campaign.name} onClose={() => setAiOpen(false)} onWriting={() => { setAiOpen(false); setWriting("recap"); }}/>}
  {writing && campaign && !member && <AiWritingDialog data={data} campaign={campaign} change={change} start={writing} onClose={() => setWriting(null)}/>}
  {tagsOpen && <TagsManager scope="encyclopedia" onClose={() => setTagsOpen(false)} onShow={showTag}/>}
  {modal && <ModalDialog title={{ world: "Create a world", campaign: "Begin a campaign", entry: "Create an entry", settings: "Workspace & backups", library: "Your world library", rename: "Edit details", connections: "AI & campaign repositories" }[modal.type]} onClose={() => setModal(null)}>
   {modal.type === "library" ? <><p className="modal-intro">A home for every world you imagine.</p><div className="world-list">{data.worlds.map(w => <div key={w.id}><button onClick={() => { selectWorld(w.id); setModal(null); }}><Globe size={20}/><span><strong>{w.name}</strong><small>{w.archived ? "Archived" : `${data.campaigns.filter(c => c.worldId === w.id).length} campaigns`}</small></span><ChevronRight size={16}/></button><button aria-label={`${w.archived ? "Restore" : "Archive"} ${w.name}`} title={w.archived ? "Restore world" : "Archive world"} onClick={() => change({ ...data, worlds: data.worlds.map(x => x.id === w.id ? { ...x, archived: !x.archived } : x) })}><Archive size={16}/></button></div>)}</div><button className="button primary" onClick={() => setModal({ type: "world" })}><Plus size={16}/> Create a world</button></> :
                modal.type === "settings" ? <><p className="modal-intro">Keep a copy you control. Backups include your worlds, campaigns, article links, and folder hierarchy.</p><div className="settings-action"><div><strong>Export all worlds</strong><p>Download a complete JSON backup, including unsaved changes.</p></div><button className="button" onClick={exportAll}><Download size={16}/> Export</button></div>{world && !member && <div className="settings-action"><div><strong>Export &amp; import content</strong><p>Move random tables, templates, stats, calendars and more between worlds and campaigns as a .json file.</p></div><button className="button" onClick={() => { setModal(null); setTool("transfer"); }}><ArrowLeftRight size={16}/> Open</button></div>}<div className="settings-action"><div><strong>Import a backup</strong><p>Creates new copies. Existing worlds are preserved.</p></div><button className="button" onClick={() => fileInput.current?.click()}><Upload size={16}/> Import</button></div><p className="info-note">Local and hosted workspaces use their configured storage. Use export and import to move content between them. This version supports up to 2 MB of workspace data. Uploaded map images are stored separately: download each map’s Map package to include its image when moving between local and hosted workspaces.</p><a className="text-button" href="/account" target="_top">Sign out</a></> :
                    modal.type === "connections" ? <><p className="modal-intro">Each campaign can have its own repository. AI can read a selected campaign and its shared lore through authenticated, read-only MCP tools.</p>{campaign ? <><div className="connection-label"><Flag size={17}/>{campaign.name}</div><p className="info-note"><b>Repository:</b> {campaign.github.repository ? `${campaign.github.repository} · branch ${campaign.github.branch}` : "none connected yet"}</p><button className="button primary full" onClick={() => { setModal(null); setBackups(true); }}><Github size={16}/> GitHub &amp; backups</button><p className="info-note">The sheet connects a GitHub repository (the key stays on this device), pushes this campaign to it as an RP repository, downloads it as a ZIP, or restores one as a new campaign. It includes shared world lore and never another campaign.</p><details className="connection-help"><summary>Command line</summary><p>The same layout can be written straight into a local clone of the repository. Download the campaign JSON, then run:</p><button type="button" className="button small" onClick={() => download(campaignExport(current.current, campaign.id), `campaign-${campaign.id}.json`)}><Download size={14}/> Download campaign JSON</button><code>node --experimental-strip-types scripts/campaign-sync.mjs export --file /path/campaign-{campaign.id}.json --repo /path/repository [--dir subfolder] [--tables tables.json] [--player-safe] [--push]</code><p>It writes the numbered folders, keeps files you edited in the repository, and with --player-safe leaves out 6-GM-Only/ and the restore copy. To read a repository back as a new copy:</p><code>node --experimental-strip-types scripts/campaign-sync.mjs pull --campaign {campaign.id} --repo /path/repository --repository {campaign.github.repository || "owner/repository"} --branch {campaign.github.branch} --out /path/restored.json</code><p>Pull imports are separate copies so existing notes are never silently overwritten.</p></details></> : <p className="info-note">Choose a campaign (open Worlds) to configure its repository and export.</p>}{campaign && <DiscordRollsSetting campaign={campaign} onChange={discord => change({ ...data, campaigns: data.campaigns.map(c => c.id === campaign.id ? { ...c, discord } : c) })}/>}<EncyclopediaAgentAccess campaignId={campaign?.id??null} campaignName={campaign?.name??null}/><BridgeAccess campaignId={campaign?.id??null} campaignName={campaign?.name??null}/></> :
                        <DetailsForm key={modal.type + modal.id} defaultKind={modal.id==="folder"?"folder":modal.kind??"page"} mode={modal.type} initialName={modal.type === "entry" ? modal.name ?? "" : modal.type === "rename" ? (data.entries.find(e => e.id === modal.id)?.title ?? data.campaigns.find(c => c.id === modal.id)?.name ?? data.worlds.find(w => w.id === modal.id)?.name ?? "") : ""} initialDescription={data.campaigns.find(c => c.id === modal.id)?.description ?? data.worlds.find(w => w.id === modal.id)?.description ?? ""} showDescription={modal.type === "world" || modal.type === "campaign" || modal.type === "rename" && !data.entries.some(e => e.id === modal.id)} campaignAvailable={!!campaign} defaultParent={modal.parent ?? (entry?.kind === "folder" ? entry.id : entry?.parentId ?? "")} defaultShared={modal.shared ?? (modal.parent ? data.entries.find(e => e.id === modal.parent)?.campaignId === null : entry ? entry.campaignId === null : !campaign)} folders={shown.map(e=>({...e,title:[folderPath(data,e),e.title].filter(Boolean).join(" / ")})).sort((a,b)=>a.title.localeCompare(b.title))} templates={modal.type==="entry"?templatesFor(data.worlds.find(w=>w.id===worldId),campaignId):[]} defaultTemplateId={modal.templateId} data={data} worldId={worldId} campaign={campaign?{id:campaign.id,name:campaign.name}:null} onNewType={t=>change(s=>saveTemplate(s,worldId,t,newId))} onSubmit={(name, description, kind, shared, parent, template) => { if (!name.trim())
                            throw new Error("A title is required"); if (modal.type === "world") {
                            const id = newId();
                            change({ ...data, worlds: [...data.worlds, { id, name: name.trim(), description, archived: false }] });
                            setWorldId(id);
                            setCampaignId(null);
                            setSelected(null);
                        } if (modal.type === "campaign") {
                            const id = newId();
                            change({ ...data, campaigns: [...data.campaigns, { id, worldId, name: name.trim(), description, github: { repository: "", branch: "main" } }] });
                            setCampaignId(id);
                            setView("overview");
                            setSelected(null);
                        } if (modal.type === "entry") {
                            const id = newId();
                            const scopeId = shared ? null : campaignId;
                            navigation.open(shared?"lore":"notes");
                            const parentEntry = data.entries.find(e => e.id === parent && e.campaignId === scopeId);
                            if (template) change({ ...data, entries: [...data.entries, pageFromTemplate(template.template, { id, title: name, worldId, campaignId: scopeId, parentId: parentEntry?.id ?? null, values: template.values, newId, org: defaultOrg(world), profile: defaultProfile(world) })] });
                            else change({ ...data, entries: [...data.entries, { id, worldId, campaignId: scopeId, parentId: parentEntry?.id ?? null, title: name.trim(), kind: kind ?? "page", ...kindStarts(kind ?? "page", world, name), body: kind === "tasks" ? "- [ ] First task\n  - [ ] A smaller step" : "", updatedAt: new Date().toISOString() }] });
                            // Made from a category's +: when the category doesn't gather pages of this type by itself, it links to it.
                            const cat = modal.category ? sidebarLayout.categories.find(c => c.id === modal.category) : undefined;
                            if (cat && campaign && !(cat.kinds ?? []).includes((template?.template.kind ?? kind ?? "page") as never) && !(template && (cat.types ?? []).includes(template.template.id))) saveSidebar(addCategoryLink(sidebarLayout, cat.id, { type: "page", page: id }, newId));
                            setView("overview");
                            setSelected(id);
                            setEditing(true);
                            if (parentEntry)
                                setClosed(old => { const next = new Set(old); next.delete(parentEntry.id); return next; });
                        } if (modal.type === "rename") {
                            if (data.entries.some(e => e.id === modal.id))
                                updateEntry(modal.id!, { title: name.trim() });
                            else
                                change({ ...data, worlds: data.worlds.map(w => w.id === modal.id ? { ...w, name: name.trim(), description } : w), campaigns: data.campaigns.map(c => c.id === modal.id ? { ...c, name: name.trim(), description } : c) });
                        } setModal(null); }}/>}
  </ModalDialog>}
 </div>;
}
function EntryIcon({ kind }: {
    kind: Entry["kind"];
}) { const Icon = icons[kind]; return <Icon size={17}/>; }
function ModalDialog({ title, onClose, children }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
}) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { ref.current?.showModal(); }, []); return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e => { if (e.target === ref.current)
    onClose(); }}><div className="modal-inner"><div className="modal-heading"><h2>{title}</h2><button aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></dialog>; }
function DetailsForm({ mode, initialName = "", initialDescription = "", onSubmit, showDescription = false, campaignAvailable = false, defaultParent = "", defaultShared = false, defaultKind = "page", folders = [], templates = [], defaultTemplateId = "", data, worldId = "", campaign = null, onNewType }: {
    mode: string;
    initialName?: string;
    initialDescription?: string;
    showDescription?: boolean;
    campaignAvailable?: boolean;
    defaultParent?: string;
    defaultShared?: boolean;
    folders?: Entry[];
    defaultKind?: Entry["kind"];
    /** New entry: the world's page templates, to start from one. */
    templates?: PageTemplate[]; defaultTemplateId?: string; data?: Workspace; worldId?: string;
    /** New entry: the open campaign, and making a new entry type (a template with a name and icon) there and then. */
    campaign?: { id: string; name: string } | null; onNewType?: (t: PageTemplate) => void;
    onSubmit: (name: string, description: string, kind?: Entry["kind"], shared?: boolean, parent?: string, template?: { template: PageTemplate; values: Record<string, FieldValue> }) => void;
}) {
    const [name, setName] = useState(initialName), [description, setDescription] = useState(initialDescription), [kind, setKind] = useState<Entry["kind"]>(defaultKind), [shared, setShared] = useState(defaultShared), [parent, setParent] = useState(defaultParent), [error, setError] = useState(""), [templateId, setTemplateId] = useState(defaultTemplateId), [values, setValues] = useState<Record<string, FieldValue>>({}), [makingType, setMakingType] = useState(false);
    const template = templates.find(t => t.id === templateId);
    const chooseTemplate = (t: PageTemplate | undefined) => { setTemplateId(t?.id ?? ""); setValues({}); if (t) { setKind(t.kind); const p = t.parentId ? folders.find(f => f.id === t.parentId) : undefined; if (p) { setShared(p.campaignId === null); setParent(p.id); } } };
    return <form className="details-form" onSubmit={e => { e.preventDefault(); try {
        onSubmit(name, description, kind, shared, parent, template ? { template, values } : undefined);
        setError("");
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "Please check your input");
    } }}><label>{mode === "github" ? "GitHub repository" : "Name"}<input autoFocus required={mode !== "github"} maxLength={mode === "github" ? 200 : 160} placeholder={mode === "github" ? "owner/repository" : "Give it a name…"} value={name} onChange={e => setName(e.target.value)}/></label>{(showDescription || mode === "github") && <label>{mode === "github" ? "Branch" : "A short description"}<input required={mode === "github"} maxLength={mode === "github" ? 100 : 1000} value={description} onChange={e => setDescription(e.target.value)} placeholder={mode === "github" ? "main" : "What makes this story yours?"}/></label>}{mode === "entry" && <>{makingType && onNewType ? <NewTypeForm worldName={data?.worlds.find(w => w.id === worldId)?.name ?? "this world"} campaign={campaign} onCancel={() => setMakingType(false)} onMake={t => { onNewType(t); setMakingType(false); chooseTemplate(t); }}/>
      : <TypePicker value={template ? { templateId: template.id } : { kind }} onChange={t => { if (t.templateId !== undefined) chooseTemplate(templates.find(x => x.id === t.templateId)); else { setTemplateId(""); setValues({}); setKind(t.kind); } }} types={templates} onNewType={onNewType ? () => setMakingType(true) : undefined}/>}
    {template && data && <TemplateFields template={template} data={data} worldId={worldId} values={values} setValues={setValues}/>}<label>Belongs to<select value={shared ? "shared" : "campaign"} onChange={e => { setShared(e.target.value === "shared"); setParent(""); }}>{campaignAvailable && <option value="campaign">Current campaign</option>}<option value="shared">Shared world lore</option></select></label><label>Inside<select value={parent} onChange={e => setParent(e.target.value)}><option value="">Top level</option>{folders.filter(e => shared ? e.campaignId === null : e.campaignId !== null).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label></>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" type="submit">{mode === "github" || mode === "rename" ? "Save details" : "Create"}<Check size={16}/></button></form>;
}
