"use client";
import { uiZoom } from "@/lib/appearance";
import {readJsonResponse} from "@/lib/transfer-client";
import { countLabel } from "@/lib/plural";
import StandardDiceTray, { type DicePanel } from "./standard-dice-tray";
import { diceDockPosition } from "@/lib/dice-dock";
import { attachSceneMap } from "@/lib/scene-map";
import { WHEEL_IDLE_MS } from "@/lib/wheel-resize";
import SaveConflictNotice from "./save-conflict-notice";
import { saveWorkspace } from "@/lib/workspace-save";
import TokenColor from "./token-color";
import TokenEditor from "./token-editor";
import TokenFace from "./token-face";
import { ArmedPlacement } from "./token-placement";
import TokenOptions from "./token-options";
import SaveGalleryStats from "./save-gallery-stats";
import {syncConditionRounds,conditionAge,getCurrentInitiativeEntry,getInitiativeEntries,isInitiativeEntryActive} from "@/lib/initiative-tracker";
import { AiActivity, type SuggestedMove } from "./encyclopedia/ai-activity";
import {syncTokenAttachments} from "@/lib/token-attachments";
import { preserveActiveScene, workspaceSyncDecision } from "@/lib/workspace-sync";
import { navigationStorageKey, parseNavigationState, phoneWidth, readRemembered, remember, type NavigationPanel } from "@/lib/navigation-state";
import SavedMeasurements from "./saved-measurements";
import FogRegions from "./fog-regions";
import {sceneTargets} from "@/lib/exploration";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useIdlePreload } from "@/lib/idle-preload";
import {
  Map as MapIcon,
  LayoutDashboard,
  Compass,
  Layers,
  Plus,
  Upload,
  Settings2,
  Share2,
  MousePointer2,
  Scan,
  Hand,
  Ruler,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  Circle,
  Square,
  X,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Copy,
  Download,
  Link,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  HelpCircle,
  UserRound,
  Dices,
  ScrollText,
  ChevronDown,
  Globe,
  Grid3x3,
  LayoutGrid,
  FolderPlus,
  Users,
} from "lucide-react";
import NextLink from "next/link";
import { mapMemberRef, mapWorkspaceUrl, bookImageUrl } from "@/lib/maptable-member";
import { maptableCoGmRefusal } from "@/lib/maptable-co-gm";
import { confirmDialog } from "./confirm-dialog";
import SaveChip from "./save-chip";
import { useAutosave } from "./use-autosave";
import PanelTip from "./panel-tip";
import Board, { type View } from "./board";
import AppearanceMenu from "./appearance-menu";
import ToolSwitch, { AccountLink } from "./tool-switch";
import { ActionMenu } from "./popover-menu";
import { TagRow } from "./tags";
import Breadcrumbs, { type Crumb } from "./breadcrumbs";
import SceneSwitcher from "./scene-switcher";
import CampaignScenes from "./campaign-scenes";
import ConditionSymbol from "./condition-symbol";
import ConditionEntry from "./condition-entry";
import EncyclopediaTokens, { roleColor, loadEncyclopedia, encyclopediaCharacters, type EncyclopediaCharacter } from "./encyclopedia-tokens";
import { tokenImageFit } from "@/lib/encyclopedia/picture";
import MapInitiative, { InitiativeField } from "./map-initiative";
import "./maptable-token-layout.css";
import { applyWorkspaceHpStates } from "@/lib/token-hp-state";
import CampaignTokenDefaults from "./campaign-token-defaults";
import { resolvedToken, SIDE_COLOURS, type TokenSide } from "@/lib/token-defaults";
import { sceneInitials, tokenInitials } from "@/lib/token-initials";
import { roleSide } from "@/lib/token-gallery";
import { encyclopediaEntryOf, type ArmedToken } from "@/lib/token-arming";
import { TOKEN_CLIPBOARD_KEY, copyTokens, placedName } from "@/lib/token-clipboard";
import ResizableSidebar from "./resizable-sidebar";
import { FolderPreferenceScope } from "./folder-expansion";
import SceneOrganizer, { LocationOptions } from "./scene-organizer";
import {
  Modal,
  Field,
  Toggle,
  NumberField,
  type MapImportSettings,
} from "./dialogs";
import { api, loadImage, uploadAsset, download } from "@/lib/api";
import {
  initialWorkspace,
  fitImageDimensions,
  newScene,
  newToken,
  uid,
  address,
  snap,
  workspaceSchema,
  type EffectPreset,
  type Workspace,
  type Scene,
  type Asset,
  type Tool,
  type Grid,
  type Point,
} from "@/lib/model";
import type { Images } from "@/lib/render";
import { mergeMaptable } from "@/lib/maptable-merge";
import { drawingStampAssets } from "@/lib/map-stamps";
import { addNotePage, linkablePages, notePages, playerNote } from "@/lib/map-notes";
import type { Workspace as EncyclopediaWorkspace } from "@/lib/encyclopedia/world-model";
import { GmNoteCard, PlayerNoteCard } from "./map-note-card";
import { AreaDialog, AreaDraw, AreaLayer, AreasPanel, GmAreaCard, PlayerAreaCard } from "./map-areas";
import { MAX_AREAS, playerAreaText, roomAt } from "@/lib/map-areas";
// Editors and panels that open on demand load as separate chunks; they are fetched while the
// browser is idle (below) so the first open is still instant.
const lazyParts = {
  HelpGuides: () => import("./help-guides"),
  ExplorationPanel: () => import("./exploration-panel"),
  CampaignAssets: () => import("./campaign-assets"),
  ConditionOrganizer: () => import("./condition-organizer"),
  EffectsPanel: () => import("./effects-panel"),
  TokenLibrary: () => import("./token-library"),
  AddScenes: () => import("./add-scenes"),
  MapSplitDialog: () => import("./map-split-dialog"),
  MapCreator: () => import("./map-creator"),
  ImportDialog: () => import("./import-dialog").then(m => ({ default: m.ImportDialog })),
  ExportDialog: () => import("./export-dialog").then(m => ({ default: m.ExportDialog })),
  ConnectionsDialog: () => import("./connections-dialog").then(m => ({ default: m.ConnectionsDialog })),
};
const HelpGuides = dynamic(lazyParts.HelpGuides);
const ExplorationPanel = dynamic(lazyParts.ExplorationPanel);
const CampaignAssets = dynamic(lazyParts.CampaignAssets);
const ConditionOrganizer = dynamic(lazyParts.ConditionOrganizer);
const EffectsPanel = dynamic(lazyParts.EffectsPanel);
const TokenLibrary = dynamic(lazyParts.TokenLibrary);
const AddScenes = dynamic(lazyParts.AddScenes);
const MapSplitDialog = dynamic(lazyParts.MapSplitDialog);
const MapCreator = dynamic(lazyParts.MapCreator);
const ImportDialog = dynamic(lazyParts.ImportDialog);
const ExportDialog = dynamic(lazyParts.ExportDialog);
const ConnectionsDialog = dynamic(lazyParts.ConnectionsDialog);
const preloadParts = Object.values(lazyParts);

type Panel = NavigationPanel;
type Dialog = "scene-map" | "condition" | "split-map" | "add-scenes" | "map" | "token" | "export" | "connections" | "help" | null;
const tools = [
  { id: "select", label: "Select", Icon: MousePointer2 },
  { id: "marquee", label: "Drag select", Icon: Scan },
  { id: "pan", label: "Pan", Icon: Hand },
  { id: "measure", label: "Measure", Icon: Ruler },
] as const;

export default function MapApp(props: { navigationScope?: string } = {}) {
  useIdlePreload(preloadParts);
  return <FolderPreferenceScope.Provider value={props.navigationScope ?? "local"}><MapAppContent {...props} /></FolderPreferenceScope.Provider>;
}
/** The remembered-view scope: a co-GM keeps their own, apart from their own Maptable. */
const scopeOf = (scope?: string) => scope && mapMemberRef() ? `${scope}:m:${mapMemberRef()}` : scope;
function MapAppContent({ navigationScope }: { navigationScope?: string } = {}) {
  const navigationRestored = useRef(false);
  const memberInfo = useRef<{ ownerName: string; campaignId: string; locked?: string[] } | null>(null);
  const [navigationReady, setNavigationReady] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [member, setMember] = useState<{ ownerName: string; campaignId: string; locked?: string[] } | null>(null),
    [loadError, setLoadError] = useState(""),
    [saveStatus, setSaveStatus] = useState("Loading"),
    [saveError, setSaveError] = useState("");
  const state = useRef<Workspace | null>(null),
    acknowledged = useRef<Workspace | null>(null),
    loadEpoch = useRef(0),
    revision = useRef<string | null>(null),
    generation = useRef(0),
    savedGeneration = useRef(0),
    saving = useRef(false),
    blocked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromise = useRef<Promise<boolean> | null>(null);
  /** Edits waiting for a save, and when the last save landed (the save chip shows both). */
  const [unsaved, setUnsaved] = useState(0), [lastSaved, setLastSaved] = useState<Date | null>(null);
  const history = useRef<Workspace[]>([]),
    future = useRef<Workspace[]>([]),
    [historyVersion, setHistoryVersion] = useState(0);
  const [panel, setPanel] = useState<Panel>("scenes"),
    [dialog, setDialog] = useState<Dialog>(null),
    [newMapType,setNewMapType] = useState<Scene["mapType"]>("encounter"),
    [selected, setSelected] = useState<string | null>(null),
    [selectedIds,setSelectedIds]=useState<string[]>([]),
    [selectedPoiId,setSelectedPoiId]=useState<string|null>(null),
    [poiActivation,setPoiActivation]=useState<"double"|"single">("double"),
    [explorationHistory,setExplorationHistory]=useState<string[]>([]),
    [tokenEditRequest,setTokenEditRequest]=useState({id:"",count:0}),
    [tokenGalleryOpen,setTokenGalleryOpen]=useState(false),
    [galleryTab,setGalleryTab]=useState<"saved"|"encyclopedia">("saved"),
    [armed,setArmed]=useState<ArmedToken|null>(null),
    [quickOpen,setQuickOpen]=useState(false),[quickSide,setQuickSide]=useState<TokenSide>("enemy"),
    [tool, setTool] = useState<Tool>("select"),
    [player, setPlayer] = useState(false),
    [hideFog,setHideFog]=useState(false),
    [sidebar, setSidebar] = useState(true);
  const [brushSize, setBrushSize] = useState(140),
    [fogControlsHost,setFogControlsHost]=useState<HTMLDivElement|null>(null),
    [cropControlsHost,setCropControlsHost]=useState<HTMLDivElement|null>(null),
    [fogSelectionRequest,setFogSelectionRequest]=useState<{index:number;nonce:number}|null>(null),
    [fogSelectedIndices,setFogSelectedIndices]=useState<number[]>([]),
    [fogShape, setFogShape] = useState<"brush" | "rect" | "polygon" | "edit">("brush"),
    [effectSize, setEffectSize] = useState(2),
    [effectColor, setEffectColor] = useState("#d99a3a");
  // Tokens and AoEs can be picked up whatever else is open; only the fog and grid panels pick their own things.
  const selectionScope = panel === "scenes" || panel === "tokens" || panel === "effects" || panel === "fog" || panel === "exploration" ? panel : panel === "grid" ? "measurements" : "scenes";
  const [mobileToolsOpen,setMobileToolsOpen]=useState(false);
  // Moves an AI helper suggested, waiting for the GM in the AI panel: drawn as dashed tokens.
  const [suggestedMoves,setSuggestedMoves]=useState<SuggestedMove[]>([]);
  const [dicePanel,setDicePanel]=useState<DicePanel>(null);
  const [diceDock,setDiceDock]=useState<CSSProperties>();
  const toolbarRef=useRef<HTMLDivElement>(null);
  const toggleDicePanel=(next:Exclude<DicePanel,null>)=>{setDicePanel(p=>p===next?null:next);setMobileToolsOpen(false);};
  useEffect(()=>{
    if(!dicePanel)return;
    const place=()=>{const bar=toolbarRef.current;if(!bar)return;const z=uiZoom(),r=bar.getBoundingClientRect();setDiceDock(diceDockPosition({top:r.top/z,right:r.right/z},window.innerWidth/z,window.innerHeight/z));};
    place();window.addEventListener("resize",place);return()=>window.removeEventListener("resize",place);
  },[dicePanel]);
  const [mobileHeaderOpen,setMobileHeaderOpen]=useState(false);
  const [mobilePanelExpanded,setMobilePanelExpanded]=useState(false);
  const selectionLabel = selectionScope === "exploration" ? "markers and tokens" : selectionScope === "scenes" ? "tokens and AoEs" : selectionScope === "effects" ? "tokens and AoEs" : selectionScope === "fog" ? "fog regions" : selectionScope === "measurements" ? "measurements and tokens" : selectionScope === "tokens" ? "tokens" : "nothing (open a map sidebar section)";
  useEffect(()=>{
    if(!["exploration","scenes"].includes(selectionScope))setSelectedPoiId(null);
    const current=state.current;
    const currentScene=current?.scenes.find(s=>s.id===current.activeId);
    const allowed=new Set([
      ...(selectionScope!=="fog"?currentScene?.tokens.map(t=>t.id)??[]:[]),
      ...(["scenes","effects"].includes(selectionScope)?currentScene?.effects.map(t=>t.id)??[]:[]),
      ...(selectionScope==="measurements"?currentScene?.measurements.map(t=>t.id)??[]:[]),
    ]);
    setSelected(id=>id&&allowed.has(id)?id:null);setSelectedIds(ids=>ids.filter(id=>allowed.has(id)));
    if(selectionScope!=="fog")setFogSelectedIndices([]);
    setTool(t=>["select","marquee","pan"].includes(t) || (selectionScope==="exploration" && t==="poi") || (selectionScope==="fog" && ["reveal","cover"].includes(t)) || (selectionScope==="effects" && ["circle","square","line","cone","custom"].includes(t)) || (selectionScope==="measurements" && t==="measure") ? t : "select");
  },[selectionScope]);
  const [effectLabel,setEffectLabel]=useState(""),[effectPersistent,setEffectPersistent]=useState(false),[effectHidden,setEffectHidden]=useState(false),[effectWidth,setEffectWidth]=useState(1);
  const [effectTemplate,setEffectTemplate]=useState<EffectPreset|null>(null);
  const [view, setView] = useState<View>({
      x: 0,
      y: 0,
      scale: 1,
      width: 800,
      height: 600,
    }),
    [measure, setMeasure] = useState(""),
    [measurementPoints,setMeasurementPoints]=useState<Point[]>([]),
    [imageVersion, setImageVersion] = useState(0),
    [imageError, setImageError] = useState("");
  const images = useRef<Images>(new Map()),
    pendingImages = useRef(new Set<string>());
  const [settings, setSettings] = useState({
      s3Configured: false,
      discordConfigured: false,
    }),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const [tokenSearch, setTokenSearch] = useState("");
  const [conditionName, setConditionName] = useState(""),
    [conditionColor, setConditionColor] = useState("#ad7141"),
    [conditionIcon, setConditionIcon] = useState("!"),
    [conditionAssetId,setConditionAssetId]=useState<string|null>(null);
  const [conditionLocation,setConditionLocation]=useState<string|null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [measureTokenMovement, setMeasureTokenMovement] = useState(false);
  useEffect(() => {
    try { setMeasureTokenMovement(localStorage.getItem("maptable:measure-token-movement") === "true"); }
    catch { /* Browser preferences are optional. */ }
  }, []);
  const changeMeasureTokenMovement = useCallback((enabled: boolean) => {
    setMeasureTokenMovement(enabled);
    try { localStorage.setItem("maptable:measure-token-movement", String(enabled)); }
    catch { /* Keep the toggle working when storage is unavailable. */ }
  }, []);
  const [gridAdjust, setGridAdjust] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [folderRequest, setFolderRequest] = useState(0);
  const [sceneTab, setSceneTab] = useState<"general" | "map" | "size">("general");
  const [dashboard, setDashboard] = useState(true);
  /** Dashboard: the campaign whose scenes are shown (null = maps not in a campaign). */
  const [overview, setOverview] = useState<{ id: string | null } | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [dashboardLocation, setDashboardLocation] = useState<string | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  useEffect(() => {
    if (!navigationReady || !navigationScope || !workspace) return;
    remember(navigationStorageKey(scopeOf(navigationScope)!), JSON.stringify({
      version: 1, dashboard, creatorOpen, panel, sidebar, activeId: workspace.activeId,
      location, dashboardLocation, conditionLocation, overview,
    }));
  }, [navigationReady, navigationScope, workspace, dashboard, creatorOpen, panel, sidebar, location, dashboardLocation, conditionLocation, overview]);
  const scene =
    workspace?.scenes.find((s) => s.id === workspace.activeId) ||
    workspace?.scenes[0];
  useEffect(()=>{setFogSelectedIndices([]);setSelectedIds([]);setHideFog(false);setSelectedPoiId(null);},[scene?.id]);
  const campaignFor = (containerId: string | null): string | null => {
    while (containerId) {
      const c = workspace?.collections.find((item) => item.id === containerId);
      if (!c) return null;
      if (c.kind === "campaign") return c.id;
      containerId = c.parentId;
    }
    return null;
  };
  const campaignId = campaignFor(scene?.containerId ?? null);
  const campaign = workspace?.collections.find((c) => c.id === campaignId);
  // Map notes: the GM's Encyclopedia, read once a marker links a page or the Exploration panel opens.
  const [book,setBook]=useState<EncyclopediaWorkspace|null>(null),[bookError,setBookError]=useState(""),[playerNoteOpen,setPlayerNoteOpen]=useState<{id:string;key:string}|null>(null);
  // The player note closes when the view or the scene changes.
  const playerNoteKey=`${player}:${scene?.id}`,playerNoteId=playerNoteOpen?.key===playerNoteKey?playerNoteOpen.id:null,setPlayerNoteId=(id:string|null)=>setPlayerNoteOpen(id?{id,key:playerNoteKey}:null);
  // Map notes, part 2: the open area (closed when the view or scene changes), drawing a new one, and its dialog.
  const [areaOpen,setAreaOpenState]=useState<{id:string;key:string}|null>(null),[areaDrawing,setAreaDrawing]=useState(false),[areaEdit,setAreaEdit]=useState<{id?:string;points:{x:number;y:number}[];pageId?:string;section?:string;playersSee?:boolean}|null>(null);
  const openAreaId=areaOpen?.key===playerNoteKey?areaOpen.id:null,setOpenArea=(id:string|null)=>setAreaOpenState(id?{id,key:playerNoteKey}:null);
  const wantsBook=panel==="exploration"||!!scene?.pointsOfInterest.some(p=>p.pages?.length)||!!scene?.areas?.length||areaDrawing;
  useEffect(()=>{if(!wantsBook||book)return;let active=true;
    loadEncyclopedia().then(raw=>{if(active){setBook(raw as unknown as EncyclopediaWorkspace);setBookError("");}}).catch(e=>{if(active)setBookError(e instanceof Error?e.message:"Could not load your Encyclopedia.");});
    return()=>{active=false;};},[wantsBook,book]);
  const linkable=useMemo(()=>linkablePages(book,campaignId),[book,campaignId]);
  useEffect(()=>{
    let active=true;
    setSettings(s=>({...s,discordConfigured:false}));
    if (mapMemberRef()) return () => { active = false; };
    api<{s3Configured:boolean;discordConfigured:boolean}>("/api/settings"+(campaignId?`?campaignId=${encodeURIComponent(campaignId)}`:""))
      .then(value=>{if(active)setSettings(value);}).catch(()=>{});
    return ()=>{active=false;};
  },[campaignId,dialog]);
  const settingsTab = sceneTab === "size" && scene?.mapId ? "general" : sceneTab;
  const destination = workspace?.collections.some((c) => c.id === location) && campaignFor(location) === campaignId ? location : campaignId;
  const token = scene?.tokens.find((t) => t.id === selected),
    effect = scene?.effects.find((e) => e.id === selected);
  // Initials for the tokens without a picture: no two differently named tokens on the map share them.
  const tokenInitialsById = useMemo(() => sceneInitials(scene?.tokens.filter(t => !t.pieceOf) ?? []), [scene?.tokens]);
  useEffect(() => {
    setGridAdjust(false);
  }, [scene?.id, panel, sidebar, dialog]);
  useEffect(() => {
    if (player || scene?.grid.type === "none") setGridAdjust(false);
  }, [player, scene?.grid.type]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const result = await api<{
        workspace: Workspace | null;
        revision: string | null;
        member?: { ownerName: string; campaignId: string; locked?: string[] };
      }>(mapWorkspaceUrl());
      memberInfo.current = result.member ?? null;
      setMember(result.member ?? null);
      let data = result.workspace
        ? workspaceSchema.parse(result.workspace)
        : initialWorkspace();
      loadEpoch.current++;
      acknowledged.current=result.workspace?data:null;
      let saved = null;
      saved = navigationScope ? parseNavigationState(readRemembered(navigationStorageKey(scopeOf(navigationScope)!))) : null;
      // /maptable?scene=<id> (from an Encyclopedia link) opens that scene once, then the address is tidied.
      let requested: string | null = null, requestedCampaign: string | null = null;
      if (!navigationRestored.current) { try { const query = new URLSearchParams(window.location.search); requested = query.get("scene"); requestedCampaign = query.get("campaign"); } catch { requested = null; } }
      const linked = requested && data.scenes.some(s => s.id === requested) ? requested : null;
      const activeId = linked ?? (navigationRestored.current ? state.current?.activeId : saved?.activeId);
      if (activeId) data = preserveActiveScene(data, activeId);
      if (!navigationRestored.current) {
        navigationRestored.current = true;
        if (saved) {
          const validLocation = (id: string | null) => data.collections.some(c => c.id === id) ? id : null;
          setDashboard(saved.dashboard);
          setCreatorOpen(saved.creatorOpen);
          setPanel(saved.panel);
          setSidebar(saved.sidebar && !phoneWidth());
          setLocation(validLocation(saved.location));
          setDashboardLocation(validLocation(saved.dashboardLocation));
          setConditionLocation(data.conditionFolders.some(c => c.id === saved.conditionLocation) ? saved.conditionLocation : null);
          // A campaign that was deleted since falls back to the dashboard's campaign list.
          if (saved.overview && (saved.overview.id === null || data.collections.some(c => c.id === saved.overview?.id && c.kind === "campaign"))) setOverview(saved.overview);
        } else if (phoneWidth()) setSidebar(false); // Phones open on the map with the side sheet closed (handoff 2.7).
        // /maptable?campaign=<id> (from the Campaigns page) opens that campaign's scenes once.
        if (!linked && requestedCampaign && data.collections.some(c => c.id === requestedCampaign && c.kind === "campaign")) {
          setDashboard(true); setCreatorOpen(false);
          const inCampaign = (id: string | null) => { for (let n = 0; id && n < 100; n++) { const c = data.collections.find(item => item.id === id); if (!c || c.kind === "campaign") return c?.id === requestedCampaign; id = c.parentId; } return false; };
          if (data.scenes.some(s => inCampaign(s.containerId))) setOverview({ id: requestedCampaign });
          else { setOverview(null); setDashboardLocation(requestedCampaign); }
        }
        if (requested || requestedCampaign) {
          if (linked) { setDashboard(false); setCreatorOpen(false); }
          try { const url = new URL(window.location.href); url.searchParams.delete("scene"); url.searchParams.delete("campaign"); window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash); } catch { /* The address is cosmetic. */ }
        }
        setNavigationReady(true);
      }
      revision.current = result.revision;
      state.current = data;
      setWorkspace(data);
      blocked.current = false;
      generation.current = 0;
      savedGeneration.current = 0;
      history.current = [];
      future.current = [];
      setSaveError("");
      setSaveStatus(result.workspace ? "Saved to cloud" : "Ready"); setUnsaved(0);
    } catch (e) {
      setLoadError((e as Error).message);
      setSaveStatus("Unavailable");
    }
  }, [navigationScope]);
  useEffect(() => {
    void load();
  }, [load]);
  const [syncNote, setSyncNote] = useState("");
  useEffect(() => { if (!syncNote) return; const t = setTimeout(() => setSyncNote(""), 6000); return () => clearTimeout(t); }, [syncNote]);
  /**
   * Takes in a cloud save made somewhere else (an AI running the table saves often), joined token by token
   * with unsaved edits here. When both changed the same thing, this tab's version is kept and named.
   */
  const takeIn = useCallback((incoming: Workspace, incomingRevision: string | null) => {
    const base = acknowledged.current, mine = state.current;
    let next = incoming;
    if (generation.current !== savedGeneration.current) {
      const joined = base && mine ? mergeMaptable(base, mine, incoming) : null;
      if (!joined) return false;
      next = joined.merged;
      if (joined.both.length) setSyncNote(`Kept your changes to ${joined.both.slice(0, 3).join(", ")}${joined.both.length > 3 ? " and more" : ""}: they also changed somewhere else.`);
    } else if (mine) next = preserveActiveScene(incoming, mine.activeId);
    acknowledged.current = incoming;
    revision.current = incomingRevision;
    state.current = next;
    setWorkspace(next);
    // Undo steps are whole snapshots: replaying one now would quietly take back the other side's changes.
    history.current = [];
    future.current = [];
    setHistoryVersion(value => value + 1);
    return true;
  }, []);
  const rebase = useCallback(async () => {
    try {
      const response = await fetch(mapWorkspaceUrl(), { cache: "no-store" });
      if (!response.ok) return false;
      const result = await readJsonResponse(response) as { workspace: Workspace | null; revision: string | null };
      if (!result.workspace || !takeIn(workspaceSchema.parse(result.workspace), result.revision)) return false;
      generation.current++;
      return true;
    } catch { return false; }
  }, [takeIn]);
  const scheduleRef = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let controller: AbortController | null = null;
    const pointers = new Set<number>();
    const down = (event: PointerEvent) => pointers.add(event.pointerId);
    const up = (event: PointerEvent) => pointers.delete(event.pointerId);
    const blur = () => pointers.clear();
    const snapshot = () => ({ state: state.current, revision: revision.current,
      generation: generation.current, savedGeneration: savedGeneration.current,
      saving: saving.current, blocked: blocked.current });
    // Drawing tools can hold multi-click drafts between pointer gestures.
    const interacting = () => creatorOpen || busy || dialog !== null || !["select", "marquee", "pan"].includes(tool) || pointers.size > 0 ||
      !!document.activeElement?.closest("input,textarea,select,[contenteditable=true]") ||
      !!document.querySelector("[role=dialog],[role=menu]");
    const poll = async () => {
      if (disposed || pending || document.visibilityState !== "visible" || !state.current ||
          saving.current || blocked.current || interacting()) return;
      pending = true;
      const start = snapshot();
      controller = new AbortController();
      try {
        const response = await fetch(mapWorkspaceUrl(), {
          cache: "no-store", signal: controller.signal,
          headers: start.revision ? { "If-None-Match": `"${start.revision}"` } : {},
        });
        if (response.status === 304 || !response.ok) return;
        const result = await readJsonResponse(response) as { workspace: Workspace | null; revision: string | null };
        if (disposed || document.visibilityState !== "visible") return;
        const decision = workspaceSyncDecision(start, snapshot(), result.revision, interacting());
        if (decision === "ignore") return;
        if (decision === "conflict") {
          if (result.workspace && takeIn(workspaceSchema.parse(result.workspace), result.revision)) { scheduleRef.current(); return; }
          blocked.current = true;
          setSaveStatus("Not saved");
          setSaveError("Another device saved changes. Download a backup, then reload to get the latest cloud version.");
          return;
        }
        const incoming = result.workspace ? workspaceSchema.parse(result.workspace) : initialWorkspace();
        loadEpoch.current++;
        acknowledged.current=result.workspace?incoming:null;
        const next = preserveActiveScene(incoming, state.current!.activeId);
        revision.current = result.revision;
        state.current = next;
        setWorkspace(next);
        history.current = [];
        future.current = [];
        setHistoryVersion(value => value + 1);
        setSelected(null);
        setSelectedIds([]);
        setSelectedPoiId(null);
        setFogSelectedIndices([]);
        setExplorationHistory([]);
        setSaveError("");
        setSaveStatus(result.workspace ? "Saved to cloud" : "Ready"); setUnsaved(0);
      } catch {
        // Background reads retry quietly; local data and the save status remain intact.
      } finally {
        pending = false;
      }
    };
    const refresh = () => { void poll(); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 2000);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [creatorOpen, busy, dialog, tool, takeIn]);
  // Save automatically (per device, shared with the Encyclopedia), how many edits wait, and when the last save landed.
  const autosave = useAutosave();
  const reportSave = useCallback((status: string) => {
    setSaveStatus(status);
    if (status === "Saved to cloud") { setUnsaved(0); setLastSaved(new Date()); }
  }, []);
  const save = useCallback(() => saveWorkspace({
    state, revision, acknowledged, loadEpoch, generation, savedGeneration, saving, blocked, savePromise, setSaveStatus: reportSave, setSaveError, rebase,
    request: (input, init) => fetch(typeof input === "string" && input.split("?")[0] === "/api/workspace" && mapMemberRef() ? mapWorkspaceUrl() : input, init),
  }), [rebase, reportSave]);
  const manualSave = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return save();
  }, [save]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (creatorOpen || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void manualSave();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [creatorOpen, manualSave]);
  const schedule = useCallback(() => {
    generation.current++;
    setSaveStatus("Unsaved changes");
    setUnsaved(n => n + 1);
    if (timer.current) clearTimeout(timer.current);
    // With Save automatically off, edits wait for Save or Ctrl/Cmd+S.
    timer.current = autosave.ref.current ? setTimeout(() => void save(), 700) : null;
  }, [save, autosave.ref]);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  // A burst of wheel resizes joins into one undo step: while the last change is still the latest one, the next folds into it.
  const burst = useRef<{ at: number; before: Workspace; after: Workspace } | null>(null);
  const commit = useCallback(
    (fn: (w: Workspace) => void, options?: { burst?: boolean }) => {
      const previous = state.current;
      if (!previous) return;
      const next = structuredClone(previous);
      fn(next);
      for(const scene of next.scenes)syncConditionRounds(scene,previous.scenes.find(s=>s.id===scene.id));
      applyWorkspaceHpStates(previous,next);
      next.scenes=next.scenes.map(scene=>syncTokenAttachments(previous.scenes.find(s=>s.id===scene.id) ?? scene,scene));
      // Keep attached origins saved, and leave auras in place when their token is removed.
      for(const scene of next.scenes) for(const area of scene.effects){
        if(!area.tokenId)continue;
        const token=scene.tokens.find(t=>t.id===area.tokenId);
        const origin=token??previous.scenes.find(s=>s.id===scene.id)?.tokens.find(t=>t.id===area.tokenId);
        if(origin){area.x=origin.x;area.y=origin.y;}
        if(!token)area.tokenId=null;
      }
      if (JSON.stringify(next) === JSON.stringify(previous)) return;
      const ref = mapMemberRef(), co = memberInfo.current;
      if (ref && co) { const refused = maptableCoGmRefusal(previous, next, co.campaignId, ref, new Set(co.locked ?? [])); if (refused) { setNotice(refused); return; } }
      const joining = !!options?.burst && !!burst.current && burst.current.after === previous && history.current.at(-1) === burst.current.before && Date.now() - burst.current.at < WHEEL_IDLE_MS;
      if (!joining) history.current = [...history.current.slice(-29), previous];
      burst.current = options?.burst ? { at: Date.now(), before: joining ? burst.current!.before : previous, after: next } : null;
      future.current = [];
      state.current = next;
      setWorkspace(next);
      setHistoryVersion((v) => v + 1);
      schedule();
    },
    [schedule],
  );
  const updateScene = useCallback(
    (fn: (s: Scene) => void, options?: { burst?: boolean }) =>
      commit((w) => {
        const s = w.scenes.find((s) => s.id === w.activeId) || w.scenes[0];
        fn(s);
      }, options),
    [commit],
  );
  const undo = useCallback(() => {
    if (!history.current.length || !state.current) return;
    future.current.push(state.current);
    const next = history.current.pop()!;
    state.current = next;
    setWorkspace(next);
    setExplorationHistory([]);
    setSelected(null);
    setSelectedIds([]);
    setFogSelectedIndices([]);
    setHistoryVersion((v) => v + 1);
    schedule();
  }, [schedule]);
  const redo = useCallback(() => {
    if (!future.current.length || !state.current) return;
    history.current.push(state.current);
    const next = future.current.pop()!;
    state.current = next;
    setWorkspace(next);
    setExplorationHistory([]);
    setSelected(null);
    setSelectedIds([]);
    setFogSelectedIndices([]);
    setHistoryVersion((v) => v + 1);
    schedule();
  }, [schedule]);
  const resizeGrid = useCallback((delta: number) => {
    updateScene((s) => {
      s.grid.size = Math.max(20, Math.min(500, Math.round((s.grid.size + delta) * 10) / 10));
    });
  }, [updateScene]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (generation.current !== savedGeneration.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const key = (e: KeyboardEvent) => {
      if (creatorOpen) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      if (e.key === "Escape" && gridAdjust) {
        setGridAdjust(false);
        e.preventDefault();
        return;
      }
      if (
        (e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if (gridAdjust && !e.ctrlKey && !e.metaKey && ["+", "=", "-", "_"].includes(e.key)) {
        e.preventDefault();
        const direction = e.key === "+" || e.key === "=" ? 1 : -1;
        resizeGrid(direction * (e.altKey ? 0.1 : 1));
        return;
      }
      if (gridAdjust && !e.ctrlKey && !e.metaKey &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const amount = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        updateScene((s) => {
          const axis = e.key === "ArrowLeft" || e.key === "ArrowRight" ? "offsetX" : "offsetY";
          const direction = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
          s.grid[axis] = Math.max(-500, Math.min(500, Math.round((s.grid[axis] + direction * amount) * 10) / 10));
        });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === "Escape") {
        setSelectedPoiId(null);
        setSelected(null);
        setSelectedIds([]);
        setFogSelectedIndices([]);
        setPlayer(false);
      }
      if (["Delete","Backspace"].includes(e.key) && selectionScope==="exploration" && selectedPoiId){
        e.preventDefault();updateScene(s=>{s.pointsOfInterest=s.pointsOfInterest.filter(p=>p.id!==selectedPoiId);});setSelectedPoiId(null);return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (tool==="marquee" ? selectedIds.length || fogSelectedIndices.length : tool==="select" && selectedIds.length > 1)) {
        e.preventDefault();
        updateScene(s=>{
          s.tokens=s.tokens.filter(t=>!selectedIds.includes(t.id));
          s.effects=s.effects.filter(t=>!selectedIds.includes(t.id));
          s.measurements=s.measurements.filter(t=>!selectedIds.includes(t.id));
          s.fog.strokes=s.fog.strokes.filter((_,i)=>!fogSelectedIndices.includes(i));
        });
        setSelected(null);setSelectedIds([]);setFogSelectedIndices([]);
        return;
      }
      if (e.key === "Delete" && selected) {
        updateScene((s) => {
          s.tokens = s.tokens.filter((t) => t.id !== selected);
          s.effects = s.effects.filter((t) => t.id !== selected);
          s.measurements = s.measurements.filter((m) => m.id !== selected);
        });
        setSelected(null);
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", key);
    };
  }, [undo, redo, selectedPoiId, selectionScope, selected, selectedIds, fogSelectedIndices, tool, updateScene, gridAdjust, resizeGrid, creatorOpen]);
  useEffect(() => {
    if (!scene || !workspace) return;
    let cancelled = false;
    setImageError("");
    const ids = new Set(
      [scene.mapId, ...drawingStampAssets(scene.drawing), ...scene.tokens.flatMap((t) => [t.assetId, t.borderAssetId]), ...workspace.conditions.filter(c=>scene.tokens.some(t=>t.conditions.includes(c.id))).map(c=>c.assetId)].filter(
        Boolean,
      ) as string[],
    );
    for (const id of images.current.keys()) {
      if (!ids.has(id)) images.current.delete(id);
    }
    for (const id of ids) {
      const a = workspace.assets.find((a) => a.id === id);
      if (!a || images.current.has(id) || pendingImages.current.has(id))
        continue;
      pendingImages.current.add(id);
      loadImage(a.src)
        .then((img) => {
          images.current.set(id, img);
          setImageVersion((v) => v + 1);
        })
        .catch((e) => {
          if (!cancelled)
            setImageError(
              `${a.name}: ${e.message} Check the URL or host CORS settings.`,
            );
        })
        .finally(() => pendingImages.current.delete(id));
    }
    return () => {
      cancelled = true;
    };
  }, [scene?.id, scene?.mapId, scene?.tokens, workspace?.assets, workspace?.conditions, imageVersion]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const chooseTool = (next: Tool) => {
    setEffectTemplate(null);
    if(next!=="pan")setGridAdjust(false);
    setTool(next);
    if(next!=="select")setArmed(null);
    if(next!=="marquee")setSelectedIds([]);
    setPlayer(false);
    if(next!=="select")setFogSelectedIndices([]);
    if (next === "reveal" || next === "cover") {setPanel("fog");setSelected(null);setSidebar(true);}
    if (next === "measure") {setPanel("grid");setSidebar(true);}
    if (["circle","square","line","cone","custom"].includes(next)) {setPanel("effects");setSidebar(true);}
  };
  const select = useCallback((id: string | null) => {
    setSelectedIds([]);
    setSelected(id);
    setFogSelectedIndices([]);
  }, []);
  const selectFog=useCallback((indices:number[])=>{
    setSelectedIds([]);
    setFogSelectedIndices(indices);
    if(indices.length){setSelected(null);setPanel("fog");setSidebar(true);setFogShape("edit");setTool("select");setPlayer(false);}
  },[]);
  const selectMarquee=useCallback((ids:string[],fogIndices:number[])=>{
    setSelectedIds(ids);
    setSelected(ids.length===1 && !fogIndices.length ? ids[0] : null);
    setFogSelectedIndices(fogIndices);
  },[]);
  const activate = (id: string) => {
    commit((w) => {
      w.activeId = id;
    });
    setSelected(null);
    setFogSelectedIndices([]);
    setTool("select");
    setPlayer(false);
    if (window.innerWidth < 800) setPanel(null);
  };
  const openExplorationMap = (id:string) => {
    if(!workspace || !scene || id===scene.id)return;
    if(!sceneTargets(workspace,scene.id).some(s=>s.id===id)){setNotice("This linked map is unavailable or belongs to another campaign.");return;}
    setExplorationHistory(h=>[...h,scene.id].slice(-30));
    activate(id);setPanel("exploration");setSidebar(true);
  };
  const importAsset = async (asset: Asset, name: string, color: string, settings?:MapImportSettings) => {
    commit((w) => {
      w.assets.push(asset);
      w.assetCampaigns[asset.id] = campaignId;
      if (dialog === "scene-map") {
        const target = w.scenes.find(item=>item.id===w.activeId)!;
        attachSceneMap(target,asset,settings);
      } else if (dialog === "map") {
        const s = newScene(name);
        s.mapType = newMapType;
        s.containerId = destination;
        Object.assign(s, fitImageDimensions(asset.width, asset.height, 8000));
        s.mapId = asset.id;
        s.grid.size = Math.max(20, Math.round(s.width / 20));
        if(settings){s.width=settings.width;s.height=settings.height;Object.assign(s.grid,settings.grid,{type:"square"});}
        w.scenes.push(s);
        w.activeId = s.id;
      } else {
        const s = w.scenes.find((s) => s.id === w.activeId)!;
        const t = {
          ...newToken(name),
          assetId: asset.id,
          color,
          ...snap({ x: s.width / 2, y: s.height / 2 }, s.grid),
        };
        s.tokens.push(t);
        const preset = { ...t, id: uid() };
        w.tokenLibrary.push(preset);
        w.libraryCampaigns[preset.id] = campaignId;
        setSelected(t.id);
      }
    });
    if (dialog === "scene-map") await manualSave();
    if (dialog === "token") setPanel("tokens");
    else if (window.innerWidth < 800) setPanel(null);
  };
  const placeLibraryToken = (t: Workspace["tokenLibrary"][number], point?: Point) => {
    if (!scene || player) return;
    const copy={...structuredClone(t),id:uid(),sourceLibraryId:t.id,conditionRounds:{},attachedToId:null,...snap(point??{x:scene.width/2,y:scene.height/2},scene.grid,t.size)};
    // Placing a saved token again numbers it (Goblin, Goblin 2), so every token keeps its own initials.
    updateScene(s=>{copy.name=placedName(t.name,s.tokens.map(x=>x.name));s.tokens.push(copy);});setSelected(copy.id);setTool("select");setPlayer(false);
  };
  // Tokens from Encyclopedia characters live only in Maptable's data; a same-named library token in this campaign is reused.
  // A character's picture is copied into Maptable's assets once, framed the way its page frames the token.
  const pictureAsset = async (c: EncyclopediaCharacter) => {
    if (!c.picture) return null;
    const r = await fetch(bookImageUrl(c.picture.imageId));
    if (!r.ok) throw new Error(`The picture for ${c.name} could not be loaded. Try again, or add it without one from Saved tokens.`);
    const { src } = await uploadAsset(await r.blob(), `${c.name}.png`), id = uid();
    commit(w => { w.assets.push({ id, name: c.name.slice(0, 120), src, width: c.picture!.width, height: c.picture!.height, kind: "image" }); w.assetLocations[id] = null; w.assetCampaigns[id] = campaignId; });
    return id;
  };
  const pictureLook = (c: EncyclopediaCharacter, assetId: string) => c.picture ? { assetId, ...tokenImageFit(c.picture), borderColor: c.picture.ring ?? roleColor[c.role], size: c.picture.squares ?? 1 } : {};
  // Placing the same character twice quickly waits for the first run, so it finds the preset the first one made.
  const encyclopediaRuns = useRef(new Map<string, Promise<void>>());
  const addEncyclopediaToken = (c: EncyclopediaCharacter, point?: Point) => {
    const runs = encyclopediaRuns.current;
    const run = (runs.get(c.id) ?? Promise.resolve()).then(() => addEncyclopediaTokenNow(c, point));
    const tail = run.catch(() => undefined);
    runs.set(c.id, tail);
    void tail.then(() => { if (runs.get(c.id) === tail) runs.delete(c.id); });
    return run;
  };
  const addEncyclopediaTokenNow = async (c: EncyclopediaCharacter, point?: Point) => {
    if (!scene || player) return;
    const existing = state.current?.tokenLibrary.find(t => t.name === c.name && (state.current?.libraryCampaigns[t.id] ?? null) === campaignId);
    if (existing) {
      let look = {};
      if (c.picture && !existing.assetId) { const assetId = await pictureAsset(c); if (assetId) look = pictureLook(c, assetId); }
      commit(w => { const t = w.tokenLibrary.find(t => t.id === existing.id); if (t) Object.assign(t, { encyclopediaEntryId: t.encyclopediaEntryId ?? c.id }, look); });
      placeLibraryToken({ ...existing, encyclopediaEntryId: existing.encyclopediaEntryId ?? c.id, ...look }, point); return;
    }
    const assetId = await pictureAsset(c);
    // Without a picture the token takes its side's colours and initials: pc Party, companion Ally, NPC Neutral, creature Enemy.
    const side = roleSide[c.role];
    const preset: Workspace["tokenLibrary"][number] = { ...newToken(c.name), encyclopediaEntryId: c.id, color: SIDE_COLOURS[side].fill, useDispositionColor: false, sideColours: true,
      rosterRole: c.role === "npc" || c.role === "creature" ? "npc" : "party", disposition: side,
      ...(assetId ? pictureLook(c, assetId) : {}) };
    commit(w => { w.tokenLibrary.push(preset); w.libraryCampaigns[preset.id] = campaignId; });
    placeLibraryToken(preset, point);
  };
  // "Add to Maptable" on an Encyclopedia page opens Maptable with ?addCharacter=<page id>: add it once the scene is open.
  const pendingCharacter = useRef<string | null>(null);
  useEffect(() => { try { pendingCharacter.current = new URLSearchParams(window.location.search).get("addCharacter"); } catch { /* No address to read. */ } }, []);
  useEffect(() => {
    const id = pendingCharacter.current;
    // Wait until a scene is open on the board, not just remembered behind the dashboard.
    if (!id || !scene || player || dashboard) return;
    pendingCharacter.current = null;
    try { const url = new URL(window.location.href); url.searchParams.delete("addCharacter"); window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash); } catch { /* The address is cosmetic. */ }
    loadEncyclopedia(true).then(raw => { const c = encyclopediaCharacters(raw).find(c => c.id === id); if (!c) throw new Error("That character is no longer in your Encyclopedia."); return addEncyclopediaToken(c).then(() => setNotice(`${c.name} is on ${scene.name}.`)); })
      .catch(e => setNotice(e instanceof Error ? e.message : "Could not add the character."));
  });
  // On a phone the gallery covers the map, so arming a token puts it away to leave the map free to tap.
  const armToken = (a: ArmedToken | null) => { setArmed(a); if (a && window.innerWidth <= 900) setTokenGalleryOpen(false); };
  const disarmPlacement = useCallback(() => setArmed(null), []);
  // Only armed while it can be placed: on a scene, in GM view, with the select tool, and (for a saved token) still in the library.
  const armedNow = armed && scene && !player && tool === "select" && (armed.source !== "library" || workspace?.tokenLibrary.some(t => t.id === armed.id)) ? armed : null;
  const armedToken = armedNow?.source === "library" ? workspace?.tokenLibrary.find(t => t.id === armedNow.id) : undefined;
  const armedFace = armedNow && workspace ? <TokenFace token={armedToken ?? { ...newToken(armedNow.name), disposition: armedNow.side ?? "neutral", sideColours: true }} workspace={workspace} campaignId={campaignId} initials={tokenInitials(armedNow.name)} size={40} /> : null;
  // Quick token asks which side it is on first; Enemy is picked to start.
  const startQuickToken = () => { setSelectedIds([]); setQuickSide("enemy"); setQuickOpen(true); setPanel("tokens"); setSidebar(true); setTool("select"); setPlayer(false); };
  const addToken = (side: TokenSide) => {
    setSelectedIds([]);
    setFogSelectedIndices([]);
    const t = { ...newToken(`Token ${(scene?.tokens.length || 0) + 1}`), disposition: side, sideColours: true, color: SIDE_COLOURS[side].fill };
    setQuickOpen(false);
    updateScene((s) => {
      Object.assign(t, snap({ x: s.width / 2, y: s.height / 2 }, s.grid));
      s.tokens.push(t);
    });
    setSelected(t.id);
    setPanel("tokens");
    setTool("select");
    setPlayer(false);
  };
  const patchToken = (patch: Partial<NonNullable<typeof token>>) =>
    updateScene((s) => {
      const t = s.tokens.find((t) => t.id === selected);
      if (t) {
        Object.assign(t, patch);
        if (patch.size !== undefined) Object.assign(t, snap(t, s.grid, t.size));
      }
    });
  const patchGrid = (patch: Partial<Grid>) =>
    updateScene((s) => Object.assign(s.grid, patch));
  const removeSelected = () => {
    updateScene((s) => {
      s.tokens = s.tokens.filter((t) => t.id !== selected);
      s.effects = s.effects.filter((t) => t.id !== selected);
    });
    setSelected(null);
  };
  const backup = async () => {
    if (!state.current) return;
    setBusy(true);
    setNotice("Preparing a backup with image files…");
    try {
      const copy = structuredClone(state.current);
      const files: Record<string, string> = {};
      for (const a of copy.assets) {
        const res = await fetch(a.src, {
          credentials: a.src.startsWith("/") ? "same-origin" : "omit",
        });
        if (!res.ok)
          throw new Error(`Cannot back up ${a.name}. Check its image URL.`);
        const blob = await res.blob();
        files[a.id] = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      }
      download(
        new Blob(
          [
            JSON.stringify({
              format: "maptable-backup",
              workspace: copy,
              files,
            }),
          ],
          { type: "application/json" },
        ),
        `maptable-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setNotice("Backup downloaded, including your images.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const backupLocalChanges = () => {
    if(!state.current)return;
    download(new Blob([JSON.stringify({format:'maptable-backup',workspace:state.current,files:{}})],{type:'application/json'}),`maptable-local-changes-${new Date().toISOString().slice(0,10)}.json`);
    setNotice('Local changes downloaded. Image links are included; image files are not embedded.');
  };
  const recoverCloud = () => {
    if(timer.current){clearTimeout(timer.current);timer.current=null;}
    void load();
  };
  const restore = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 200 * 1024 * 1024)
        throw new Error("This backup is larger than 200 MB.");
      const data = JSON.parse(await file.text());
      if (data.format !== "maptable-backup")
        throw new Error("Choose a Maptable backup file.");
      const parsed = workspaceSchema.parse(data.workspace);
      for (const a of parsed.assets) {
        const embedded = data.files?.[a.id];
        if (
          typeof embedded === "string" &&
          /^data:image\/(png|jpeg|webp);base64,/.test(embedded)
        ) {
          const blob = await (await fetch(embedded)).blob();
          a.src = (await uploadAsset(blob, a.name)).src;
        }
      }
      const remap = new Map<string, string>();
      const remapId = (id: string) => {
        if (!remap.has(id)) remap.set(id, uid());
        return remap.get(id)!;
      };
      commit((w) => {
        parsed.effectPresetFolders.forEach(f=>w.effectPresetFolders.push({...f,id:remapId(f.id),parentId:f.parentId?remapId(f.parentId):null}));
        parsed.effectPresets.forEach(p=>w.effectPresets.push({...p,id:remapId(p.id)}));
        for(const [id,folder] of Object.entries(parsed.presetLocations))w.presetLocations[remapId(id)]=folder?remapId(folder):null;
        parsed.conditionFolders.forEach(f=>w.conditionFolders.push({...f,id:remapId(f.id),parentId:f.parentId?remapId(f.parentId):null}));
        for(const [id,folder] of Object.entries(parsed.conditionLocations)) w.conditionLocations[remapId(id)]=folder?remapId(folder):null;
        parsed.assetFolders.forEach(f=>w.assetFolders.push({...f,id:remapId(f.id),parentId:f.parentId?remapId(f.parentId):null}));
        parsed.tokenFolders.forEach(f=>w.tokenFolders.push({...f,id:remapId(f.id),parentId:f.parentId?remapId(f.parentId):null,campaignId:f.campaignId?remapId(f.campaignId):null}));
        parsed.collections.forEach((c) => w.collections.push({
          ...c, id: remapId(c.id), parentId: c.parentId ? remapId(c.parentId) : null,
        }));
        parsed.conditions.forEach((c) =>
          w.conditions.push({ ...c, id: remapId(c.id),assetId:c.assetId?remapId(c.assetId):null }),
        );
        parsed.assets.forEach((a) => {
          w.assets.push({ ...a, id: remapId(a.id) });
          const owner = parsed.assetCampaigns[a.id];
          w.assetCampaigns[remapId(a.id)] = owner ? remapId(owner) : null;
          const folder=parsed.assetLocations[a.id];
          w.assetLocations[remapId(a.id)]=folder?remapId(folder):null;
        });
        const tokenCopy = (t: Workspace["tokenLibrary"][number]) => ({
          ...t,
          id: remapId(t.id),
          sourceLibraryId: t.sourceLibraryId ? remapId(t.sourceLibraryId) : undefined,
          conditionRounds: t.conditionRounds ? Object.fromEntries(Object.entries(t.conditionRounds).map(([id,round])=>[remapId(id),round])) : undefined,
          assetId: t.assetId ? remapId(t.assetId) : null,
          borderAssetId: t.borderAssetId ? remapId(t.borderAssetId) : null,
          conditions: t.conditions.map(remapId),
          attachedToId: null as string|null,
        });
        parsed.tokenLibrary.forEach((t) => {
          const copy = tokenCopy(t); w.tokenLibrary.push(copy);
          const owner = parsed.libraryCampaigns[t.id];
          w.libraryCampaigns[copy.id] = owner ? remapId(owner) : null;
          const tokenFolder=parsed.tokenFolderLocations[t.id];
          w.tokenFolderLocations[copy.id]=tokenFolder?remapId(tokenFolder):null;
          const folder=parsed.libraryLocations[t.id];
          w.libraryLocations[copy.id]=folder?remapId(folder):null;
        });
        parsed.scenes.forEach((s) => {
          const tokens=s.tokens.map(tokenCopy);
          const tokenIds=new Map(s.tokens.map((t,i)=>[t.id,tokens[i].id]));
          tokens.forEach((t,i)=>{t.attachedToId=s.tokens[i].attachedToId?tokenIds.get(s.tokens[i].attachedToId!)??null:null;});
          w.scenes.push({
            ...s,
            id: remapId(s.id),
            name: s.name,
            folder: "",
            containerId: s.containerId ? remapId(s.containerId) : null,
            mapId: s.mapId ? remapId(s.mapId) : null,
            poiFolders:s.poiFolders.map(f=>({...f,id:remapId(f.id),parentId:f.parentId?remapId(f.parentId):null})),
            initiativeState:s.initiativeState?{...s.initiativeState,currentId:s.initiativeState.currentId?(tokenIds.get(s.initiativeState.currentId)??s.initiativeState.currentId):null,order:s.initiativeState.order.map(id=>tokenIds.get(id)??id)}:undefined,
            pointsOfInterest:s.pointsOfInterest.map(p=>({...p,id:uid(),folderId:p.folderId?remapId(p.folderId):null,targetSceneId:p.targetSceneId?remapId(p.targetSceneId):null})),
            tokens,
            effects: s.effects.map((e) => ({ ...e, id: uid(),tokenId:e.tokenId?tokenIds.get(e.tokenId)??null:null })),
          });
        });
        w.activeId = remapId(parsed.activeId);
      });
      setNotice("Backup imported as additional scenes.");
    } catch (e) {
      setNotice("Import failed: " + (e as Error).message);
    } finally {
      setBusy(false);
      if (backupInput.current) backupInput.current.value = "";
    }
  };

  if (!workspace || !scene)
    return (
      <main className="loading-screen">
        <div className="brand">
          <MapIcon size={28} />
          <a href="/" title="RPG Tools home">Maptable</a>
        </div>
        <p role={loadError ? "alert" : undefined}>{loadError || "Opening your table…"}</p>
        {loadError && (
          <button className="primary" onClick={() => void load()}>
            Try again
          </button>
        )}
      </main>
    );
  const visibleLibrary = workspace.tokenLibrary.filter((t) => !workspace.libraryCampaigns[t.id] || workspace.libraryCampaigns[t.id] === campaignId);
  const unfiledCount = workspace ? workspace.scenes.filter((s) => campaignFor(s.containerId) === null).length : 0;
  const enterScene = (id: string) => {
    activate(id); setLocation(campaignFor(workspace.scenes.find(s => s.id === id)?.containerId ?? null));
    setPanel("scenes"); setSidebar(true); setDashboard(false); setOverview(null); setSearch("");
  };
  // Campaigns › campaign › folders › scene. Folder arrows list the scenes in that folder.
  const sceneTrail = (): Crumb[] => {
    const toCampaigns = () => { setDashboard(true); setOverview(null); setGridAdjust(false); };
    const toCampaign = (id: string | null) => { setOverview({ id }); setDashboard(true); setGridAdjust(false); };
    const open = (id: string) => { activate(id); setSelected(null); };
    const folders: typeof workspace.collections = [];
    for (let at = workspace.collections.find(c => c.id === scene.containerId); at && at.kind === "folder" && !folders.includes(at); at = workspace.collections.find(c => c.id === at!.parentId)) folders.unshift(at);
    const campaigns = workspace.collections.filter(c => c.kind === "campaign");
    return [
      { id: "campaigns", label: "Campaigns", icon: <LayoutDashboard size={15} aria-hidden="true" />, go: toCampaigns },
      { id: "campaign", label: campaign?.name || "Not in a campaign", go: () => toCampaign(campaignId),
        siblings: { heading: "Campaigns", items: campaigns.map(c => ({ id: c.id, label: c.name, current: c.id === campaignId, go: () => openCampaign(c.id) })) } },
      ...folders.map(f => ({ id: f.id, label: f.name,
        siblings: { heading: `Scenes in ${f.name}`, items: workspace.scenes.filter(x => x.containerId === f.id).map(x => ({ id: x.id, label: x.name, current: x.id === scene.id, go: () => open(x.id) })) } })),
      { id: "scene", label: scene.name, render: <SceneSwitcher workspace={workspace} campaignId={campaignId} scene={scene} open={open} settings={()=>{setSceneTab("general");setPanel("scene");setSidebar(true);}} /> },
    ];
  };
  const openCampaign = (id: string | null) => {
    const first = workspace.scenes.find((s) => campaignFor(s.containerId) === id);
    if (first) { setOverview({ id }); setDashboard(true); return; }
    commit((w) => {
      const created = newScene("First scene"); created.containerId = id;
      w.scenes.push(created); w.activeId = created.id;
    });
    setLocation(id); setPanel("scenes"); setSidebar(true); setDashboard(false); setSearch("");
  };
  const aiTurn=scene?getCurrentInitiativeEntry(scene):null,aiOrder=scene&&aiTurn?getInitiativeEntries(scene).filter(isInitiativeEntryActive):[];
  // The AI panel's combat line; "focus" above asks the sync loop to fetch now (it listens for focus).
  const aiCombat=scene&&aiTurn?{round:scene.initiativeState?.round??1,turn:aiTurn.label,next:aiOrder[(aiOrder.findIndex(e=>e.id===aiTurn.id)+1)%aiOrder.length]?.label}:null;
  const setAutosave=(on:boolean)=>{autosave.set(on);if(on&&generation.current!==savedGeneration.current)void save();};
  const saveChip=<SaveChip status={saveStatus} error={saveError} conflict={blocked.current} onSave={()=>void manualSave()} autosave={{on:autosave.on,set:setAutosave,changes:unsaved,lastSaved}}/>;
  const saveRecovery=saveError&&<SaveConflictNotice status={{phase:blocked.current?'conflict':'error',message:saveError}} onDownload={backupLocalChanges} onReload={recoverCloud} onRetry={()=>void save()} disabled={busy||saveStatus==='Saving…'} detail="Download preserves scene data and image links. A full backup with image files is available in Backups."/>;
  if (creatorOpen) return <>{saveRecovery}<MapCreator workspace={workspace} initialId={scene.drawing ? scene.id : null} destination={destination} commit={commit} persist={manualSave} saveStatus={saveError || saveStatus} close={(id)=>{setCreatorOpen(false);if(id){activate(id);setDashboard(false);setPanel("scenes");}}}/></>;
  const overviewOpen = dashboard && overview && workspace.scenes.some(s => campaignFor(s.containerId) === overview.id);
  const coGmBar = member && <div className="co-gm-bar" role="note"><Users size={15} aria-hidden="true" /><span><strong>{member.ownerName}&apos;s campaign</strong> · You&apos;re a co-GM here. Your changes save to their maps.</span><a href={`/encyclopedia#m-${mapMemberRef()}`}>Open the Encyclopedia</a><NextLink href="/campaigns">Back to Campaigns</NextLink></div>;
  // The Encyclopedia link follows the active campaign: the open overview, else the open scene's campaign. Co-GMs keep their own link.
  const activeCampaignId = overviewOpen ? overview.id : campaignId;
  const encyclopediaHref = member ? `/encyclopedia#m-${mapMemberRef()}` : activeCampaignId ? `/encyclopedia?maptable=${encodeURIComponent(activeCampaignId)}` : undefined;
  // The menu's Campaigns item opens the active campaign's overview when it has scenes, else the list of campaigns.
  const toActiveCampaign = () => { setGridAdjust(false); setDashboard(true); setOverview(campaignId && workspace.scenes.some(s => campaignFor(s.containerId) === campaignId) ? { id: campaignId } : null); };
  if (dashboard) return <main className={"campaign-dashboard" + (member ? " is-co-gm" : "")}>
    <header><ToolSwitch active="maptable" encyclopediaHref={encyclopediaHref} /><nav className="header-scene" aria-label="Breadcrumb"><span className="divider" />{overviewOpen ? <><button className="crumb crumb-home" onClick={() => setOverview(null)}><LayoutDashboard size={15} aria-hidden="true" />Campaigns</button><ChevronRight size={14} aria-hidden="true" className="crumb-sep" /><strong aria-current="page">{workspace.collections.find(c => c.id === overview.id)?.name ?? "Not in a campaign"}</strong></> : <strong aria-current="page">Campaigns</strong>}</nav><div className="header-actions">{saveChip}<button className="icon-button" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo" disabled={!history.current.length} onClick={undo}><Undo2 size={17} aria-hidden="true" /></button><button className="icon-button" title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Redo2 size={17} aria-hidden="true" /></button><AppearanceMenu /><AccountLink /></div></header>
    {coGmBar}
    {overviewOpen ? <div className="dashboard-content">{saveRecovery}<CampaignScenes workspace={workspace} campaignId={overview.id}
      lastSceneId={campaignFor(scene.containerId) === overview.id ? scene.id : null} open={enterScene} back={() => setOverview(null)}
      addScenes={() => { const target = campaignFor(scene.containerId) === overview.id ? scene : workspace.scenes.find(s => campaignFor(s.containerId) === overview.id); if (target) { enterScene(target.id); setNewMapType("encounter"); setDialog("add-scenes"); } }} /></div> :
    <div className="dashboard-content">
      {saveRecovery}
      {workspace.scenes.some((s) => s.id === scene.id) && <button className="dashboard-continue" onClick={() => setDashboard(false)}>
        <span><small>Continue where you left off</small><strong>{scene.name}</strong><span>{campaign?.name ?? "Not in a campaign"} · {countLabel(scene.tokens.length, "token")}</span></span>
        <span className="dashboard-continue-action">Open map <ChevronRight size={17} aria-hidden="true" /></span>
      </button>}
      <div className="dashboard-title"><h1>Campaigns</h1></div>
      {(workspace.collections.length >= 8 || dashboardSearch) && <input className="search" aria-label="Search campaigns" placeholder="Find a campaign or folder" value={dashboardSearch} onChange={(e) => setDashboardSearch(e.target.value)} />}
      <SceneOrganizer workspace={workspace} dashboard openCampaign={openCampaign} location={workspace.collections.some((c) => c.id === dashboardLocation) ? dashboardLocation : null}
        setLocation={setDashboardLocation} commit={commit} activate={activate} search={dashboardSearch} lastCampaignId={campaignId}
        extraActions={<button onClick={() => setCreatorOpen(true)}><MapIcon size={16} aria-hidden="true" />Create a map</button>} />
      {unfiledCount > 0 && <button className="dashboard-unfiled" onClick={() => openCampaign(null)}>
        <MapIcon size={22} aria-hidden="true" /><span><strong>Maps not in a campaign</strong><small>{countLabel(unfiledCount, "scene")}</small></span>
      </button>}
    </div>}
  </main>;
  return (
    <main className={"app-shell" + (member ? " is-co-gm" : "")} data-mobile-tools={mobileToolsOpen} data-panel-expanded={mobilePanelExpanded}>
      <header className="app-header">
        <ToolSwitch active="maptable" encyclopediaHref={encyclopediaHref} />
        <div className="header-scene">
          <span className="divider" />
          <Breadcrumbs items={sceneTrail()} />
        </div>
        <button className="header-campaigns-compact" onClick={() => {setDashboard(true);setOverview(null);setGridAdjust(false);}}><ChevronLeft size={17} aria-hidden="true" />Campaigns</button>
        {campaignId && !member && <AiActivity maptableCampaignId={campaignId} combat={aiCombat} scene={scene?.name} onChanged={() => window.dispatchEvent(new Event("focus"))} onSuggestedMoves={setSuggestedMoves}/>}
        {saveChip}{syncNote && <span className="map-sync-note" role="status">{syncNote}</span>}
        <button className="mobile-only mobile-menu-button" aria-expanded={mobileHeaderOpen} onClick={()=>setMobileHeaderOpen(v=>!v)}>Map menu</button>
        <div className="header-actions" data-mobile-open={mobileHeaderOpen}>
          <AppearanceMenu />
          <button aria-expanded={tokenGalleryOpen} onClick={()=>setTokenGalleryOpen(v=>!v)}>Token gallery</button>
          {!member && <button
            className="icon-button"
            title="Connections"
            aria-label="Connections"
            onClick={() => setDialog("connections")}
          >
            <Link size={19} />
          </button>}
          {!member && <button
            className="primary share-button"
            onClick={() => setDialog("export")}
          >
            <Share2 size={17} />
            <span>Share map</span>
          </button>}
          <AccountLink />
        </div>
      </header>
      {coGmBar}
      <div className="workspace">
        <nav className="rail" aria-label="Workspace tools" onClick={()=>setMobileToolsOpen(false)}>
          <button
            className={panel === "scenes" || panel === "scene" ? "active" : ""}
            onClick={() => {
              setPanel(panel === "scenes" ? null : "scenes");
              setSidebar(true);
            }}
            title="Scenes"
          >
            <Layers size={21} />
            <span>Scenes</span>
          </button>
          <button
            className={panel === "tokens" ? "active" : ""}
            onClick={() => {
              setPanel(panel === "tokens" ? null : "tokens");
              setSidebar(true);
            }}
            title="Tokens"
          >
            <UserRound size={21} />
            <span>Tokens</span>
          </button>
          <button title="Exploration" className={panel==="exploration"?"active":""} onClick={()=>{setPanel("exploration");setSidebar(true);}}><Compass size={21}/><span>Explore</span></button>
          <button title="Auras & AoEs" className={panel === "effects"?"active":""} onClick={()=>{setPanel("effects");setSidebar(true);}}><Circle size={21}/><span>Auras & AoEs</span></button>
          <button title="Fog of War" className={panel==="fog"?"active":""} onClick={()=>chooseTool("reveal")}><EyeOff size={21}/><span>Fog of War</span></button>
          <button title="Assets" onClick={() => {setPanel("assets");setSidebar(true);}} className={panel === "assets" ? "active" : ""}><Upload size={21}/><span>Assets</span></button>
          <button
            className={panel === "grid" ? "active" : ""}
            onClick={() => {
              setPanel(panel === "grid" ? null : "grid");
              setSidebar(true);
            }}
            title="Grid"
          >
            <MapIcon size={21} />
            <span>Grid</span>
          </button>
          <button
            className={panel === "conditions" ? "active" : ""}
            onClick={() => {
              setPanel(panel === "conditions" ? null : "conditions");
              setSidebar(true);
            }}
            title="Conditions"
          >
            <Shield size={21} />
            <span>Conditions</span>
          </button>
          <button className="mobile-only" aria-expanded={dicePanel==="dice"} aria-controls="standard-dice-tray" onClick={()=>toggleDicePanel("dice")} title="Dice tray"><Dices size={21} aria-hidden="true" /><span>Dice</span></button>
          <button className="mobile-only" aria-expanded={dicePanel==="log"} aria-controls="local-roll-log" onClick={()=>toggleDicePanel("log")} title="Roll log"><ScrollText size={21} aria-hidden="true" /><span>Roll log</span></button>
          <div className="rail-spacer" />

          <button onClick={() => setDialog("help")} title="Help">
            <HelpCircle size={21} />
            <span>Help</span>
          </button>
          <button title="Map Creator" onClick={()=>{setGridAdjust(false);setCreatorOpen(true);}}><MapIcon size={21}/><span>Create map</span></button>
          <button title="Campaigns" onClick={toActiveCampaign}><LayoutDashboard size={21}/><span>Campaigns</span></button>
        </nav>
        <nav className="mobile-navigation" aria-label="Phone navigation">
          <button onClick={()=>{setSidebar(false);setMobileToolsOpen(false);}}>Map</button>
          <button aria-pressed={(panel==="scenes"||panel==="scene")&&sidebar} onClick={()=>{setPanel("scenes");setSidebar(true);setMobileToolsOpen(false);}}>Scenes</button>
          <button aria-pressed={panel==="tokens"&&sidebar} onClick={()=>{setPanel("tokens");setSidebar(true);setMobileToolsOpen(false);}}>Tokens</button>
          <button aria-expanded={mobileToolsOpen} onClick={()=>{setMobileToolsOpen(v=>!v);setMobileHeaderOpen(false);}}>Tools</button>
        </nav>
        {panel && sidebar && (
          <ResizableSidebar className="side-panel" storageKey={`maptable:sidebar-width:${navigationScope ?? "local"}`}>
            <div className="panel-title">
              <h2>
                {panel === "scenes"
                  ? "Scenes"
                  : panel === "scene" ? "Scene settings"
                  : panel === "exploration" ? "Exploration maps"
                  : panel === "assets" ? "Campaign assets"
                  : panel === "tokens"
                    ? "Tokens & selection"
                    : panel === "grid"
                      ? "Grid & scale"
                      : panel === "fog"
                        ? "Fog of war"
                        : panel === "effects"
                          ? "Auras & AoEs"
                          : "Custom conditions"}
              </h2>
              <button className="mobile-only" aria-expanded={mobilePanelExpanded} onClick={()=>setMobilePanelExpanded(v=>!v)}>{mobilePanelExpanded?"Shrink":"Expand"}</button>
              <button aria-label="Close panel" onClick={() => setPanel(null)}>
                <X size={17} />
              </button>
            </div>
            <div className="panel-content">
              {panel==="exploration" && <>
                {!!explorationHistory.length && <button onClick={()=>{
                  const id=explorationHistory.at(-1)!;
                  setExplorationHistory(h=>h.slice(0,-1));
                  if(sceneTargets(workspace,scene.id).some(s=>s.id===id)){activate(id);setPanel("exploration");setSidebar(true);}
                  else setNotice("Previous map is no longer in this campaign.");
                }}>Back to previous map</button>}
                <ExplorationPanel workspace={workspace} scene={scene} update={updateScene} pages={linkable} book={book} bookError={bookError} selectedId={selectedPoiId} select={id=>{setSelectedPoiId(id);setTool("select");}} place={activation=>{setPoiActivation(activation);chooseTool("poi");}} openScene={openExplorationMap} createMap={type=>{setNewMapType(type);setDialog("add-scenes");}}/>
                {scene.mapType!=="world"&&<AreasPanel areas={scene.areas??[]} book={book} selectedId={openAreaId} drawing={areaDrawing} onSelect={id=>setOpenArea(id)} onDraw={on=>{setAreaDrawing(on);if(on){setAreaEdit(null);setOpenArea(null);}}}/>}
              </>}
              {panel === "scenes" && (
                <>
                  <div className="scenes-head">
                    <ActionMenu label="Add to this campaign" trigger={<><Plus size={16} aria-hidden="true" />New<ChevronDown size={14} aria-hidden="true" /></>} items={[
                      {icon:<Upload size={16}/>,label:"Upload a map",hint:"An image, Universal VTT file or a link",onClick:()=>{setLocation(destination);setNewMapType("encounter");setDialog("map");}},
                      {icon:<Grid3x3 size={16}/>,label:"Blank encounter map",hint:"A grid to draw on and place tokens",onClick:()=>{const s=newScene();s.containerId=destination;commit(w=>{w.scenes.push(s);w.activeId=s.id;});setSelected(null);}},
                      {icon:<MapIcon size={16}/>,label:"Area map",hint:"A town, dungeon level or region with pins",onClick:()=>{setNewMapType("area");setDialog("add-scenes");}},
                      {icon:<Globe size={16}/>,label:"World map",hint:"The whole world, for travel and weather",onClick:()=>{setNewMapType("world");setDialog("add-scenes");}},
                      {icon:<LayoutGrid size={16}/>,label:"Split a large map",hint:campaignId?"Cut one big image into linked areas":"Open a campaign first",disabled:!campaignId,divider:true,onClick:()=>{setLocation(destination);setDialog("split-map");}},
                      {icon:<Copy size={16}/>,label:"Copy from another campaign",hint:"Bring scenes with their tokens and fog",onClick:()=>{setNewMapType("encounter");setDialog("add-scenes");}},
                      {icon:<FolderPlus size={16}/>,label:"New folder",hint:"Group scenes by act, chapter or session",divider:true,onClick:()=>setFolderRequest(n=>n+1)},
                    ]}/>
                    <input
                      className="search"
                      aria-label="Search scenes"
                      placeholder="Find a scene…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <SceneOrganizer workspace={workspace} rootId={campaignId} location={destination} setLocation={setLocation}
                    commit={commit} activate={activate} search={search} newFolderRequest={folderRequest}
                    onSettings={id=>{activate(id);setSceneTab("general");setPanel("scene");}} />
                  <details className="scenes-backups" hidden={!!member}>
                    <summary>Backups and import</summary>
                  <h3>Backups</h3>
                  <p className="muted">
                    Cloud saves follow you between devices. A backup includes
                    all scenes and images.
                  </p>
                  <div className="button-row">
                    <button disabled={busy} onClick={() => void backup()}>
                      <Download size={15} />
                      Backup
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => backupInput.current?.click()}
                    >
                      <Upload size={15} />
                      Import
                    </button>
                  </div>
                  </details>
                </>
              )}
              {panel === "scene" && (
                <>
                  <button className="scene-settings-back" onClick={()=>setPanel("scenes")}><ChevronLeft size={15} aria-hidden="true" />All scenes</button>
                  <div className="scene-settings-tabs" role="tablist" aria-label="Scene settings">
                    {([["general","General"],["map","Map image"],...(!scene.mapId?[["size","Size"] as const]:[])] as const).map(([id,label])=><button key={id} role="tab" aria-selected={settingsTab===id} onClick={()=>setSceneTab(id)}>{label}</button>)}
                  </div>
                  {settingsTab==="general" && <>
                  <Field label="Name">
                    <input
                      maxLength={120}
                      value={scene.name}
                      onChange={(e) =>
                        updateScene((s) => {
                          s.name = e.target.value || "Untitled scene";
                        })
                      }
                    />
                  </Field>
                  <div className="field scene-tags"><span>Tags</span><TagRow targets={[`scene:${scene.id}`]}/></div>
                  <Field label="Kind of map"><select value={scene.mapType} onChange={e=>updateScene(s=>{s.mapType=e.target.value as Scene["mapType"];})}><option value="encounter">Encounter map</option><option value="area">Area map</option><option value="world">World map</option></select></Field>
                  <p className="muted">Area and world maps also show up in Explore.</p>
                  <Field label="Campaign and folder">
                    <select aria-label="Move scene to" value={scene.containerId ?? ""} onChange={(e) => {
                      const containerId = e.target.value || null;
                      updateScene((s) => { s.containerId = containerId; s.folder = ""; });
                      setLocation(containerId);
                    }}><LocationOptions workspace={workspace} /></select>
                  </Field>
                  <div className="button-row">
                    <button
                      onClick={() =>
                        commit((w) => {
                          const copy = structuredClone(scene);
                          copy.id = uid();
                          copy.name = (scene.name + " copy").slice(0, 120);
                          w.scenes.push(copy);
                          w.activeId = copy.id;
                        })
                      }
                    >
                      <Copy size={15} />
                      Duplicate
                    </button>
                    <button
                      disabled={workspace.scenes.length < 2}
                      className="danger"
                      onClick={() => {
                        commit((w) => {
                          w.scenes = w.scenes.filter((s) => s.id !== scene.id);
                          w.activeId = w.scenes[0].id;
                        });
                        setSelected(null);
                        setNotice("Scene removed. Use Undo to restore it.");
                      }}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Remove scene
                    </button>
                  </div>
                  </>}
                  {settingsTab==="map" && <>
                    <p className="muted">{scene.mapId ? "This scene uses an uploaded map. Replacing it keeps tokens, fog and pins." : scene.drawing ? "This scene uses a drawn map." : "This scene is a blank grid. Upload a map image to put under it."}</p>
                  <button onClick={async()=>{
                    if(scene.drawing && !await confirmDialog({title:"Replace this scene’s drawing?",message:"The uploaded map takes the drawing’s place. Tokens, fog and other scene settings are kept.",confirm:"Replace drawing"}))return;
                    setDialog("scene-map");
                  }}>{scene.mapId || scene.drawing ? "Replace map" : "Upload map"}</button>
                    <p className="muted">Grid size and offset are under Grid in the tool rail.</p>
                  </>}
                  {settingsTab==="size" && !scene.mapId && <>
                  {!scene.mapId && (
                    <>
                    <div className="form-row">
                      <NumberField
                        label="Width (px)"
                        min={200}
                        max={8000}
                        value={scene.width}
                        onChange={(v) =>
                          updateScene((s) => {
                            s.width = v;
                          })
                        }
                      />
                      <NumberField
                        label="Height (px)"
                        min={200}
                        max={8000}
                        value={scene.height}
                        onChange={(v) =>
                          updateScene((s) => {
                            s.height = v;
                          })
                        }
                      />
                    </div>
                    <Field label={`Map width · ${scene.width} px`}><input type="range" aria-label="Map width slider" min={200} max={8000} step={10} value={scene.width} onChange={e=>updateScene(s=>{s.width=Number(e.target.value);})}/></Field>
                    <Field label={`Map height · ${scene.height} px`}><input type="range" aria-label="Map height slider" min={200} max={8000} step={10} value={scene.height} onChange={e=>updateScene(s=>{s.height=Number(e.target.value);})}/></Field>
                    <div className="button-row"><button onClick={()=>updateScene(s=>{s.width=Math.min(8000,s.width+s.grid.size);})}>Add column</button><button onClick={()=>updateScene(s=>{s.height=Math.min(8000,s.height+s.grid.size);})}>Add row</button></div>
                    <p className="muted">Resize the blank canvas with the sliders, or expand its right/bottom edge by one grid cell. Existing objects stay in place.</p>
                    </>
                  )}
                  </>}
                  <p className="muted scene-settings-note">Changes save as you go.</p>
                </>
              )}
              {panel === "assets" && <CampaignAssets workspace={workspace} campaignId={campaignId} commit={commit} />}
              {panel === "tokens" && (
                <>
                  <div className="button-row">
                    <button
                      className="primary grow"
                      onClick={() => setDialog("token")}
                    >
                      <Plus size={16} />
                      Make token
                    </button>
                    <button
                      title="Add a plain token with a name and a side, no image"
                      aria-expanded={quickOpen}
                      onClick={() => { setQuickSide("enemy"); setQuickOpen(open => !open); }}
                    >
                      <UserRound size={16} />
                      Quick token
                    </button>
                  </div>
                  {quickOpen && <div className="quick-token" role="group" aria-label="Quick token">
                    <h4>Which side is it on?</h4>
                    <div className="side-chips" role="group" aria-label="Side">
                      {(["party","ally","neutral","enemy"] as const).map(s => <button key={s} type="button" aria-pressed={quickSide === s} onClick={() => setQuickSide(s)}>
                        <i style={{ background: SIDE_COLOURS[s].ring }} aria-hidden="true" />{s === "party" ? "Party" : s === "ally" ? "Ally" : s === "neutral" ? "Neutral" : "Enemy"}</button>)}
                    </div>
                    <div className="button-row"><button className="primary" onClick={() => addToken(quickSide)}>Add</button><button onClick={() => setQuickOpen(false)}>Cancel</button></div>
                    <small>Enemy is picked to start, since most quick tokens are foes. It gets its side&apos;s colour and its initials; change either in Edit.</small>
                  </div>}
                  <button className="token-gallery-link" onClick={()=>setTokenGalleryOpen(true)}><LayoutGrid size={16} />Add from the token gallery</button>
                  {token ? (
                    <TokenOptions key={token.id} request={tokenEditRequest.id===token.id?tokenEditRequest.count:0} onRequestHandled={()=>setTokenEditRequest({id:"",count:0})} onDeselect={()=>setSelected(null)}
                      summary={<><TokenFace token={token} workspace={workspace} campaignId={campaignId} initials={tokenInitialsById.get(token.id)??""} /><span><small>Selected</small><strong>{token.name || "Unnamed token"}</strong></span></>}
                      render={close=><TokenEditor mode="scene" token={token} workspace={workspace} campaignId={campaignId} initials={tokenInitialsById.get(token.id)??tokenInitials(token.name)}
                        patch={patchToken} commit={commit} scene={scene} updateScene={updateScene} close={close}
                        onDuplicate={() => {
                          const t = { ...structuredClone(token), id: uid(), x: Math.min(scene.width, token.x + scene.grid.size) };
                          updateScene((s) => s.tokens.push(t));
                          setSelected(t.id);
                        }}
                        onCopy={() => {
                          const clip = copyTokens(scene, [token.id]);
                          if (!clip) return;
                          try { localStorage.setItem(TOKEN_CLIPBOARD_KEY, JSON.stringify(clip)); } catch { /* storage off */ }
                          setNotice("Copied the token · Ctrl V pastes it on the map");
                        }}
                        onDelete={removeSelected}
                        savedSummary="Save to library, stats"
                        savedCopy={<section className="editor-card" aria-label="Saved copy">
                          <h3>Saved copy</h3>
                          <SaveGalleryStats key={token.id} token={token} workspace={workspace} campaignId={campaignId} commit={commit} save={manualSave}/>
                          <button
                            className="text-button"
                            onClick={() => {
                              commit((w) => {
                                const copy = {...structuredClone(token), id: uid(), sourceLibraryId:undefined, conditionRounds:undefined, attachedToId:null,rosterRole:"library" as const};
                                w.tokenLibrary.push(copy);
                                const placed=w.scenes.flatMap(s=>s.tokens).find(t=>t.id===token.id);if(placed)placed.sourceLibraryId=copy.id;
                                w.libraryCampaigns[copy.id] = campaignId;
                              });
                              setNotice("Token saved to your library.");
                            }}
                          >
                            Save to token library
                          </button>
                          <div className="button-row">{(["npc","party"] as const).map(role=><button key={role} disabled={!campaignId} onClick={()=>{commit(w=>{const copy={...structuredClone(token),id:uid(),sourceLibraryId:undefined,conditionRounds:undefined,attachedToId:null,rosterRole:role};w.tokenLibrary.push(copy);const placed=w.scenes.flatMap(s=>s.tokens).find(t=>t.id===token.id);if(placed)placed.sourceLibraryId=copy.id;w.libraryCampaigns[copy.id]=campaignId;});setNotice(role==="npc"?"Saved to campaign NPCs.":"Saved to party.");}}>Save as {role==="npc"?"NPC":"party member"}</button>)}</div>
                        </section>}/>}/>
                  ) : effect ? (
                    <>
                      <h3>Selected area effect</h3>
                      <Field label="Label">
                        <input
                          maxLength={120}
                          value={effect.label}
                          onChange={(e) =>
                            updateScene((s) => {
                              s.effects.find((t) => t.id === effect.id)!.label =
                                e.target.value;
                            })
                          }
                        />
                      </Field>
                      <NumberField
                        label={
                          effect.type === "circle"
                            ? "Radius (cells)"
                            : "Side length (cells)"
                        }
                        min={0.25}
                        max={200}
                        step={0.25}
                        value={effect.size}
                        onChange={(v) =>
                          updateScene((s) => {
                            s.effects.find((t) => t.id === effect.id)!.size = v;
                          })
                        }
                      />
                      <Field label="Color">
                        <input
                          type="color"
                          value={effect.color}
                          onChange={(e) =>
                            updateScene((s) => {
                              s.effects.find((t) => t.id === effect.id)!.color =
                                e.target.value;
                            })
                          }
                        />
                      </Field>
                      <button className="danger" onClick={removeSelected}>
                        <Trash2 size={15} />
                        Remove effect
                      </button>
                    </>
                  ) : scene.tokens.length > 0 ? (
                    <p className="muted token-panel-hint">
                      Click a token here or on the map to edit it.
                    </p>
                  ) : null}
                  <h3 className="token-panel-heading">
                    On this map{" "}
                    <span className="count">{scene.tokens.length}</span>
                  </h3>
                  {(scene.tokens.length > 5 || tokenSearch) && <input aria-label="Find tokens on this map" placeholder="Find a token on this map…" value={tokenSearch} onChange={e => setTokenSearch(e.target.value)} />}
                  <div className="token-list">
                    {scene.tokens.filter(t => t.name.toLowerCase().includes(tokenSearch.trim().toLowerCase())).map((t) => (
                      <div className="token-list-row" key={t.id}>
                      <button
                        key={t.id}
                        className={selected === t.id ? "active" : ""}
                        onClick={() => {
                          setSelected(t.id);
                          setTokenEditRequest(r=>({id:t.id,count:r.count+1}));
                          setTool("select");
                          setPlayer(false);
                        }}
                      >
                        <TokenFace token={t} workspace={workspace} campaignId={campaignId} initials={tokenInitialsById.get(t.id) ?? ""} />
                        <span>
                          <strong>{t.name || "Unnamed token"}</strong>
                          <small>
                            {address(t, scene.grid)}{resolvedToken(workspace,scene.id,t).showHp && <> · {t.hp}/{t.maxHp} HP</>}{t.partyMarker && " · Party marker"}{t.status === "dead" ? " · Dead" : t.status === "unconscious" ? " · Unconscious" : ""}
                          </small>
                        </span>
                      </button>
                      <label className="token-row-initiative"><span>Init</span><InitiativeField label={`${t.name} initiative`} value={t.initiative} onCommit={value=>updateScene(s=>{const item=s.tokens.find(x=>x.id===t.id);if(item)item.initiative=value;})}/></label><button className="token-visibility" aria-label={`${t.hidden?"Show":"Hide"} ${t.name} ${t.hidden?"to":"from"} players`} title={t.hidden?"Hidden from players — click to show":"Visible to players — click to hide"} aria-pressed={t.hidden} onClick={()=>updateScene(s=>{s.tokens.find(item=>item.id===t.id)!.hidden=!t.hidden;})}>{t.hidden?<EyeOff size={17}/>:<Eye size={17}/>}</button>
                      </div>
                    ))}
                  </div>
                  {!scene.tokens.length && (
                    <p className="empty-small">No tokens on this map yet. Make one from an image, or add a quick token with just a name.</p>
                  )}
                  <h3 className="token-panel-heading">Initiative</h3>
                  <MapInitiative scene={scene} campaignId={campaignId} update={updateScene} save={manualSave} workspace={workspace}/>
                  <CampaignTokenDefaults workspace={workspace} campaignId={campaignId} commit={commit}/>
                </>
              )}
              {panel === "grid" && (
                <>
                  <PanelTip more={<>
                    <p>Change the size and offsets until the grid sits on the one printed on your map. Press Enter or leave a field to apply it. Values use map pixels, whatever the zoom.</p>
                    <p>Grid adjust mode lets you drag the map to move the grid and use the arrow keys or the scroll wheel for fine changes.</p>
                    <p>The map background shows on blank maps and through transparent images. Drawn maps use their Map Creator colours.</p>
                  </>}>Line the grid up with the one printed on your map.</PanelTip>
                  <Field label="Grid type">
                    <select
                      aria-label="Grid type"
                      value={scene.grid.type}
                      onChange={(e) =>
                        patchGrid({ type: e.target.value as Grid["type"] })
                      }
                    >
                      <option value="square">Square</option>
                      <option value="hex-flat">Hex · flat top</option>
                      <option value="hex-pointy">Hex · pointed top</option>
                      <option value="none">No grid</option>
                    </select>
                  </Field>
                  <Field
                    label={`Grid size · ${scene.grid.size} px`}
                    hint="Drag to resize the grid live. Use the number below for precise adjustments."
                  >
                    <input
                      type="range"
                      aria-label="Grid size slider"
                      aria-valuetext={`${scene.grid.size} pixels${scene.grid.type.startsWith("hex") ? " hex radius" : " per cell"}`}
                      min={20}
                      max={500}
                      step={0.1}
                      value={scene.grid.size}
                      onChange={(e) => patchGrid({ size: Number(e.target.value) })}
                    />
                  </Field>
                  <NumberField
                    label={
                      scene.grid.type.startsWith("hex")
                        ? "Hex radius (px)"
                        : "Cell size (px)"
                    }
                    min={20}
                    max={500}
                    step={0.1}
                    value={scene.grid.size}
                    onChange={(size) => patchGrid({ size })}
                  />
                  <Field label={`Horizontal offset · ${scene.grid.offsetX} px`}>
                    <input type="range" aria-label="X offset slider"
                      min={-500} max={500} step={0.1}
                      value={scene.grid.offsetX}
                      onChange={(e) => patchGrid({ offsetX: Number(e.target.value) })} />
                  </Field>
                  <Field label={`Vertical offset · ${scene.grid.offsetY} px`}>
                    <input type="range" aria-label="Y offset slider"
                      min={-500} max={500} step={0.1}
                      value={scene.grid.offsetY}
                      onChange={(e) => patchGrid({ offsetY: Number(e.target.value) })} />
                  </Field>
                  <div className="form-row">
                    <NumberField
                      label="X offset (px)"
                      step={0.1}
                      min={-500}
                      max={500}
                      value={scene.grid.offsetX}
                      onChange={(offsetX) => patchGrid({ offsetX })}
                    />
                    <NumberField
                      label="Y offset (px)"
                      step={0.1}
                      min={-500}
                      max={500}
                      value={scene.grid.offsetY}
                      onChange={(offsetY) => patchGrid({ offsetY })}
                    />
                  </div>
                  <button className={gridAdjust ? "active" : ""}
                    aria-pressed={gridAdjust}
                    disabled={scene.grid.type === "none"}
                    onClick={() => {
                      setGridAdjust(!gridAdjust);
                      if (!gridAdjust) { setSelected(null); setTool("pan"); setPlayer(false); }
                    }}>
                    {gridAdjust ? "Done adjusting grid" : "Grid adjust mode"}
                  </button>
                  {gridAdjust && <p className="notice" role="status">
                    Drag the map to move the grid. Arrow keys move the grid 1 px. Shift + arrow: 10 px.
                    Alt + arrow: 0.1 px. + / − or scroll over the map to resize the grid
                    (up grows, down shrinks). Hold Alt for 0.1 px size changes.
                    Escape exits. Keys work when you are
                    not editing a field or slider.
                  </p>}
                  <Toggle
                    label="Snap tokens to grid"
                    checked={scene.grid.snap}
                    onChange={(snap) => patchGrid({ snap })}
                  />
                  <Toggle
                    label="Show cell addresses"
                    checked={scene.grid.labels}
                    onChange={(labels) => patchGrid({ labels })}
                  />
                  <Field label="Cell address style">
                    <select value={scene.grid.labelMode} onChange={e=>patchGrid({labelMode:e.target.value as Grid["labelMode"]})}>
                      <option value="cells">Inside cells (A1, B2…)</option>
                      <option value="perimeter">Outside edges (letters & numbers)</option>
                    </select>
                  </Field>
                  {scene.grid.labelMode==="perimeter"&&scene.grid.type!=="square"&&<p className="muted">Outside-edge labels use square grids. Hex grids keep their cell addresses.</p>}
                  <Field label="Address label theme">
                    <select value={scene.grid.labelTheme} onChange={e=>patchGrid({labelTheme:e.target.value as Grid["labelTheme"]})}><option value="light">Light background / dark text</option><option value="dark">Dark background / light text</option></select>
                  </Field>
                  <Field label="Map background">
                    <select value={scene.background==="#202925"?"dark":scene.background==="#e3e6d8"?"light":"custom"} onChange={e=>{if(e.target.value!=="custom")updateScene(s=>{s.background=e.target.value==="dark"?"#202925":"#e3e6d8";});}}><option value="light">Light</option><option value="dark">Dark</option><option value="custom">Custom color</option></select>
                    <TokenColor label="Map background color" value={scene.background} onChange={background=>updateScene(s=>{s.background=background;})}/>
                  </Field>
                  <Field
                    label={`Grid opacity · ${Math.round(scene.grid.opacity * 100)}%`}
                  >
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={scene.grid.opacity}
                      onChange={(e) => patchGrid({ opacity: +e.target.value })}
                    />
                  </Field>
                  <Field label="Grid color">
                    <input
                      type="color"
                      value={scene.grid.color}
                      onChange={(e) => patchGrid({ color: e.target.value })}
                    />
                  </Field>
                  <hr />
                  <h3>Scale & measurement</h3>
                  <PanelTip more={<p>Hex grids count adjacent hexes. With no grid, distance uses the cell size as a pixel scale.</p>}>New maps start at 5 feet per tile.</PanelTip>
                  <Field label="Measurement units"><select value={["ft","m","mi","km","spaces"].includes(scene.grid.unit)?scene.grid.unit:"custom"} onChange={e=>patchGrid({unit:e.target.value==="custom"?"units":e.target.value})}><option value="ft">Feet (ft)</option><option value="m">Meters (m)</option><option value="mi">Miles (mi)</option><option value="km">Kilometers (km)</option><option value="spaces">Spaces</option><option value="custom">Custom</option></select></Field>
                  <div className="form-row">
                    <NumberField
                      label="Distance per tile"
                      min={0.01}
                      max={10000}
                      step={0.5}
                      value={scene.grid.units}
                      onChange={(units) => patchGrid({ units })}
                    />
                    <Field label="Unit label (editable)">
                      <input
                        maxLength={16}
                        value={scene.grid.unit}
                        onChange={(e) => patchGrid({ unit: e.target.value })}
                        placeholder="ft, m, spaces"
                      />
                    </Field>
                  </div>
                  <Field label="Square-grid diagonals">
                    <select
                      value={scene.grid.diagonal}
                      onChange={(e) =>
                        patchGrid({
                          diagonal: e.target.value as Grid["diagonal"],
                        })
                      }
                    >
                      <option value="equal">Every step costs 1</option>
                      <option value="alternating">Alternating 1 / 2</option>
                      <option value="euclidean">Straight-line distance</option>
                    </select>
                  </Field>
                  <Toggle label="Measure token movement" checked={measureTokenMovement} onChange={changeMeasureTokenMovement} />
                  <PanelTip more={<p>Press Q or Space during a drag to add waypoints; each waypoint shows its leg and the total sits beside the token. Hold Alt to move off the grid. Give a token a speed (Edit token, Movement) and the squares turn green within it, amber for a dash and red beyond. On phones, select a token and tap Plan move, then tap map waypoints and Move token. Turn measuring off here or in the map toolbar.</p>}>While this is on, dragging a token measures how far it moves.</PanelTip>
                  <button onClick={() => chooseTool("measure")}>
                    <Ruler size={16} />
                    Measure a path
                  </button>
                  <SavedMeasurements scene={scene} points={measurementPoints} update={updateScene} start={()=>chooseTool("measure")} selected={selected} select={select}/>
                </>
              )}
              {panel === "fog" && (
                <>
                  <Toggle
                    label="Enable fog of war"
                    checked={scene.fog.enabled}
                    onChange={(enabled) =>
                      updateScene((s) => {
                        s.fog.enabled = enabled;
                      })
                    }
                  />
                  <Toggle label="Temporarily hide fog (GM only)" checked={hideFog} onChange={setHideFog}/>
                  <PanelTip more={<>
                    <p>Hiding fog for yourself only changes your GM view. The player view and map exports keep it.</p>
                    <p>Switching fog off keeps your edits for next time.</p>
                    <p>Polygon: click the corners, then finish the shape. Edit regions: select a region to move its points; the edge handles add points. Use the map controls to finish, cancel or delete.</p>
                    <p>Undo takes back fog edits, including Cover all and Reveal all.</p>
                  </>}>You see a see-through cover. Players and exports see solid fog.</PanelTip>
                  <div className="segmented">
                    <button className={tool==="select"?"active":""} onClick={()=>{chooseTool("select");setFogShape("edit");}}>Select / edit</button>
                    <button
                      className={tool === "reveal" ? "active" : ""}
                      onClick={() => chooseTool("reveal")}
                    >
                      <Eye size={15} />
                      Reveal
                    </button>
                    <button
                      className={tool === "cover" ? "active" : ""}
                      onClick={() => chooseTool("cover")}
                    >
                      <EyeOff size={15} />
                      Cover
                    </button>
                  </div>
                  <Field label="Shape">
                    <select
                      value={fogShape}
                      onChange={(e) =>
                        setFogShape(e.target.value as "brush" | "rect" | "polygon" | "edit")
                      }
                    >
                      <option value="brush">Round brush</option>
                      <option value="rect">Rectangle</option>
                      <option value="polygon">Polygon</option>
                      <option value="edit">Edit regions / points</option>
                    </select>
                  </Field>
                  {fogShape==="brush"&&<Field label={`Brush size · ${brushSize} px`}>
                    <input
                      type="range"
                      min={20}
                      max={800}
                      step={10}
                      value={brushSize}
                      onChange={(e) => setBrushSize(+e.target.value)}
                    />
                  </Field>}
                  <div className="fog-sidebar-actions" ref={setFogControlsHost}/>
                  <FogRegions scene={scene} update={updateScene} selected={fogSelectedIndices} onSelectionChange={selectFog} onSelect={index=>{selectFog([index]);setFogSelectionRequest(r=>({index,nonce:(r?.nonce??0)+1}));}}/>
                  <div className="button-row">
                    <button
                      onClick={() =>
                        updateScene((s) => {
                          s.fog = { enabled: true, base: true, strokes: [] };
                        })
                      }
                    >
                      Cover all
                    </button>
                    <button
                      onClick={() =>
                        updateScene((s) => {
                          s.fog = { enabled: true, base: false, strokes: [] };
                        })
                      }
                    >
                      Reveal all
                    </button>
                  </div>
                </>
              )}
              {panel === "effects" && <EffectsPanel workspace={workspace} commit={commit} onUsePreset={preset=>{chooseTool(preset.type);setEffectTemplate(preset);setSelected(null);setEffectSize(preset.size);setEffectColor(preset.color);setEffectLabel(preset.label||preset.name);setEffectPersistent(preset.persistent);setEffectHidden(preset.hidden);setEffectWidth(preset.width);}} scene={scene} tool={tool} chooseTool={chooseTool} selected={selected} select={select} update={updateScene}
                defaults={{size:effectSize,color:effectColor,label:effectLabel,persistent:effectPersistent,hidden:effectHidden,width:effectWidth}}
                setDefaults={patch=>{if(patch.size!==undefined)setEffectSize(patch.size);if(patch.color!==undefined)setEffectColor(patch.color);if(patch.label!==undefined)setEffectLabel(patch.label);if(patch.persistent!==undefined)setEffectPersistent(patch.persistent);if(patch.hidden!==undefined)setEffectHidden(patch.hidden);if(patch.width!==undefined)setEffectWidth(patch.width);}}/>}
              {panel === "conditions" && (
                <>
                  <p className="muted">
                    Define markers for your game. Conditions are visual labels;
                    you decide what they do.
                  </p>
                  <ConditionOrganizer workspace={workspace} commit={commit} location={conditionLocation} setLocation={setConditionLocation} onNewCondition={()=>setDialog("condition")} renderCondition={c=><ConditionEntry condition={c} workspace={workspace} commit={commit}/>}/> 
                  {dialog === "condition" && <Modal title="New Condition" close={()=>setDialog(null)}>
                  <Field label="Condition name">
                    <input
                      maxLength={40}
                      value={conditionName}
                      onChange={(e) => setConditionName(e.target.value)}
                      placeholder="Stunned, Inspired, Suppressed…"
                    />
                  </Field>
                  <div className="form-row">
                    <Field label="Color">
                      <input
                        type="color"
                        value={conditionColor}
                        onChange={(e) => setConditionColor(e.target.value)}
                      />
                    </Field>
                  </div>
                  <ConditionSymbol workspace={workspace} commit={commit} assetId={conditionAssetId} onAssetChange={setConditionAssetId} value={conditionIcon} onChange={setConditionIcon}/>
                  <button
                    className="primary"
                    disabled={!conditionName.trim()}
                    onClick={() => {
                      commit((w) => {
                        const id=uid();
                        w.conditions.push({
                          id,
                          name: conditionName.trim(),
                          color: conditionColor,
                          icon: conditionIcon,
                          assetId:conditionAssetId,
                        });
                        w.conditionLocations[id]=w.conditionFolders.some(f=>f.id===conditionLocation)?conditionLocation:null;
                      });
                      setConditionName("");setDialog(null);
                    }}
                  >
                    <Plus size={16} />
                    Add condition
                  </button>
                  </Modal>}

                </>
              )}
            </div>
            
          </ResizableSidebar>
        )}
        <section className="map-workspace">
          <div className="map-topbar">
            <div className="button-row">
              <button
                aria-label={sidebar&&panel?"Hide sidebar":"Show sidebar"}
                aria-expanded={!!(sidebar&&panel)}
                title={sidebar&&panel?"Hide sidebar":"Show sidebar"}
                onClick={() => {
                  setSidebar(!sidebar);
                  if (!panel) setPanel("scenes");
                }}
              >
                {sidebar && panel ? (
                  <PanelLeftClose size={18} />
                ) : (
                  <PanelLeftOpen size={18} />
                )}
              </button>
              <button
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                disabled={!history.current.length}
                onClick={undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                disabled={!future.current.length}
                onClick={redo}
              >
                <Redo2 size={18} />
              </button>
            </div>
            {!player && <button aria-label="Measure token movement" aria-pressed={measureTokenMovement} className={measureTokenMovement ? "active" : ""} onClick={() => changeMeasureTokenMovement(!measureTokenMovement)} title="Measure token movement; Q or Space adds waypoints during a measured drag">
              <Ruler size={17} /><span>Measure movement</span>
            </button>}
            <div className="map-title">
              {measure ||
                `${countLabel(scene.tokens.length,"token")} · ${countLabel(scene.effects.length,"effect")}`}
            </div>
            {!player && <div className="crop-host" ref={setCropControlsHost}/>}
            {!player && <button aria-pressed={hideFog} onClick={()=>setHideFog(v=>!v)} aria-label={hideFog?"Restore fog":"Hide fog"} title="Temporarily hide fog in your GM view only">
              {hideFog ? <Eye size={17}/> : <EyeOff size={17}/>}
              <span>{hideFog ? "Restore fog" : "Hide fog"}</span>
            </button>}
            <button
              className={player ? "active" : ""}
              onClick={() => {
                setPlayer(!player);
                setArmed(null);
                setSelected(null);
              }}
              aria-label={player?"Player view":"GM view"} title="Preview exactly what players see"
            >
              {player ? <Eye size={17} /> : <Shield size={17} />}
              <span>{player ? "Player view" : "GM view"}</span>
            </button>
          </div>
          {saveRecovery}
          {!player && <ArmedPlacement armed={armedNow} active={tool === "select"} disarm={disarmPlacement} face={armedFace}/>}
          {imageError && (
            <div className="error-banner" role="alert">
              {imageError}
              <button onClick={() => setImageVersion((v) => v + 1)}>
                Retry image
              </button>
            </div>
          )}
          <Board
            measureTokenMovement={measureTokenMovement}
            onMeasureTokenMovementChange={changeMeasureTokenMovement}
            onLibraryTokenDrop={(id,point)=>{
              const entry=encyclopediaEntryOf(id);
              if(entry){loadEncyclopedia().then(raw=>{const c=encyclopediaCharacters(raw).find(c=>c.id===entry);if(!c)throw new Error("That character is no longer in your Encyclopedia.");return addEncyclopediaToken(c,point);}).catch(e=>setNotice(e instanceof Error?e.message:"Could not add the character."));return;}
              const item=workspace.tokenLibrary.find(t=>t.id===id);if(item)placeLibraryToken(item,point);}}
            suggested={suggestedMoves}
            onEditElement={(kind,id)=>{
              setSidebar(true);setTool("select");setSelected(null);setSelectedIds([]);setFogSelectedIndices([]);setSelectedPoiId(null);
              if(kind==="token"){setPanel("tokens");setSelected(String(id));setTokenEditRequest(r=>({id:String(id),count:r.count+1}));}
              if(kind==="effect"){setPanel("effects");setSelected(String(id));}
              if(kind==="measurement"){setPanel("grid");setSelected(String(id));}
              if(kind==="poi"){setPanel("exploration");setSelectedPoiId(String(id));}
              if(kind==="fog"){setPanel("fog");setFogShape("edit");setFogSelectedIndices([Number(id)]);setFogSelectionRequest(r=>({index:Number(id),nonce:(r?.nonce??0)+1}));}
            }}
            selectedPoiId={selectedPoiId}
            notePoiId={player?playerNoteId:tool==="select"&&["exploration","scenes"].includes(selectionScope)?selectedPoiId:null}
            renderOverlay={view=>{
              const areas=scene.areas??[],shown=player?areas.filter(a=>!!playerAreaText(a,book,campaignId)):areas,open=shown.find(a=>a.id===openAreaId),shownText=player&&open?playerAreaText(open,book,campaignId):null;
              const saveArea=(made:{pageId:string;section:string;playersSee:boolean})=>{const edit=areaEdit;if(!edit)return;const id=edit.id??uid();
                if(!edit.id&&areas.length>=MAX_AREAS){setNotice(`A map holds up to ${MAX_AREAS} areas.`);return;}
                updateScene(s=>{const list=s.areas??(s.areas=[]);const a=list.find(x=>x.id===id),next={id,points:edit.points,pageId:made.pageId,section:made.section,...(made.playersSee?{playersSee:true}:{})};if(a)Object.assign(a,next,made.playersSee?{}:{playersSee:undefined});else list.push(next);});
                setAreaEdit(null);setOpenArea(id);};
              return <>
                {shown.length>0&&<AreaLayer areas={shown} view={view} player={player} selectedId={open?.id??null} onSelect={id=>setOpenArea(id===openAreaId?null:id)}/>}
                {open&&(player?shownText&&<PlayerAreaCard shown={shownText} area={open} view={view} onClose={()=>setOpenArea(null)}/>
                  :!areaEdit&&<GmAreaCard area={open} areas={areas} book={book} view={view} onSelect={id=>setOpenArea(id)} onEdit={()=>setAreaEdit({...open})} onClose={()=>setOpenArea(null)}
                    onShare={on=>updateScene(s=>{const a=s.areas?.find(x=>x.id===open.id);if(a)a.playersSee=on||undefined;})}
                    onRemove={()=>{updateScene(s=>{s.areas=(s.areas??[]).filter(x=>x.id!==open.id);});setOpenArea(null);}}/>)}
                {!player&&areaDrawing&&<AreaDraw view={view} onCancel={()=>setAreaDrawing(false)}
                  onBox={(a,b)=>{const c=(p:{x:number;y:number})=>({x:Math.round(Math.max(0,Math.min(scene.width,p.x))),y:Math.round(Math.max(0,Math.min(scene.height,p.y)))});setAreaDrawing(false);setAreaEdit({points:[c(a),c(b)]});}}
                  onClick={pt=>{const room=roomAt(scene.drawing,pt);if(!room){setNotice("No room is drawn there. Drag a box instead.");return;}setAreaDrawing(false);setAreaEdit({points:room});}}/>}
                {!player&&areaEdit&&<AreaDialog key={areaEdit.id??"new"} area={areaEdit} areas={areas} drawing={scene.drawing} pages={linkable} book={book} onClose={()=>setAreaEdit(null)} onSave={saveArea}
                  onLinkAll={made=>{updateScene(s=>{(s.areas??(s.areas=[])).push(...made);});setAreaEdit(null);setNotice(`Linked ${made.length} rooms to their sections.`);}}/>}
              </>;
            }}
            renderNote={(poi,at)=>{
              if(player){const note=playerNote(poi,book,campaignId);return note?<PlayerNoteCard note={note} color={poi.color} at={at} onClose={()=>setPlayerNoteId(null)}/>:null;}
              return <GmNoteCard point={poi} at={at} pages={notePages(book,poi.pages)} linkable={linkable} loadError={bookError} onClose={()=>setSelectedPoiId(null)}
                onEdit={()=>{setPanel("exploration");setSidebar(true);}}
                onShare={on=>updateScene(s=>{const p=s.pointsOfInterest.find(x=>x.id===poi.id);if(p)p.playersSee=on;})}
                onAdd={id=>updateScene(s=>{const p=s.pointsOfInterest.find(x=>x.id===poi.id);if(p)addNotePage(p,id);})}
                onRemove={id=>updateScene(s=>{const p=s.pointsOfInterest.find(x=>x.id===poi.id);if(p)p.pages=(p.pages??[]).filter(x=>x!==id);})}/>;
            }}
            onPlayerPoiTap={id=>setPlayerNoteId(id&&scene.pointsOfInterest.some(p=>p.id===id&&playerNote(p,book,campaignId))?id:null)}
            onPageDrop={(entryId,point,poiId)=>{
              const page=linkable.find(p=>p.id===entryId);if(!page){setNotice("That page isn’t in this campaign’s Encyclopedia.");return;}
              if(poiId){let added=false;updateScene(s=>{const p=s.pointsOfInterest.find(x=>x.id===poiId);if(p)added=addNotePage(p,entryId);});setSelectedPoiId(poiId);setTool("select");setNotice(added?`Added ${page.title} to the note.`:"That page is already on this note, or the note is full.");return;}
              if(scene.pointsOfInterest.length>=500){setNotice("This map has 500 markers already.");return;}
              const id=uid();updateScene(s=>{s.pointsOfInterest.push({id,name:page.title.slice(0,120),...point,color:"#d4a654",hidden:false,folderId:null,targetSceneId:null,activation:"double",notes:"",pages:[entryId]});});
              setSelectedPoiId(id);setTool("select");setNotice(`Pinned ${page.title} to the map.`);
            }}
            poiActivation={poiActivation}
            selectPoi={id=>{setSelectedPoiId(id);if(id){setTool("select");setSelected(null);setSelectedIds([]);}}}
            openLinkedScene={openExplorationMap}
            selectionScope={selectionScope}
            hideFog={hideFog}
            selectedIds={selectedIds}
            onMarqueeSelection={selectMarquee}
            fogSelectedIndices={fogSelectedIndices}
            onFogSelection={selectFog}
            fogControlsHost={fogControlsHost}
            cropControlsHost={cropControlsHost}
            onUploadMap={()=>setDialog("scene-map")}
            onAddToken={startQuickToken}
            fogSelectionRequest={fogSelectionRequest}
            onMeasurementChange={setMeasurementPoints}
            editToken={id=>{setSelectedIds([]);setFogSelectedIndices([]);setSelected(id);setPanel("tokens");setTokenEditRequest(r=>({id,count:r.count+1}));}}
            gridAdjust={gridAdjust}
            resizeGrid={resizeGrid}
            scene={scene}
            workspace={workspace}
            images={images.current}
            imageVersion={imageVersion}
            tool={tool}
            selected={selected}
            select={select}
            update={updateScene}
            player={player}
            brushSize={brushSize}
            fogShape={fogShape}
            effectSize={effectSize}
            effectColor={effectColor}
            effectTemplate={effectTemplate}
            effectLabel={effectLabel} effectPersistent={effectPersistent} effectHidden={effectHidden} effectWidth={effectWidth}
            onView={setView}
            onMeasure={setMeasure}
          />
          <div className="toolbar" role="toolbar" aria-label="Map tools" ref={toolbarRef}>
            {tools.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={tool === id && !player ? "active" : ""}
                aria-pressed={tool === id && !player}
                onClick={() => chooseTool(id)}
                title={label}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
            <div className="toolbar-divider" />
            <button onClick={startQuickToken} title="Add token">
              <Plus size={20} />
              <span>Add token</span>
            </button>
            <div className="toolbar-divider dice-tool" />
            <button className={"dice-tool "+(dicePanel==="dice"?"active":"")} aria-expanded={dicePanel==="dice"} aria-controls="standard-dice-tray" onClick={()=>toggleDicePanel("dice")} title="Dice tray">
              <Dices size={20} aria-hidden="true" />
              <span>Dice</span>
            </button>
            <button className={"dice-tool "+(dicePanel==="log"?"active":"")} aria-expanded={dicePanel==="log"} aria-controls="local-roll-log" onClick={()=>toggleDicePanel("log")} title="Roll log">
              <ScrollText size={20} aria-hidden="true" />
              <span>Roll log</span>
            </button>
          </div>
          <footer className="map-footer">
            <span>
              {player
                ? "Player view · editing disabled"
                : tool === "poi" ? "Click the map to place a point of interest or transition"
                : tool === "select"
                  ? selectedIds.length > 1
                    ? `${selectedIds.length} selected · Drag one to move them all · Ctrl C copies · Ctrl G groups · Shift + scroll resizes · Delete removes`
                    : selected
                    ? (measureTokenMovement ? "Drag to measure movement | Q or Space adds a waypoint | Alt moves off the grid" : "Drag to move | Alt moves off the grid | [ ] turn | H V flip | - = size | Shift + scroll resizes")
                    : `Select ${selectionLabel} · Shift-click or Shift-drag selects several · Ctrl V pastes · Middle-drag to pan`
                  : tool === "marquee"
                    ? `Drag to select ${selectionLabel} · Shift adds · ${selectedIds.length + fogSelectedIndices.length} selected · Delete removes · Middle-drag pans`
                  : tool === "pan"
                    ? (gridAdjust ? "Grid adjust · drag or arrows to move · + / − or scroll to resize · Esc to exit" : "Drag to pan · pinch or scroll to zoom")
                    : tool === "measure"
                      ? "Drag to measure · Q or Space adds a waypoint · Alt measures off the grid"
                      : tool === "reveal" || tool === "cover"
                        ? "Drag across the map to paint fog"
                        : "Drag to size an area effect"}
            </span>
            <span>Any system. Your rules.</span>
          </footer>
        </section>
        {tokenGalleryOpen && !player && <ResizableSidebar className="token-gallery-panel" edge="left" defaultWidth={320} storageKey={`maptable:token-gallery-width:${navigationScope ?? "local"}`}><header><h2>Token gallery</h2><button aria-label="Close token gallery" onClick={()=>setTokenGalleryOpen(false)}><X size={18}/></button></header><div className="token-gallery-tabs" role="tablist" aria-label="Token sources"><button role="tab" aria-selected={galleryTab==="saved"} onClick={()=>setGalleryTab("saved")}>Saved tokens</button><button role="tab" aria-selected={galleryTab==="encyclopedia"} onClick={()=>setGalleryTab("encyclopedia")}>From the Encyclopedia</button></div><div className="token-gallery-content">{galleryTab==="saved"?<TokenLibrary workspace={workspace} commit={commit} campaignId={campaignId} armed={armedNow} setArmed={armToken} onMakeToken={()=>setDialog("token")} save={manualSave}/>:<EncyclopediaTokens disabled={!scene} onAdd={c=>addEncyclopediaToken(c)} campaignId={activeCampaignId} coGm={!!member} workspace={workspace} armed={armedNow} setArmed={armToken}/>}</div></ResizableSidebar>}
      </div>
      <input
        hidden
        ref={backupInput}
        type="file"
        accept="application/json,.json"
        onChange={(e) => void restore(e.target.files?.[0])}
      />
      <StandardDiceTray panel={dicePanel} onPanelChange={setDicePanel} style={diceDock} scene={scene ? { sceneId: scene.id, campaignId, name: scene.name } : null} />
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog === "split-map" && <MapSplitDialog containerId={destination} close={()=>setDialog(null)} onImport={(assets,scenes)=>{
        commit(w=>{w.assets.push(...assets);for(const asset of assets)w.assetCampaigns[asset.id]=campaignId;w.scenes.push(...scenes);w.activeId=scenes[0].id;});
        setDialog(null);setPanel("exploration");setSidebar(true);setSelected(null);setTool("select");setNotice(`${scenes.length} linked map sections created. Use the direction markers to travel between them.`);
      }}/>}
      {dialog === "add-scenes" && <AddScenes workspace={workspace} campaignId={campaignId} initialDestination={destination} initialMapType={newMapType} splitMap={id=>{setLocation(id);setDialog("split-map");}} commit={commit} close={()=>setDialog(null)} importMap={(id,type)=>{setLocation(id);setNewMapType(type);setDialog("map");}} openScene={id=>{activate(id);setDialog(null);setPanel("scenes");setSidebar(true);}}/>}
      {(dialog === "map" || dialog === "scene-map" || dialog === "token") && (
        <ImportDialog
          kind={dialog === "scene-map" ? "map" : dialog}
          title={dialog === "scene-map" ? (scene.mapId || scene.drawing ? "Replace scene map" : "Upload map to scene") : dialog === "map" ? `Upload ${newMapType === "world" ? "World" : newMapType === "area" ? "Area" : "Encounter"} Map` : undefined}
          submitLabel={dialog === "scene-map" ? "Save map to scene" : undefined}
          s3={settings.s3Configured}
          close={() => setDialog(null)}
          onImport={importAsset}
        />
      )}
      {dialog === "export" && (
        <ExportDialog
          campaignId={campaignId}
          campaignName={campaign?.name ?? null}
          scene={scene}
          workspace={workspace}
          images={images.current}
          view={view}
          close={() => setDialog(null)}
          discord={settings.discordConfigured}
        />
      )}
      {dialog === "connections" && (
        <ConnectionsDialog
          campaignId={campaignId}
          campaignName={campaign?.name ?? null}
          close={() => setDialog(null)}
          onUpdated={setSettings}
        />
      )}
      {dialog === "help" && (
        <Modal title="Help & guides" close={() => setDialog(null)}>
          <HelpGuides connections={()=>setDialog("connections")}>
          <div className="help-steps">
            <p>
              <strong>1. Set the scene.</strong> Import a map from your device,
              an image URL, or a connected S3 bucket. Or start with a blank
              board.
            </p>
            <p>
              <strong>2. Align your grid.</strong> Choose square or hex, adjust
              size and offsets, then set your own distance units.
            </p>
            <p>
              <strong>3. Place your tokens.</strong> Crop artwork into a round
              token, or create a quick text token. Select one to edit HP,
              visibility, and conditions.
            </p>
            <p>
              <strong>4. Play.</strong> Reveal fog, measure paths, and place
              effects. On touch screens, pinch to zoom. Drag a token to move it (hold Alt to place it off the grid). Shift-click or Shift-drag selects several tokens, and dragging one moves them all. Ctrl C and Ctrl V copy and paste tokens, also into another scene, Ctrl D duplicates, and Ctrl G groups them so they select and move together (Ctrl Shift G ungroups). A selected token has a gold handle to turn it and a corner handle to resize it, plus a small bar; [ and ] turn it, H and V flip it, - and = change its size, and so does holding Shift while you scroll over it (it works on areas and labels too). Right-click a token to turn, flip or add conditions;
              click or tap empty space to deselect. For touch waypoints, select a token, tap Plan move, tap each corner and destination, then tap Move token. Undo point removes the last corner; Cancel leaves the token in place.
            </p>
            <p>
              <strong>5. Share.</strong> Preview player view, then download a
              clean map image or post it through your Discord webhook.
            </p>
          </div>
          <p className="notice">
            Cloud saves sync when you open a device. If two devices edit the
            same workspace, Maptable stops a conflicting save so you can back up
            and reload.
          </p>
          <p className="muted">
            Ctrl/Cmd+Z: undo · Ctrl/Cmd+Shift+Z: redo · Escape: deselect ·
            Delete: remove selection. Backups include images and can be imported
            into another Maptable.
          </p>
          </HelpGuides>
        </Modal>
      )}
    </main>
  );
}
