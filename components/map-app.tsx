"use client";
import {readJsonResponse} from "@/lib/transfer-client";
import { countLabel } from "@/lib/plural";
import StandardDiceTray, { type DicePanel } from "./standard-dice-tray";
import { diceDockPosition } from "@/lib/dice-dock";
import { attachSceneMap } from "@/lib/scene-map";
import SaveConflictNotice from "./save-conflict-notice";
import { saveWorkspace } from "@/lib/workspace-save";
import HelpGuides from "./help-guides";
import TokenColor from "./token-color";
import TokenBorder from "./token-border";
import TokenOptions from "./token-options";
import TokenEditorTabs from "./token-editor-tabs";
import SaveGalleryStats from "./save-gallery-stats";
import {syncConditionRounds,conditionAge} from "@/lib/initiative-tracker";
import TokenPosition from "./token-position";
import {syncTokenAttachments} from "@/lib/token-attachments";
import { preserveActiveScene, workspaceSyncDecision } from "@/lib/workspace-sync";
import { navigationStorageKey, parseNavigationState, type NavigationPanel } from "@/lib/navigation-state";
import SavedMeasurements from "./saved-measurements";
import FogRegions from "./fog-regions";
import ExplorationPanel from "./exploration-panel";
import {sceneTargets} from "@/lib/exploration";
import TokenImage from "./token-image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
  Cloud,
  Undo2,
  Redo2,
  Circle,
  Square,
  X,
  ChevronRight,
  Trash2,
  Copy,
  Download,
  Link,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Check,
  HelpCircle,
  UserRound,
  BookOpen,
  Dices,
  ScrollText,
} from "lucide-react";
import Board, { type View } from "./board";
import CampaignAssets from "./campaign-assets";
import ThemeToggle from "./theme-toggle";
import ConditionSymbol from "./condition-symbol";
import ConditionOrganizer from "./condition-organizer";
import ConditionEntry from "./condition-entry";
import EffectsPanel from "./effects-panel";
import TokenLibrary from "./token-library";
import MapInitiative, { InitiativeField } from "./map-initiative";
import TokenNotesControl from "./token-notes-control";
import "./maptable-token-layout.css";
import AddScenes from "./add-scenes";
import MapSplitDialog from "./map-split-dialog";
import MapCreator from "./map-creator";
import { applyWorkspaceHpStates } from "@/lib/token-hp-state";
import TokenStatusControl from "./token-status-control";
import TokenDisplayControls from "./token-display-controls";
import CampaignTokenDefaults from "./campaign-token-defaults";
import { resolvedToken } from "@/lib/token-defaults";
import ResizableSidebar from "./resizable-sidebar";
import { FolderPreferenceScope } from "./folder-expansion";
import SceneOrganizer, { LocationOptions } from "./scene-organizer";
import {
  Modal,
  Field,
  Toggle,
  NumberField,
  ImportDialog,
  ExportDialog,
  ConnectionsDialog,
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

type Panel = NavigationPanel;
type Dialog = "scene-map" | "condition" | "split-map" | "add-scenes" | "map" | "token" | "export" | "connections" | "help" | null;
const tools = [
  { id: "select", label: "Select", Icon: MousePointer2 },
  { id: "marquee", label: "Drag select", Icon: Scan },
  { id: "pan", label: "Pan", Icon: Hand },
  { id: "measure", label: "Measure", Icon: Ruler },
] as const;

export default function MapApp(props: { navigationScope?: string } = {}) {
  return <FolderPreferenceScope.Provider value={props.navigationScope ?? "local"}><MapAppContent {...props} /></FolderPreferenceScope.Provider>;
}
function MapAppContent({ navigationScope }: { navigationScope?: string } = {}) {
  const navigationRestored = useRef(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
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
    [tool, setTool] = useState<Tool>("select"),
    [player, setPlayer] = useState(false),
    [hideFog,setHideFog]=useState(false),
    [sidebar, setSidebar] = useState(true);
  const [brushSize, setBrushSize] = useState(140),
    [fogControlsHost,setFogControlsHost]=useState<HTMLDivElement|null>(null),
    [fogSelectionRequest,setFogSelectionRequest]=useState<{index:number;nonce:number}|null>(null),
    [fogSelectedIndices,setFogSelectedIndices]=useState<number[]>([]),
    [fogShape, setFogShape] = useState<"brush" | "rect" | "polygon" | "edit">("brush"),
    [effectSize, setEffectSize] = useState(2),
    [effectColor, setEffectColor] = useState("#d99a3a");
  const selectionScope = panel === "scenes" || panel === "tokens" || panel === "effects" || panel === "fog" || panel === "exploration" ? panel : panel === "grid" ? "measurements" : "none";
  const [mobileToolsOpen,setMobileToolsOpen]=useState(false);
  const [dicePanel,setDicePanel]=useState<DicePanel>(null);
  const [diceDock,setDiceDock]=useState<CSSProperties>();
  const toolbarRef=useRef<HTMLDivElement>(null);
  const toggleDicePanel=(next:Exclude<DicePanel,null>)=>{setDicePanel(p=>p===next?null:next);setMobileToolsOpen(false);};
  useEffect(()=>{
    if(!dicePanel)return;
    const place=()=>{const bar=toolbarRef.current;if(!bar)return;setDiceDock(diceDockPosition(bar.getBoundingClientRect(),window.innerWidth,window.innerHeight));};
    place();window.addEventListener("resize",place);return()=>window.removeEventListener("resize",place);
  },[dicePanel]);
  const [mobileHeaderOpen,setMobileHeaderOpen]=useState(false);
  const [mobilePanelExpanded,setMobilePanelExpanded]=useState(false);
  const selectionLabel = selectionScope === "exploration" ? "points of interest" : selectionScope === "scenes" ? "tokens and AoEs" : selectionScope === "effects" ? "AoEs" : selectionScope === "fog" ? "fog regions" : selectionScope === "measurements" ? "measurements" : selectionScope === "tokens" ? "tokens" : "nothing (open a map sidebar section)";
  useEffect(()=>{
    if(!["exploration","scenes"].includes(selectionScope))setSelectedPoiId(null);
    const current=state.current;
    const currentScene=current?.scenes.find(s=>s.id===current.activeId);
    const allowed=new Set([
      ...(["scenes","tokens"].includes(selectionScope)?currentScene?.tokens.map(t=>t.id)??[]:[]),
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
  const [dashboard, setDashboard] = useState(true);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [dashboardLocation, setDashboardLocation] = useState<string | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  useEffect(() => {
    if (!navigationReady || !navigationScope || !workspace) return;
    try {
      sessionStorage.setItem(navigationStorageKey(navigationScope), JSON.stringify({
        version: 1, dashboard, creatorOpen, panel, sidebar, activeId: workspace.activeId,
        location, dashboardLocation, conditionLocation,
      }));
    } catch { /* Browsers may disable session storage. Navigation still works. */ }
  }, [navigationReady, navigationScope, workspace, dashboard, creatorOpen, panel, sidebar, location, dashboardLocation, conditionLocation]);
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
  useEffect(()=>{
    let active=true;
    setSettings(s=>({...s,discordConfigured:false}));
    api<{s3Configured:boolean;discordConfigured:boolean}>("/api/settings"+(campaignId?`?campaignId=${encodeURIComponent(campaignId)}`:""))
      .then(value=>{if(active)setSettings(value);}).catch(()=>{});
    return ()=>{active=false;};
  },[campaignId,dialog]);
  const destination = workspace?.collections.some((c) => c.id === location) && campaignFor(location) === campaignId ? location : campaignId;
  const token = scene?.tokens.find((t) => t.id === selected),
    effect = scene?.effects.find((e) => e.id === selected);
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
      }>("/api/workspace");
      let data = result.workspace
        ? workspaceSchema.parse(result.workspace)
        : initialWorkspace();
      loadEpoch.current++;
      acknowledged.current=result.workspace?data:null;
      let saved = null;
      try { saved = navigationScope ? parseNavigationState(sessionStorage.getItem(navigationStorageKey(navigationScope))) : null; } catch { /* Storage is optional. */ }
      const activeId = navigationRestored.current ? state.current?.activeId : saved?.activeId;
      if (activeId) data = preserveActiveScene(data, activeId);
      if (!navigationRestored.current) {
        navigationRestored.current = true;
        if (saved) {
          const validLocation = (id: string | null) => data.collections.some(c => c.id === id) ? id : null;
          setDashboard(saved.dashboard);
          setCreatorOpen(saved.creatorOpen);
          setPanel(saved.panel);
          setSidebar(saved.sidebar);
          setLocation(validLocation(saved.location));
          setDashboardLocation(validLocation(saved.dashboardLocation));
          setConditionLocation(data.conditionFolders.some(c => c.id === saved.conditionLocation) ? saved.conditionLocation : null);
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
      setSaveStatus(result.workspace ? "Saved to cloud" : "Ready");
    } catch (e) {
      setLoadError((e as Error).message);
      setSaveStatus("Unavailable");
    }
  }, [navigationScope]);
  useEffect(() => {
    void load();
  }, [load]);
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
        const response = await fetch("/api/workspace", {
          cache: "no-store", signal: controller.signal,
          headers: start.revision ? { "If-None-Match": `"${start.revision}"` } : {},
        });
        if (response.status === 304 || !response.ok) return;
        const result = await readJsonResponse(response) as { workspace: Workspace | null; revision: string | null };
        if (disposed || document.visibilityState !== "visible") return;
        const decision = workspaceSyncDecision(start, snapshot(), result.revision, interacting());
        if (decision === "ignore") return;
        if (decision === "conflict") {
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
        setSaveStatus(result.workspace ? "Saved to cloud" : "Ready");
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
  }, [creatorOpen, busy, dialog, tool]);
  const save = useCallback(() => saveWorkspace({
    state, revision, acknowledged, loadEpoch, generation, savedGeneration, saving, blocked, savePromise, setSaveStatus, setSaveError,
  }), []);
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
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  }, [save]);
  const commit = useCallback(
    (fn: (w: Workspace) => void) => {
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
      history.current = [...history.current.slice(-29), previous];
      future.current = [];
      state.current = next;
      setWorkspace(next);
      setHistoryVersion((v) => v + 1);
      schedule();
    },
    [schedule],
  );
  const updateScene = useCallback(
    (fn: (s: Scene) => void) =>
      commit((w) => {
        const s = w.scenes.find((s) => s.id === w.activeId) || w.scenes[0];
        fn(s);
      }),
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
      if ((e.key === "Delete" || e.key === "Backspace") && tool==="marquee" && (selectedIds.length || fogSelectedIndices.length)) {
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
      [scene.mapId, ...scene.tokens.flatMap((t) => [t.assetId, t.borderAssetId]), ...workspace.conditions.filter(c=>scene.tokens.some(t=>t.conditions.includes(c.id))).map(c=>c.assetId)].filter(
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
    updateScene(s=>s.tokens.push(copy));setSelected(copy.id);setTool("select");setPlayer(false);
  };
  const addToken = () => {
    setSelectedIds([]);
    setFogSelectedIndices([]);
    const t = newToken(`Token ${(scene?.tokens.length || 0) + 1}`);
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
        <p>{loadError || "Opening your table…"}</p>
        {loadError && (
          <button className="primary" onClick={() => void load()}>
            Try again
          </button>
        )}
      </main>
    );
  const visibleLibrary = workspace.tokenLibrary.filter((t) => !workspace.libraryCampaigns[t.id] || workspace.libraryCampaigns[t.id] === campaignId);
  const openCampaign = (id: string | null) => {
    const first = workspace.scenes.find((s) => campaignFor(s.containerId) === id);
    if (first) activate(first.id);
    else commit((w) => {
      const created = newScene("First scene"); created.containerId = id;
      w.scenes.push(created); w.activeId = created.id;
    });
    setLocation(id); setPanel("scenes"); setSidebar(true); setDashboard(false); setSearch("");
  };
  const saveRecovery=saveError&&<SaveConflictNotice status={{phase:blocked.current?'conflict':'error',message:saveError}} onDownload={backupLocalChanges} onReload={recoverCloud} onRetry={()=>void save()} disabled={busy||saveStatus==='Saving…'} detail="Download preserves scene data and image links. A full backup with image files is available in Backups."/>;
  if (creatorOpen) return <>{saveRecovery}<MapCreator workspace={workspace} initialId={scene.drawing ? scene.id : null} destination={destination} commit={commit} persist={manualSave} saveStatus={saveError || saveStatus} close={(id)=>{setCreatorOpen(false);if(id){activate(id);setDashboard(false);setPanel("scenes");}}}/></>;
  if (dashboard) return <main className="campaign-dashboard">
    <header><div className="brand"><MapIcon size={25} /><a href="/" title="RPG Tools home">Maptable</a></div><div className="header-actions"><a className="header-link" href="/encyclopedia" title="Open RPG Encyclopedia"><BookOpen size={16} aria-hidden="true" />Encyclopedia</a><span className="save-state" role="status">{saveStatus}</span><button title="Save workspace (Ctrl/Cmd+S)" onClick={()=>void manualSave()}>Save</button><ThemeToggle/></div></header>
    <div className="dashboard-content">
      <h1>Campaigns</h1><p>Choose a campaign to open its scenes. Organize campaigns into folders here.</p>
      {saveRecovery}
      <div className="button-row"><button onClick={() => setDashboard(false)}>Return to {campaign?.name || "map"}</button><button onClick={() => setCreatorOpen(true)}>Map Creator</button><button onClick={() => openCampaign(null)}>Unfiled scenes</button>
        <button disabled={!history.current.length} onClick={undo}>Undo</button><button disabled={!future.current.length} onClick={redo}>Redo</button></div>
      <input className="search" aria-label="Search campaigns" placeholder="Find a campaign or folder" value={dashboardSearch} onChange={(e) => setDashboardSearch(e.target.value)} />
      <SceneOrganizer workspace={workspace} dashboard openCampaign={openCampaign} location={workspace.collections.some((c) => c.id === dashboardLocation) ? dashboardLocation : null}
        setLocation={setDashboardLocation} commit={commit} activate={activate} search={dashboardSearch} />
    </div>
  </main>;
  return (
    <main className="app-shell" data-mobile-tools={mobileToolsOpen} data-panel-expanded={mobilePanelExpanded}>
      <header className="app-header">
        <div className="brand">
          <MapIcon size={25} />
          <a href="/" title="RPG Tools home">Maptable</a>
        </div>
        <div className="header-scene">
          <span className="divider" />
          <span>{scene.name}</span>
          <small>{campaign?.name || "Unfiled scenes"}</small>
        </div>
        <button className="mobile-only mobile-menu-button" aria-expanded={mobileHeaderOpen} onClick={()=>setMobileHeaderOpen(v=>!v)}>Map menu</button>
        <div className="header-actions" data-mobile-open={mobileHeaderOpen}>
          <ThemeToggle/>
          <button aria-expanded={tokenGalleryOpen} onClick={()=>setTokenGalleryOpen(v=>!v)}>Token gallery</button>
          <button title="Save workspace (Ctrl/Cmd+S)" onClick={()=>void manualSave()}>Save</button>
          <span
            className={"save-state " + (saveError ? "warning" : "")}
            title={saveError || saveStatus}
          >
            {saveStatus === "Saved to cloud" ? (
              <Check size={14} />
            ) : (
              <Cloud size={14} />
            )}
            <span>{saveStatus}</span>
          </span>
          <button
            className="icon-button"
            title="Connections"
            aria-label="Connections"
            onClick={() => setDialog("connections")}
          >
            <Link size={19} />
          </button>
          <button
            className="primary share-button"
            onClick={() => setDialog("export")}
          >
            <Share2 size={17} />
            <span>Share map</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Workspace tools" onClick={()=>setMobileToolsOpen(false)}>
          <button
            className={panel === "scenes" ? "active" : ""}
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
          <button title="Dashboard" onClick={() => {setDashboard(true);setGridAdjust(false);}}><LayoutDashboard size={21}/><span>Dashboard</span></button>
        </nav>
        <nav className="mobile-navigation" aria-label="Phone navigation">
          <button onClick={()=>{setSidebar(false);setMobileToolsOpen(false);}}>Map</button>
          <button aria-pressed={panel==="scenes"&&sidebar} onClick={()=>{setPanel("scenes");setSidebar(true);setMobileToolsOpen(false);}}>Scenes</button>
          <button aria-pressed={panel==="tokens"&&sidebar} onClick={()=>{setPanel("tokens");setSidebar(true);setMobileToolsOpen(false);}}>Tokens</button>
          <button aria-expanded={mobileToolsOpen} onClick={()=>{setMobileToolsOpen(v=>!v);setMobileHeaderOpen(false);}}>Tools</button>
        </nav>
        {panel && sidebar && (
          <ResizableSidebar className="side-panel" storageKey={`maptable:sidebar-width:${navigationScope ?? "local"}`}>
            <div className="panel-title">
              <h2>
                {panel === "scenes"
                  ? "Scenes"
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
                <ExplorationPanel workspace={workspace} scene={scene} update={updateScene} selectedId={selectedPoiId} select={id=>{setSelectedPoiId(id);setTool("select");}} place={activation=>{setPoiActivation(activation);chooseTool("poi");}} openScene={openExplorationMap} createMap={type=>{setNewMapType(type);setDialog("add-scenes");}}/>
              </>}
              {panel === "scenes" && (
                <>
                  <div className="button-row">
                    <button
                      className="primary grow"
                      onClick={() => {setNewMapType("encounter");setDialog("add-scenes");}}
                    >
                      <Upload size={16} />
                      Add scenes
                    </button>
                    <button
                      title="New blank scene"
                      aria-label="New blank scene"
                      onClick={() => {
                        const s = newScene();
                        s.containerId = destination;
                        commit((w) => {
                          w.scenes.push(s);
                          w.activeId = s.id;
                        });
                        setSelected(null);
                      }}
                    >
                      <Plus size={18} aria-hidden="true" />Blank
                    </button>
                  </div>
                  <div className="button-row map-type-actions"><button onClick={()=>{setNewMapType("world");setDialog("add-scenes");}}>New World Map</button><button onClick={()=>{setNewMapType("area");setDialog("add-scenes");}}>New Area Map</button></div>
                  <input
                    className="search"
                    aria-label="Search scenes"
                    placeholder="Find a scene…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <SceneOrganizer workspace={workspace} rootId={campaignId} location={destination} setLocation={setLocation}
                    commit={commit} activate={activate} search={search} />
                  <hr />
                  <h3>Scene details</h3>
                  <Field label="Move map to"><select value={scene.mapType} onChange={e=>updateScene(s=>{s.mapType=e.target.value as Scene["mapType"];})}><option value="encounter">Encounter Map</option><option value="world">World Map</option><option value="area">Area Map</option></select></Field>
                  <p className="muted">Change the map group without losing its contents or links. Find World and Area maps together in Explore.</p>
                  <button onClick={()=>{
                    if(scene.drawing && !window.confirm("Replace this scene’s drawing with an uploaded map? Tokens, fog, and other scene settings will be kept."))return;
                    setDialog("scene-map");
                  }}>{scene.mapId || scene.drawing ? "Replace map" : "Upload map"}</button>
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
                  <p className="muted">Move this scene to any campaign or folder below. Its map and tokens travel with it.</p>
                  <Field label="Move scene to">
                    <select aria-label="Move scene to" value={scene.containerId ?? ""} onChange={(e) => {
                      const containerId = e.target.value || null;
                      updateScene((s) => { s.containerId = containerId; s.folder = ""; });
                      setLocation(containerId);
                    }}><LocationOptions workspace={workspace} /></select>
                  </Field>
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
                  <hr />
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
                      title="Add text token"
                      aria-label="Add text token"
                      onClick={addToken}
                    >
                      <UserRound size={18} />
                    </button>
                  </div>
                  <CampaignTokenDefaults workspace={workspace} campaignId={campaignId} commit={commit}/>
                  {token ? (
                    <TokenOptions key={token.id} request={tokenEditRequest.id===token.id?tokenEditRequest.count:0} onRequestHandled={()=>setTokenEditRequest({id:"",count:0})}>
                      <div className="section-heading">
                        <h3>Selected token</h3>
                        <button
                          className="text-button"
                          onClick={() => setSelected(null)}
                        >
                          Deselect
                        </button>
                      </div>
                      <TokenEditorTabs sections={[
                        {id: "general", label: "General", content: <>
                      <Field label="Name">
                        <input
                          maxLength={120}
                          value={token.name}
                          onChange={(e) => patchToken({ name: e.target.value })}
                        />
                      </Field>
                      <div className="form-row">
                        <NumberField
                          label="Size (cells)"
                          min={0.25}
                          max={20}
                          step={0.25}
                          value={token.size}
                          onChange={(size) => patchToken({ size })}
                        />
                      </div>
                      <TokenPosition scene={scene} token={token} update={updateScene}/>
                      <div className="form-row">
                        <NumberField
                          label="X position (px)"
                          max={scene.width}
                          value={token.x}
                          onChange={(x) => patchToken({ x })}
                        />
                        <NumberField
                          label="Y position (px)"
                          max={scene.height}
                          value={token.y}
                          onChange={(y) => patchToken({ y })}
                        />
                      </div>
                      <Toggle
                        label="Hidden from players"
                        checked={token.hidden}
                        onChange={(hidden) => patchToken({ hidden })}
                      />
                      <div className="button-row">
                        <button
                          onClick={() => {
                            const t = {
                              ...structuredClone(token),
                              id: uid(),
                              x: Math.min(
                                scene.width,
                                token.x + scene.grid.size,
                              ),
                            };
                            updateScene((s) => s.tokens.push(t));
                            setSelected(t.id);
                          }}
                        >
                          <Copy size={15} />
                          Duplicate
                        </button>
                        <button className="danger" onClick={removeSelected}>
                          <Trash2 size={15} />
                          Remove
                        </button>
                      </div>
                      <p className="muted">
                        Drag the token to move it. Click or tap empty space to
                        deselect; drag empty space to pan.
                      </p>
                        </>},
                        {id: "appearance", label: "Appearance", content: <>
                      <div className="form-row">
                        <Field label="Fill color">
                          <TokenColor label="Fill color" value={token.color} onChange={color => patchToken({ color, borderColor: token.borderColor ?? token.color })} />
                        </Field>
                        <Field label="Border color">
                          <TokenColor label="Border color" value={resolvedToken(workspace,scene.id,token).borderColor ?? token.color} onChange={borderColor => patchToken({ borderColor, useDispositionColor:false })} />
                        </Field>
                        <Field label="Text color">
                          <TokenColor label="Text color" value={token.textColor ?? "#ffffff"} onChange={textColor => patchToken({ textColor })} />
                        </Field>
                      </div>
                      <TokenBorder token={token} workspace={workspace} commit={commit} />
                      <TokenImage token={token} workspace={workspace} commit={commit} />
                      <TokenDisplayControls token={token} workspace={workspace} campaignId={campaignId} onChange={patchToken}/>
                        </>},
                        {id: "combat", label: "Combat", content: <>
                      <TokenStatusControl zeroHpStatus={token.zeroHpStatus} onZeroHpChange={zeroHpStatus=>patchToken({zeroHpStatus})} value={token.status} onChange={status=>patchToken({status})} />
                      <div className="form-row">
                        <NumberField
                          label="HP"
                          value={token.hp}
                          onChange={(hp) => patchToken({ hp })}
                        />
                        <NumberField
                          label="Maximum HP"
                          min={1}
                          value={token.maxHp}
                          onChange={(maxHp) => patchToken({ maxHp })}
                        />
                      </div>
                      <div className="hp-buttons">
                        <button
                          onClick={() =>
                            patchToken({ hp: Math.max(0, token.hp - 1) })
                          }
                        >
                          −1 HP
                        </button>
                        <button
                          onClick={() =>
                            patchToken({
                              hp: Math.min(token.maxHp, token.hp + 1),
                            })
                          }
                        >
                          +1 HP
                        </button>
                        <span>{address(token, scene.grid)}</span>
                      </div>
                      <TokenNotesControl section="combat" token={token} onChange={patchToken} sceneId={scene.id} campaignId={campaignId}/>
                      <h3>Conditions</h3>
                      <div className="condition-chips">
{workspace.conditions.map((c) => (
                          <button
                            key={c.id}
                            className={
                              token.conditions.includes(c.id) ? "active" : ""
                            }
                            onClick={() =>
                              patchToken({
                                conditions: token.conditions.includes(c.id)
                                  ? token.conditions.filter((id) => id !== c.id)
                                  : [...token.conditions, c.id],
                              })
                            }
                          >
                            <span style={{ background: c.color }}>
                              {c.assetId?<img className="condition-icon-image" src={workspace.assets.find(a=>a.id===c.assetId)?.src} alt=""/>:c.icon}
                            </span>
                            {c.name}{token.conditions.includes(c.id)&&<small> · {conditionAge(token,c.id,scene.initiativeState?.round??1)===null?"round added unknown":`${conditionAge(token,c.id,scene.initiativeState?.round??1)} rounds`}</small>}
                          </button>
                        ))}
                      </div>
                        </>},
                        {id: "notes", label: "Notes", content: <>
                      <TokenNotesControl section="notes" token={token} onChange={patchToken} sceneId={scene.id} campaignId={campaignId}/>
                        </>},
                        {id: "library", label: "Library", content: <>
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
                        </>},
                      ]}/>
                      <div className="manual-save-controls"><button onClick={()=>void manualSave()}>Save token changes</button><small role="status">{saveError || saveStatus}</small></div>
                    </TokenOptions>
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
                  ) : (
                    <p className="muted">
                      Select a token on the map or in the list to edit it. Use
                      the person button for a quick text token.
                    </p>
                  )}
                  <hr />
                  <h3>
                    On this map{" "}
                    <span className="count">{scene.tokens.length}</span>
                  </h3>
                  <MapInitiative scene={scene} campaignId={campaignId} update={updateScene} save={manualSave} workspace={workspace}/>
                  <input aria-label="Find tokens on this map" placeholder="Find a token on this map…" value={tokenSearch} onChange={e => setTokenSearch(e.target.value)} />
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
                        <span
                          className="token-avatar"
                          style={{ background: t.color }}
                        >
                          {t.assetId ? (
                            <img
                              src={
                                workspace.assets.find((a) => a.id === t.assetId)
                                  ?.src
                              }
                              alt=""
                            />
                          ) : (
                            t.name.slice(0, 2)
                          )}
                        </span>
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
                    <p className="empty-small">No tokens yet.</p>
                  )}
                  <hr />
                  <button onClick={()=>setTokenGalleryOpen(true)}>Open token gallery</button>
                </>
              )}
              {panel === "grid" && (
                <>
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
                  <p className="muted">
                    Adjust size and offsets to align with a grid already printed
                    on your map. Press Enter or leave a field to apply it. Values use map pixels, regardless of zoom.
                  </p>
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
                  <p className="muted">Map background shows on blank maps and through transparent images. Drawn maps use their Map Creator floor/background colors.</p>
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
                  <p className="muted">Set distances for this map. New maps start at 5 feet per tile.</p>
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
                  <p className="muted">
                    Hex movement counts adjacent hexes. With no grid, distance
                    uses the cell size as a pixel scale.
                  </p>
                  <Toggle label="Measure token movement" checked={measureTokenMovement} onChange={changeMeasureTokenMovement} />
                  <p className="muted">While enabled, token drags measure movement. Press Q or Space during a drag to add waypoints. On phones, select a token and tap Plan move, then tap map waypoints and Move token. Turn measuring off here or in the map toolbar.</p>
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
                  <p className="muted">Temporary visibility affects only your GM view. Player view and map exports keep the fog.</p>
                  <p className="muted">
                    The GM sees a translucent cover. Players and exported images
                    see solid fog. Switching it off preserves your edits.
                  </p>
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
                  <p className="muted">Polygon: click corners, then finish the shape. Edit regions: select a region to move its points; edge handles add points. Use the map controls to finish, cancel, or delete.</p>
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
                  <p className="muted">
                    Undo restores previous fog edits, including Cover all and
                    Reveal all.
                  </p>
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
            <div className="manual-save-controls"><button onClick={()=>void manualSave()}>Save changes</button><small role="status">{saveError || saveStatus}</small></div>
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
            {!player && <button aria-pressed={hideFog} onClick={()=>setHideFog(v=>!v)} aria-label={hideFog?"Restore fog":"Hide fog"} title="Temporarily hide fog in your GM view only">
              {hideFog ? <Eye size={17}/> : <EyeOff size={17}/>}
              <span>{hideFog ? "Restore fog" : "Hide fog"}</span>
            </button>}
            <button
              className={player ? "active" : ""}
              onClick={() => {
                setPlayer(!player);
                setSelected(null);
              }}
              aria-label={player?"Player view":"GM view"} title="Preview exactly what players see"
            >
              {player ? <Eye size={17} /> : <Shield size={17} />}
              <span>{player ? "Player view" : "GM view"}</span>
            </button>
          </div>
          {saveRecovery}
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
            onLibraryTokenDrop={(id,point)=>{const item=workspace.tokenLibrary.find(t=>t.id===id);if(item)placeLibraryToken(item,point);}}
            onEditElement={(kind,id)=>{
              setSidebar(true);setTool("select");setSelected(null);setSelectedIds([]);setFogSelectedIndices([]);setSelectedPoiId(null);
              if(kind==="token"){setPanel("tokens");setSelected(String(id));setTokenEditRequest(r=>({id:String(id),count:r.count+1}));}
              if(kind==="effect"){setPanel("effects");setSelected(String(id));}
              if(kind==="measurement"){setPanel("grid");setSelected(String(id));}
              if(kind==="poi"){setPanel("exploration");setSelectedPoiId(String(id));}
              if(kind==="fog"){setPanel("fog");setFogShape("edit");setFogSelectedIndices([Number(id)]);setFogSelectionRequest(r=>({index:Number(id),nonce:(r?.nonce??0)+1}));}
            }}
            selectedPoiId={selectedPoiId}
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
            <button onClick={addToken} title="Add token">
              <Plus size={20} />
              <span>Token</span>
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
                  ? selected
                    ? (measureTokenMovement ? "Drag to measure movement | Q or Space adds a waypoint | Toolbar toggle turns measuring off" : "Drag to move | Q enables movement measuring | Toolbar toggle keeps it on")
                    : `Select ${selectionLabel} · Middle-drag to pan`
                  : tool === "marquee"
                    ? `Drag to select ${selectionLabel} · Shift adds · ${selectedIds.length + fogSelectedIndices.length} selected · Delete removes · Middle-drag pans`
                  : tool === "pan"
                    ? (gridAdjust ? "Grid adjust · drag or arrows to move · + / − or scroll to resize · Esc to exit" : "Drag to pan · pinch or scroll to zoom")
                    : tool === "measure"
                      ? "Drag to measure · Q or Space adds a waypoint"
                      : tool === "reveal" || tool === "cover"
                        ? "Drag across the map to paint fog"
                        : "Drag to size an area effect"}
            </span>
            <span>Any system. Your rules.</span>
          </footer>
        </section>
        {tokenGalleryOpen && !player && <ResizableSidebar className="token-gallery-panel" edge="left" defaultWidth={320} storageKey={`maptable:token-gallery-width:${navigationScope ?? "local"}`}><header><h2>Token gallery</h2><button aria-label="Close token gallery" onClick={()=>setTokenGalleryOpen(false)}><X size={18}/></button></header><div className="token-gallery-content">                  <TokenLibrary workspace={workspace} commit={commit} campaignId={campaignId} onPlace={placeLibraryToken} save={manualSave}/></div></ResizableSidebar>}
      </div>
      <input
        hidden
        ref={backupInput}
        type="file"
        accept="application/json,.json"
        onChange={(e) => void restore(e.target.files?.[0])}
      />
      <StandardDiceTray panel={dicePanel} onPanelChange={setDicePanel} style={diceDock} />
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
              effects. On touch screens, pinch to zoom. Drag a token to move it;
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
