"use client";
import { uiZoom } from "@/lib/appearance";
import { tokenDragPosition, startTokenMovePlan, appendTokenMovePoint, undoTokenMovePoint, tokenMovePlanValid, tokenMovePlanDestination, type TokenMovePlan } from "@/lib/token-movement";
import MapCropEditor from "./map-crop";
import { LIBRARY_TOKEN_DROP, libraryTokenDropPoint, type LibraryTokenDrop } from "@/lib/library-token-drop";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, ArrowUpToLine, Check, Copy, ExternalLink, Eye, EyeOff, Maximize, Minus, MousePointer2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import "./context-menu.css";
import { PAGE_DRAG } from "@/lib/map-notes";
import type { PointOfInterest } from "@/lib/model";
import { drawSceneBackdrop, renderScene, type Images } from "@/lib/render";
import { drawRulerCells, drawRulerPath, measureRuler } from "@/lib/drag-ruler-draw";
import { dragRuler } from "@/lib/drag-ruler";
import { syncTokenAttachments } from "@/lib/token-attachments";
import { fogRegionContains, fogRegionParts, polygonContains, polygonMidpoints } from "@/lib/fog";
import { effectContains, effectHandles, effectPolygon, resolveEffect } from "@/lib/effects";
import {
  address,
  sceneRenderBounds,
  mapCrop,
  pathDistance,
  snap,
  tokenRadius,
  uid,
  type EffectPreset,
  type Workspace,
  type Scene,
  type Point,
  type Tool,
  type FogStroke,
  type Effect,
} from "@/lib/model";
const fogPolygon = (stroke: FogStroke): FogStroke => {
  if (stroke.shape !== "rect" || stroke.points.length < 2) return stroke;
  const a = stroke.points[0], b = stroke.points[stroke.points.length - 1];
  return { ...stroke, shape: "polygon", points: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] };
};
const segmentDistance = (point: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
};
const boundEffectSize = (size: number) => Math.max(0.25, Math.min(200, size));
const regionBounds = (points: Point[]) => ({
  left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)),
  top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)),
});
const regionHandles = (points: Point[]) => {
  const b = regionBounds(points), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
  return [{ x: b.left, y: b.top }, { x, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y },
    { x: b.right, y: b.bottom }, { x, y: b.bottom }, { x: b.left, y: b.bottom }, { x: b.left, y }];
};
/** Drop the least significant bend, preserving the stroke endpoints and outline. */
function thinArea(points: Point[]): Point[] {
  const result = [...points];
  while (result.length > 200) {
    let index = 1, smallest = Infinity;
    for (let i = 1; i < result.length - 1; i++) {
      const a = result[i - 1], b = result[i], c = result[i + 1];
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      if (area < smallest) { smallest = area; index = i; }
    }
    result.splice(index, 1);
  }
  return result;
}
export type View = {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
};
type Props = {
  scene: Scene;
  workspace: Workspace;
  images: Images;
  imageVersion: number;
  tool: Tool;
  measureTokenMovement: boolean;
  onMeasureTokenMovementChange: (enabled: boolean) => void;
  selectionScope: "scenes" | "tokens" | "effects" | "fog" | "measurements" | "exploration" | "none";
  hideFog?: boolean;
  poiActivation?: "double" | "single";
  selectedPoiId?: string | null;
  selectPoi?: (id: string | null) => void;
  openLinkedScene?: (target: string) => void;
  selected: string | null;
  selectedIds?: string[];
  onMarqueeSelection?: (ids: string[], fogIndices: number[]) => void;
  select: (id: string | null) => void;
  editToken: (id: string) => void;
  onEditElement?: (kind: "token" | "effect" | "poi" | "measurement" | "fog", id: string | number) => void;
  update: (fn: (s: Scene) => void) => void;
  player: boolean;
  gridAdjust: boolean;
  resizeGrid: (delta: number) => void;
  brushSize: number;
  fogShape: "brush" | "rect" | "polygon" | "edit";
  fogControlsHost?: HTMLElement | null;
  /** Where the saved-crop controls go on wider screens: the bar above the map. */
  cropControlsHost?: HTMLElement | null;
  /** The empty map card's buttons. */
  onUploadMap?: () => void;
  onAddToken?: () => void;
  fogSelectionRequest?: { index: number; nonce: number } | null;
  fogSelectedIndices?: number[];
  onFogSelection?: (indices: number[]) => void;
  effectTemplate: EffectPreset | null;
  effectSize: number;
  effectColor: string;
  effectLabel: string;
  effectPersistent: boolean;
  effectHidden: boolean;
  effectWidth: number;
  onView: (view: View) => void;
  onLibraryTokenDrop?: (tokenId: string, point: Point) => void;
  onMeasure: (label: string) => void;
  onMeasurementChange?: (points: Point[]) => void;
  /** Moves an AI helper suggested, waiting for the GM's OK: drawn as a dashed token with an arrow. Never shown to players. */
  suggested?: { id: string; sceneId: string; tokenId: string; x: number; y: number }[];
  /** Map notes: the marker whose note card is open, drawn beside it by `renderNote`. */
  notePoiId?: string | null;
  renderNote?: (poi: PointOfInterest, at: { x: number; y: number; width: number; height: number }) => ReactNode;
  /** Player view: a tap on a marker (or on nothing, with null). */
  onPlayerPoiTap?: (id: string | null) => void;
  /** An Encyclopedia page dropped on the map, with the marker it landed on. */
  onPageDrop?: (entryId: string, point: Point, poiId: string | null) => void;
  /** Map notes: layers drawn over the map in screen space (areas, their cards, drawing a new area). */
  renderOverlay?: (view: { x: number; y: number; scale: number; width: number; height: number }) => ReactNode;
};
export default function Board(p: Props) {
  const [newCrop,setNewCrop]=useState(false);
  const [cropEditing,setCropEditing]=useState(false);
  const [cropMenuOpen,setCropMenuOpen]=useState(false);
  /** The scene whose empty-map card was closed (first click on the map, or ×). */
  const [hintGone,setHintGone]=useState<string|null>(null);
  const [pageDrop,setPageDrop]=useState(false);
  const cropFocus = Boolean(p.scene.crop && p.scene.cropFocus && !cropEditing);
  const setCropFocus = (value:boolean|((current:boolean)=>boolean)) => p.update(s=>{s.cropFocus=typeof value==="function"?value(Boolean(s.crop && s.cropFocus)):value;});
  useEffect(()=>{setCropEditing(false);},[p.scene.id]);
  type MenuTarget = { kind: "token" | "effect" | "poi" | "measurement" | "fog"; id: string | number; x: number; y: number };
  const [contextMenu, setContextMenu] = useState<MenuTarget | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const menu = menuRef.current;
    if (menu) {
      // Keep the whole menu on screen, whatever its real size turns out to be.
      const z = uiZoom(), box = menu.getBoundingClientRect(), width = box.width / z, height = box.height / z;
      const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth / z - width - 8)), top = Math.max(8, Math.min(contextMenu.y, window.innerHeight / z - height - 8));
      menu.style.left = `${left}px`; menu.style.top = `${top}px`;
    }
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setContextMenu(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); setContextMenu(null); canvas.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener("pointerdown", dismiss, true); window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", dismiss, true); window.removeEventListener("keydown", key, true); };
  }, [contextMenu]);
  useEffect(() => { setContextMenu(null); }, [p.scene.id, p.selectionScope, p.player, p.tool]);
  const allowPois = p.selectionScope === "exploration" || p.selectionScope === "scenes";
  // Tokens can be dragged with Select whatever panel is open, except while editing fog regions.
  const allowTokens = p.selectionScope !== "fog" && p.selectionScope !== "none";
  const allowEffects = p.selectionScope === "scenes" || p.selectionScope === "effects";
  const allowFog = p.selectionScope === "fog";
  const allowMeasurements = p.selectionScope === "measurements";
  const inScope = (id: string) =>
    (allowTokens && p.scene.tokens.some(item => item.id === id)) ||
    (allowEffects && p.scene.effects.some(item => item.id === id)) ||
    (allowMeasurements && p.scene.measurements.some(item => item.id === id));
  const scopedSelected = p.selected && inScope(p.selected) ? p.selected : null;
  const scopedSelectedIds = (p.selectedIds ?? (p.selected ? [p.selected] : [])).filter(inScope);
  const lastPoiDrag = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({
    x: 0,
    y: 0,
    scale: 1,
    width: 800,
    height: 600,
  });
  const [draft, setDraft] = useState<FogStroke | null>(null),
    [measurement, setMeasurement] = useState<Point[]>([]),
    [drag, setDrag] = useState<{ id: string; p: Point } | null>(null);
  const [movePlan, setMovePlan] = useState<TokenMovePlan | null>(null);
  const [marquee, setMarquee] = useState<Point[] | null>(null);
  const [polygon, setPolygon] = useState<Point[]>([]);
  const [fogIndex, setFogIndex] = useState<number | null>(null);
  const [fogVertices, setFogVertices] = useState<number[]>([]);
  const fogVertex = fogVertices[0] ?? null;
  const setFogVertex = (index: number | null) => setFogVertices(index === null ? [] : [index]);
  const fogSelected = allowFog ? p.fogSelectedIndices ?? (fogIndex === null ? [] : [fogIndex]) : [];
  const fogEditing = allowFog && p.fogShape === "edit" && (["reveal", "cover"].includes(p.tool) || p.tool === "select");
  const [fogEditMode, setFogEditMode] = useState<"resize" | "points">("resize");
  const [fogEdit, setFogEdit] = useState<FogStroke | null>(null);
  const [fogCursor, setFogCursor] = useState<Point | null>(null);
  useEffect(() => {
    if (fogIndex !== null && !p.scene.fog.strokes[fogIndex]) { setFogIndex(null); setFogVertex(null); }
  }, [fogIndex, p.scene.fog.strokes]);
  const finishPolygon = useCallback(() => {
    if (!allowFog || polygon.length < 3 || p.scene.fog.strokes.length >= 2000) return;
    const stroke: FogStroke = { mode: p.tool === "cover" ? "cover" : "reveal", shape: "polygon", size: p.brushSize, points: polygon };
    p.update(scene => { scene.fog.enabled = true; scene.fog.strokes.push(stroke); });
    setPolygon([]);
  }, [polygon, allowFog, p.tool, p.brushSize, p.update]);
  const [effectDraft, setEffectDraft] = useState<Effect | null>(null);
  const [gridDrag, setGridDrag] = useState<Point | null>(null);
  const gesture = useRef<{
    kind: string;
    start: Point;
    screen: Point;
    original?: Point;
    position?: Point;
    tokenDrag?: boolean;
    id?: string;
    view: View;
    stroke?: FogStroke;
    measure?: Point[];
    effect?: Effect;
    initialEffect?: Effect;
    templateCustom?: boolean;
    vertex?: number;
    vertices?: number[];
    initialPoints?: Point[];
    fogIndex?: number;
    resizeHandle?: number;
    additive?: boolean;
    moved?: boolean;
    /** The last pointer position on the map, so pressing or releasing Alt can re-place the token. */
    pointer?: Point;
    free?: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, Point>()),
    pinch = useRef<{ distance: number; center: Point; view: View } | null>(
      null,
    );
  // Commits clone scene objects, including crop. Fit only when actual bounds change.
  const { x: fitX, y: fitY, width: fitWidth, height: fitHeight } =
    sceneRenderBounds(p.scene, cropFocus ? mapCrop(p.scene) : null);
  useEffect(() => {
    const target = canvas.current;
    if (!target || p.player || cropEditing || !p.onLibraryTokenDrop) return;
    const drop = (event: Event) => {
      const detail = (event as CustomEvent<LibraryTokenDrop>).detail;
      if (!detail || !p.workspace.tokenLibrary.some(token => token.id === detail.tokenId)) return;
      const bounds = cropFocus ? mapCrop(p.scene) : null;
      const z = uiZoom(), box = target.getBoundingClientRect();
      const point = libraryTokenDropPoint({ x: detail.clientX / z, y: detail.clientY / z }, { left: box.left / z, top: box.top / z }, view,
        bounds ?? { x: 0, y: 0, width: p.scene.width, height: p.scene.height });
      if (!point || p.scene.tokens.length >= 500) return;
      event.preventDefault();
      if (!detail.previewOnly) p.onLibraryTokenDrop?.(detail.tokenId, point);
    };
    target.addEventListener(LIBRARY_TOKEN_DROP, drop);
    return () => target.removeEventListener(LIBRARY_TOKEN_DROP, drop);
  }, [p, cropEditing, cropFocus, view]);
  const fit = useCallback(() => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return;
    // Layout pixels: the Text size setting zooms the page, and the rect is in screen pixels.
    const z = uiZoom(), r = { width: box.width / z, height: box.height / z };
    const bounds = { x: fitX, y: fitY, width: fitWidth, height: fitHeight };
    const scale = Math.min(
      (r.width - 64) / bounds.width,
      (r.height - 64) / bounds.height,
    );
    setView({
      x: (r.width - bounds.width * scale) / 2 - bounds.x * scale,
      y: (r.height - bounds.height * scale) / 2 - bounds.y * scale,
      scale,
      width: r.width,
      height: r.height,
    });
  }, [p.scene.id, fitX, fitY, fitWidth, fitHeight]);
  useEffect(() => {
    fit();
    const observer = new ResizeObserver(() => fit());
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [fit]);
  useEffect(() => {
    setMeasurement([]);
    setMovePlan(null);
    setMarquee(null);
    setPolygon([]);
    setFogIndex(null);
    setFogVertex(null);
    setFogEdit(null);
    setDraft(null);
    setDrag(null);
    setGridDrag(null);
    setEffectDraft(null);
    gesture.current = null;
    pointers.current.clear();
    pinch.current = null;
    setFogCursor(null);
  }, [p.scene.id, p.tool, p.gridAdjust, p.player, p.selectionScope]);
  useEffect(() => {
    const index = p.fogSelectionRequest?.index;
    if (!allowFog || index === undefined) return;
    setFogIndex(p.scene.fog.strokes[index] ? index : null);
    setFogVertex(null);
    setFogEdit(null);
  }, [p.fogSelectionRequest, allowFog]);
  useEffect(() => {
    if (allowFog && p.fogSelectedIndices) { setFogIndex(p.fogSelectedIndices.at(-1) ?? null); setFogVertices([]); }
  }, [p.fogSelectedIndices, p.tool, p.fogShape, p.scene.id, allowFog]);
  useEffect(() => p.onView(view), [view, p.onView]);
  useEffect(() => {
    if (p.measureTokenMovement) return;
    setMovePlan(null);
    const g = gesture.current;
    if (g?.tokenDrag) g.measure = undefined;
    // Disabling the preference clears the route without ending the token drag.
    if (p.tool !== "measure") setMeasurement([]);
  }, [p.measureTokenMovement, p.tool]);
  useEffect(() => {
    if (cropEditing) { setMovePlan(null); setMeasurement([]); }
  }, [cropEditing]);
  const cancelMovePlan = useCallback(() => {
    setMovePlan(null); setMeasurement([]); gesture.current = null;
  }, []);
  useEffect(() => {
    if (movePlan && !tokenMovePlanValid(movePlan, p.scene)) cancelMovePlan();
  }, [movePlan, p.scene, cancelMovePlan]);
  const selectedMoveToken = !p.player && !p.gridAdjust && !cropEditing && p.tool === "select" && allowTokens
    ? p.scene.tokens.find(token => token.id === p.selected) : undefined;
  const validMovePlan = movePlan && !p.player && !p.gridAdjust && !cropEditing && p.tool === "select" && allowTokens && tokenMovePlanValid(movePlan, p.scene) ? movePlan : null;
  const commitMovePlan = () => {
    if (!validMovePlan) return;
    // Recheck against the scene supplied by update, not only the rendered snapshot.
    p.update(scene => {
      const destination = tokenMovePlanDestination(validMovePlan, scene);
      const token = scene.tokens.find(item => item.id === validMovePlan.tokenId);
      if (destination && token) Object.assign(token, destination);
    });
    setMovePlan(null);
  };
  const addWaypoint = useCallback(() => {
    const g = gesture.current;
    if (!g || (g.kind !== "measure" && !(g.kind === "drag" && g.tokenDrag)) || !g.measure || g.measure.length >= 200) return;
    const end = g.measure[g.measure.length - 1];
    const previous = g.measure[g.measure.length - 2];
    if (previous && end.x === previous.x && end.y === previous.y) return;
    g.measure = [...g.measure, end];
    setMeasurement(g.measure);
  }, []);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (menuRef.current?.contains(document.activeElement) || document.querySelector("[role=dialog], [aria-modal=true]")) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) {
        const g = gesture.current;
        if (e.code === "Space" && (g?.kind === "measure" || (g?.kind === "drag" && g.tokenDrag && g.measure))) e.preventDefault();
        return;
      }
      if (!p.player && allowFog && ["reveal", "cover"].includes(p.tool) && p.fogShape === "polygon") {
        if (e.key === "Enter") { e.preventDefault(); finishPolygon(); }
        if (e.key === "Escape") setPolygon([]);
        if (e.key === "Backspace") { e.preventDefault(); setPolygon(points => points.slice(0, -1)); }
      }
      if (!p.player && fogEditing && fogIndex !== null && ["Delete", "Backspace"].includes(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation();
        const stroke = p.scene.fog.strokes[fogIndex];
        if (!stroke) return;
        if (fogVertex !== null && stroke.shape !== "merged") {
          const copy = fogPolygon(stroke);
          if (copy.points.length - fogVertices.length < 3) return;
          p.update(scene => { scene.fog.strokes[fogIndex] = { ...copy, points: copy.points.filter((_, index) => !fogVertices.includes(index)) }; });
          setFogVertex(null);
        } else {
          p.update(scene => { scene.fog.strokes = scene.fog.strokes.filter((_, index) => !fogSelected.includes(index)); }); setFogIndex(null); p.onFogSelection?.([]);
        }
      }
      if (movePlan && e.key === "Escape") {
        e.preventDefault(); e.stopImmediatePropagation(); cancelMovePlan(); return;
      }
      const g = gesture.current;
      if (!p.player && g?.kind === "drag" && g.tokenDrag) {
        if (e.key === "Escape") {
          e.preventDefault(); e.stopImmediatePropagation();
          gesture.current = null; setDrag(null); setMeasurement([]);
        } else if (e.key.toLowerCase() === "q") {
          e.preventDefault(); e.stopImmediatePropagation();
          if (g.measure) addWaypoint();
          else {
            p.onMeasureTokenMovementChange(true);
            g.measure = [g.original!, g.position ?? g.original!];
            setMeasurement(g.measure);
          }
        } else if (e.code === "Space" && g.measure) {
          e.preventDefault(); e.stopImmediatePropagation(); addWaypoint();
        }
      } else if ((e.key.toLowerCase() === "q" || e.code === "Space") && g?.kind === "measure") {
        e.preventDefault(); e.stopImmediatePropagation(); addWaypoint();
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [addWaypoint, allowFog, p.player, p.tool, p.fogShape, finishPolygon, fogIndex, fogVertices, fogEditing, p.fogSelectedIndices, p.onFogSelection, p.scene.fog.strokes, p.update, p.onMeasureTokenMovementChange, movePlan, cancelMovePlan]);
  const dragSize = drag ? p.scene.tokens.find(token => token.id === drag.id)?.size ?? 1 : 1;
  useEffect(() => {
    p.onMeasurementChange?.(measurement);
    const points = measurement.filter((point, index) => index === 0 ||
      point.x !== measurement[index - 1].x || point.y !== measurement[index - 1].y);
    // Same count as the ruler on the map, so legs dragged off the grid (Alt) measure as straight lines.
    const total = dragRuler(points, p.scene.grid, { size: dragSize }).total;
    p.onMeasure(
      points.length > 1
        ? `${Number(total.toFixed(2))} ${p.scene.grid.unit} · ${points.length - 1} segment${points.length > 2 ? "s" : ""}`
        : "",
    );
  }, [measurement, dragSize, p.scene.grid, p.onMeasure, p.onMeasurementChange]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(devicePixelRatio || 1, 2) * uiZoom();
    c.width = Math.round(view.width * dpr);
    c.height = Math.round(view.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    ctx.shadowColor = "#00000030";
    ctx.shadowBlur = 20 / view.scale;
    const crop = cropFocus ? mapCrop(p.scene) : null;
    drawSceneBackdrop(ctx, p.scene, crop);
    ctx.shadowColor = "transparent";
    const previewDrag = validMovePlan
      ? { id: validMovePlan.tokenId, p: validMovePlan.points.at(-1)! } : drag;
    const scene = previewDrag
      ? syncTokenAttachments(p.scene, {
          ...p.scene,
          tokens: p.scene.tokens.map((t) =>
            t.id === previewDrag.id ? { ...t, ...previewDrag.p } : { ...t },
          ),
          pointsOfInterest: p.scene.pointsOfInterest.map(item => item.id === previewDrag.id ? { ...item, ...previewDrag.p } : item),
          effects: p.scene.effects.map((e) =>
            e.id === previewDrag.id ? { ...e, ...previewDrag.p } : e,
          ),
        })
      : p.scene;
    const effectScene = effectDraft ? {
      ...scene,
      effects: [...scene.effects.filter((effect) => effect.id !== effectDraft.id), effectDraft],
    } : scene;
    const preview = gridDrag
      ? { ...effectScene, grid: { ...effectScene.grid, offsetX: gridDrag.x, offsetY: gridDrag.y } }
      : effectScene;
    const fogPreview = fogEdit && fogIndex !== null ? { ...preview, fog: { ...preview.fog, strokes: preview.fog.strokes.map((stroke, index) => index === fogIndex ? fogEdit : stroke) } } : preview;
    // The drag ruler: squares coloured by the token's speed under the tokens, the path and distances on top.
    const rulerTokenId = drag?.id ?? validMovePlan?.tokenId;
    const rulerToken = rulerTokenId ? p.scene.tokens.find(token => token.id === rulerTokenId) : undefined;
    const rulerInput = !p.player && measurement.length > 1 ? {
      points: measurement, grid: p.scene.grid, scale: view.scale,
      size: rulerToken?.size ?? 1, speed: rulerToken?.speed ?? null,
      radius: rulerToken ? tokenRadius(rulerToken, p.scene.grid) : 0,
    } : null;
    const ruler = rulerInput ? measureRuler(rulerInput) : null;
    renderScene(ctx, p.hideFog && !p.player ? { ...fogPreview, fog: { ...fogPreview.fog, enabled: false } } : fogPreview, p.workspace, p.images, {
      crop,
      player: p.player,
      markerScale: Math.max(1,1/view.scale),
      selected: scopedSelected,
      draft,
      underTokens: ruler ? c => drawRulerCells(c, ruler, p.scene.grid) : undefined,
    });
    if (rulerInput && ruler) drawRulerPath(ctx, rulerInput, ruler);
    if (!p.player && allowPois && p.selectedPoiId) {
      const poi = scene.pointsOfInterest.find(item => item.id === p.selectedPoiId);
      if (poi) {
        ctx.save(); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2 / view.scale;
        ctx.beginPath(); ctx.arc(poi.x, poi.y, Math.max(20, 20 / view.scale), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    const selectedIds = scopedSelectedIds;
    if (!p.player) {
      ctx.save(); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3 / view.scale;
      for (const token of p.scene.tokens.filter(item => selectedIds.includes(item.id))) {
        ctx.beginPath(); ctx.arc(token.x, token.y, tokenRadius(token, p.scene.grid) + 4 / view.scale, 0, Math.PI * 2); ctx.stroke();
      }
      for (const stored of p.scene.effects.filter(item => selectedIds.includes(item.id))) {
        const effect = resolveEffect(stored, p.scene.tokens); ctx.beginPath();
        if (effect.type === "circle") ctx.arc(effect.x, effect.y, effect.size * p.scene.grid.size, 0, Math.PI * 2);
        else { effectPolygon(effect, p.scene.grid).forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); }
        ctx.stroke();
      }
      for (const item of p.scene.measurements.filter(item => selectedIds.includes(item.id))) {
        ctx.beginPath(); item.points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke();
      }
      ctx.restore();
    }
    if (marquee) {
      const bounds = regionBounds(marquee);
      ctx.save(); ctx.fillStyle = "#38bdf825"; ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5 / view.scale;
      ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top); ctx.restore();
    }
    if (!p.player) for (const move of (p.suggested ?? []).filter(m => m.sceneId === p.scene.id)) {
      const token = p.scene.tokens.find(t => t.id === move.tokenId);
      if (!token) continue;
      const r = tokenRadius(token, p.scene.grid), dx = move.x - token.x, dy = move.y - token.y, length = Math.hypot(dx, dy);
      ctx.save(); ctx.strokeStyle = "#a86d12"; ctx.fillStyle = "#fbf1dee6"; ctx.lineWidth = 2.5 / view.scale; ctx.setLineDash([7 / view.scale, 5 / view.scale]);
      if (length > r * 2) {
        // From the token's edge to the dashed token's edge, with an arrowhead.
        const ux = dx / length, uy = dy / length, sx = token.x + ux * r, sy = token.y + uy * r, ex = move.x - ux * (r + 3 / view.scale), ey = move.y - uy * (r + 3 / view.scale), head = 12 / view.scale;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ex - ux * head - uy * head * 0.6, ey - uy * head + ux * head * 0.6); ctx.lineTo(ex, ey); ctx.lineTo(ex - ux * head + uy * head * 0.6, ey - uy * head - ux * head * 0.6); ctx.stroke();
        ctx.setLineDash([7 / view.scale, 5 / view.scale]);
      }
      ctx.beginPath(); ctx.arc(move.x, move.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      const initials = token.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
      ctx.fillStyle = "#a86d12"; ctx.font = `600 ${Math.max(10, r * 0.7)}px Inter, system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(initials, move.x, move.y);
      // The label sits above the dashed token, on a pale backing, so it never runs into the name under a neighbour.
      const label = `${token.name}, suggested`, size = Math.max(10, 12 / view.scale), pad = 4 / view.scale;
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`; ctx.textBaseline = "bottom";
      const width = ctx.measureText(label).width, bottom = move.y - r - 4 / view.scale;
      ctx.fillStyle = "#fbf1def2"; ctx.fillRect(move.x - width / 2 - pad, bottom - size - pad, width + pad * 2, size + pad * 2);
      ctx.fillStyle = "#a86d12"; ctx.fillText(label, move.x, bottom + pad / 2);
      ctx.restore();
    }
    const savedSelection = p.scene.measurements.find(item => item.id === scopedSelected);
    if (!p.player && savedSelection) {
      ctx.save(); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 4 / view.scale; ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      ctx.beginPath(); savedSelection.points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke(); ctx.restore();
    }
    if (!p.player && allowFog && (["reveal", "cover"].includes(p.tool) || p.tool === "select" || p.tool === "marquee")) {
      ctx.save(); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2 / view.scale;
      fogSelected.filter(index => p.tool === "marquee" || index !== fogIndex).forEach(index => {
        const stroke = p.scene.fog.strokes[index]; if (!stroke) return;
        ctx.beginPath();
        if (stroke.shape === "brush") stroke.points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        fogRegionParts(stroke).forEach(part => {
          fogPolygon({ ...stroke, shape: part.shape, points: part.points }).points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath();
        }); ctx.stroke();
      }); ctx.restore();
      const storedFog = p.fogShape === "edit" && fogIndex !== null ? (fogEdit || p.scene.fog.strokes[fogIndex]) : null;
      const editing = storedFog ? fogPolygon(storedFog) : null;
      const points = p.fogShape === "polygon" ? polygon : editing && ["polygon", "merged", "brush"].includes(editing.shape) ? editing.points : [];
      if (points.length) {
        ctx.save();
        ctx.strokeStyle = "#fbbf24";
        ctx.fillStyle = "#fbbf2420";
        ctx.lineWidth = 2 / view.scale;
        ctx.beginPath();
        if (editing) {
          if (editing.shape === "brush") editing.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
          fogRegionParts(editing).forEach(part => {
            const outline = fogPolygon({ ...editing, shape: part.shape, points: part.points }).points;
            outline.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
            ctx.closePath();
          });
          ctx.fill(editing.fillRule ?? "nonzero");
        }
        else {
          points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
          if (fogCursor) ctx.lineTo(fogCursor.x, fogCursor.y);
        }
        ctx.stroke();
        const handle = (point: Point, radius: number, color: string) => {
          ctx.beginPath(); ctx.arc(point.x, point.y, radius / view.scale, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill(); ctx.stroke();
        };
        if (editing && (fogEditMode === "resize" || editing.shape === "merged" || editing.shape === "brush")) {
          const bounds = regionBounds(points);
          ctx.setLineDash([5 / view.scale, 4 / view.scale]);
          ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
          ctx.setLineDash([]);
          regionHandles(points).forEach(point => {
            const size = 10 / view.scale;
            ctx.fillStyle = "#fff";
            ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
            ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
          });
        } else {
          if (editing) polygonMidpoints(points).forEach(point => handle(point, 4, "#fff"));
          points.forEach((point, index) => handle(point, 6, fogVertices.includes(index) ? "#fbbf24" : "#111827"));
        }
        ctx.restore();
      }
    }
  }, [
    p.selectedPoiId, p.selectionScope, p.hideFog, marquee, p.selectedIds, polygon, fogIndex, fogEdit, fogVertices, p.fogSelectedIndices, fogCursor, fogEditMode, p.fogShape, p.tool,
    view,
    cropFocus,
    p.scene,
    p.workspace,
    p.imageVersion,
    p.selected,
    p.player,
    draft,
    measurement,
    movePlan,
    validMovePlan,
    drag,
    gridDrag,
    effectDraft,
    p.images,
    p.suggested,
  ]);
  const screen = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect(), z = uiZoom();
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  };
  const world = (s: Point, v = view) => ({
    x: (s.x - v.x) / v.scale,
    y: (s.y - v.y) / v.scale,
  });
  const clamp = (q: Point) => ({
    x: Math.max(0, Math.min(p.scene.width, q.x)),
    y: Math.max(0, Math.min(p.scene.height, q.y)),
  });
  const gridPosition = (g: NonNullable<typeof gesture.current>, sp: Point) => {
    const limit = (n: number) => Math.max(-500, Math.min(500, Math.round(n * 10) / 10));
    return {
      x: limit(g.original!.x + (sp.x - g.screen.x) / g.view.scale),
      y: limit(g.original!.y + (sp.y - g.screen.y) / g.view.scale),
    };
  };
  const zoom = (
    factor: number,
    center = { x: view.width / 2, y: view.height / 2 },
  ) =>
    setView((v) => {
      const scale = Math.max(0.01, Math.min(6, v.scale * factor));
      return {
        ...v,
        scale,
        x: center.x - ((center.x - v.x) * scale) / v.scale,
        y: center.y - ((center.y - v.y) * scale) / v.scale,
      };
    });
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (p.gridAdjust && !p.player && !e.ctrlKey && !e.metaKey) {
        if (e.deltaY) p.resizeGrid(-Math.sign(e.deltaY) * (e.altKey ? 0.1 : 1));
        return;
      }
      zoom(Math.exp(-e.deltaY * 0.001), screen(e));
    };
    c.addEventListener("wheel", wheel, { passive: false });
    return () => c.removeEventListener("wheel", wheel);
  }, [view, p.gridAdjust, p.player, p.resizeGrid]);
  /** Move the dragged token to the pointer, on the grid or (Alt) off it, and extend the ruler. */
  const placeDrag = (g: NonNullable<typeof gesture.current>, free: boolean) => {
    if (!g.pointer || !g.original) return;
    const q = clamp(tokenDragPosition(g.original, g.start, g.pointer, p.scene.grid,
      p.scene.tokens.find(t => t.id === g.id)?.size, free));
    g.position = q; g.free = free;
    if (g.measure) {
      g.measure = [...g.measure.slice(0, -1), q];
      setMeasurement(g.measure);
    }
    setDrag({ id: g.id!, p: q });
  };
  const placeDragRef = useRef(placeDrag);
  useEffect(() => { placeDragRef.current = placeDrag; });
  // Pressing or letting go of Alt mid-drag re-places the token without waiting for the pointer to move.
  useEffect(() => {
    const alt = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      const g = gesture.current;
      if (g?.kind !== "drag" || !g.pointer || !g.position) return;
      e.preventDefault();
      if (g.free !== (e.type === "keydown")) placeDragRef.current(g, e.type === "keydown");
    };
    window.addEventListener("keydown", alt, true); window.addEventListener("keyup", alt, true);
    return () => { window.removeEventListener("keydown", alt, true); window.removeEventListener("keyup", alt, true); };
  }, []);
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const sp = screen(e);
    pointers.current.set(e.pointerId, sp);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view,
      };
      if (gesture.current?.kind === "measure" || gesture.current?.measure) setMeasurement([]);
      gesture.current = null;
      setDraft(null);
      setDrag(null);
      setGridDrag(null);
      setEffectDraft(null);
      setFogEdit(null);
      setMarquee(null);
      return;
    }
    const pos = clamp(world(sp));
    const g = { kind: "pan", start: pos, screen: sp, view };
    if (p.gridAdjust && !p.player && p.scene.grid.type !== "none" && e.button === 0) {
      gesture.current = {
        ...g,
        kind: "grid",
        original: { x: p.scene.grid.offsetX, y: p.scene.grid.offsetY },
      };
      return;
    }
    if (p.player || p.tool === "pan" || e.button === 1) {
      gesture.current = g;
      return;
    }
    if (validMovePlan && !cropEditing) {
      gesture.current = { ...g, kind: "plan-tap" };
      return;
    }
    if (p.tool === "poi" && allowPois) {
      const id = uid();
      p.update(scene => { scene.pointsOfInterest.push({ id, name: p.poiActivation === "single" ? "New transition" : "New location", ...pos, color: "#d4a654", hidden: false, folderId: null, targetSceneId: null, activation: p.poiActivation ?? "double", notes: "" }); });
      p.selectPoi?.(id);
      return;
    }
    if (p.tool === "marquee" && p.selectionScope !== "none") {
      gesture.current = { ...g, kind: "marquee", additive: e.shiftKey };
      setMarquee([pos, pos]);
      return;
    }
    const editFogAt = () => {
        const stored = fogIndex !== null ? p.scene.fog.strokes[fogIndex] : null;
        const stroke = stored ? fogPolygon(stored) : null;
        if (stroke && ["polygon", "merged", "brush"].includes(stroke.shape)) {
          const hit = (point: Point) => Math.hypot(point.x - pos.x, point.y - pos.y) <= 11 / view.scale;
          if (!e.shiftKey && (fogEditMode === "resize" || stroke.shape === "merged" || stroke.shape === "brush")) {
            const resizeHandle = regionHandles(stroke.points).findIndex(hit);
            if (resizeHandle >= 0) {
              setFogVertex(null);
              gesture.current = { ...g, kind: "fog-resize", stroke: structuredClone(stroke), resizeHandle, fogIndex: fogIndex! };
              return;
            }
          }
          const vertex = stroke.points.findIndex(hit);
          const midpoint = polygonMidpoints(stroke.points).findIndex(hit);
          if (stroke.shape === "polygon" && fogEditMode === "points" && (vertex >= 0 || midpoint >= 0)) {
            const copy = structuredClone(stroke);
            const index = vertex >= 0 ? vertex : midpoint + 1;
            if (vertex < 0 && copy.points.length >= 10000) return;
            if (vertex < 0) copy.points.splice(index, 0, polygonMidpoints(stroke.points)[midpoint]);
            if (e.shiftKey && vertex >= 0) {
              setFogVertices(indices => indices.includes(index) ? indices.filter(i => i !== index) : [...indices, index]); return;
            }
            const vertices = vertex >= 0 && fogVertices.includes(index) ? fogVertices : [index];
            setFogVertices(vertices); setFogEdit(copy);
            gesture.current = { ...g, kind: "fog-vertex", stroke: copy, vertex: index, vertices, initialPoints: structuredClone(copy.points), fogIndex: fogIndex! };
            return;
          }
        }
        let index = -1;
        for (let i = p.scene.fog.strokes.length - 1; i >= 0; i--) {
          const candidate = fogPolygon(p.scene.fog.strokes[i]);
          if (candidate.shape === "brush" ? candidate.points.some((point, i) => segmentDistance(pos, candidate.points[Math.max(0, i - 1)], point) <= candidate.size / 2 + 5 / view.scale) : fogRegionParts(candidate).some(part => { const points = fogPolygon({ ...candidate, shape: part.shape, points: part.points }).points; return fogRegionContains(candidate, pos) || points.some((point, i) => segmentDistance(pos, point, points[(i + 1) % points.length]) <= 6 / view.scale); })) { index = i; break; }
        }
        const indices = index < 0 ? [] : e.shiftKey ? fogSelected.includes(index) ? fogSelected.filter(i => i !== index) : [...fogSelected, index] : [index];
        setFogIndex(indices.at(-1) ?? null); setFogVertex(null); p.onFogSelection?.(indices);
        if (e.shiftKey) return;
        if (index >= 0) {
          const copy = structuredClone(fogPolygon(p.scene.fog.strokes[index]));
          gesture.current = { ...g, kind: "fog-move", stroke: copy, fogIndex: index };
        }
        return;
      };
    if (p.tool === "select") {
      const poi = allowPois ? [...p.scene.pointsOfInterest].reverse().find(item => Math.hypot(item.x - pos.x, item.y - pos.y) <= Math.max(18, 18 / view.scale)) : undefined;
      if (poi) {
        p.selectPoi?.(poi.id);
        gesture.current = { ...g, kind: "poi", id: poi.id, original: { x: poi.x, y: poi.y } };
        return;
      }
      if (allowPois) p.selectPoi?.(null);
      const t = [...(allowTokens ? p.scene.tokens : [])]
        .reverse()
        .find(
          (t) =>
            Math.hypot(t.x - pos.x, t.y - pos.y) <=
            tokenRadius(t, p.scene.grid),
        );
      const saved = [...(allowMeasurements ? p.scene.measurements : [])].reverse().find(item => item.points.some((point, index) => index > 0 && segmentDistance(pos, item.points[index - 1], point) <= 10 / view.scale));
      if (!t && saved) { p.onFogSelection?.([]); p.select(saved.id); return; }
      const selectedStoredEffect = allowEffects ? p.scene.effects.find((effect) => effect.id === scopedSelected) : undefined;
      const selectedEffect = selectedStoredEffect ? resolveEffect(selectedStoredEffect, p.scene.tokens) : undefined;
      if (selectedEffect && selectedEffect.kind !== "label" && !selectedEffect.locked && !t) {
        const handles = effectHandles(selectedEffect, p.scene.grid);
        const hit = (point: Point) => Math.hypot(point.x - pos.x, point.y - pos.y) <= 12 / view.scale;
        const handle = hit(handles.resize) ? "resize" : selectedEffect.type !== "circle" && hit(handles.rotate) ? "rotate" : null;
        if (handle) {
          gesture.current = { ...g, kind: handle, effect: structuredClone(selectedEffect), initialEffect: structuredClone(selectedEffect) };
          return;
        }
      }
      const effect = [...(allowEffects ? p.scene.effects : [])].reverse().find((effect) => effectContains(resolveEffect(effect, p.scene.tokens), pos, p.scene.grid));
      const item = t || effect;
      if (item) {
        p.onFogSelection?.([]);
        p.select(item.id);
        if (!t && (effect?.tokenId || effect?.locked)) return;
        const movementPath = t && p.measureTokenMovement ? [{ x: t.x, y: t.y }, { x: t.x, y: t.y }] : undefined;
        if (t) setMeasurement(movementPath ?? []);
        gesture.current = {
          ...g,
          kind: "drag",
          tokenDrag: !!t,
          measure: movementPath,
          id: item.id,
          original: { x: item.x, y: item.y },
        };
      } else {
        if (allowFog) editFogAt();
        if (gesture.current || e.shiftKey) return;
        gesture.current = { ...g, kind: "empty" };
      }
      return;
    }
    if (p.tool === "measure") {
      const q = snap(pos, { ...p.scene.grid, snap: true });
      // Touch taps can extend a path without requiring a hardware keyboard.
      const points = e.pointerType === "touch" && measurement.length
        ? measurement.length < 200 ? [...measurement, q] : [...measurement.slice(0, -1), q]
        : [q, q];
      gesture.current = { ...g, kind: "measure", measure: points };
      setMeasurement(points);
      return;
    }
    if (allowFog && (p.tool === "reveal" || p.tool === "cover")) {
      if (p.fogShape === "polygon") {
        if (polygon.length >= 3 && Math.hypot(pos.x - polygon[0].x, pos.y - polygon[0].y) < 12 / view.scale) finishPolygon();
        else setPolygon(points => points.length < 10000 ? [...points, pos] : points);
        return;
      }
      if (p.fogShape === "edit") { if (allowFog) editFogAt(); return; }
      if (p.scene.fog.strokes.length >= 2000) return;
      const stroke: FogStroke = {
        mode: p.tool,
        shape: p.fogShape,
        size: p.brushSize,
        points: [pos],
      };
      gesture.current = { ...g, kind: "fog", stroke };
      setDraft(stroke);
      return;
    }
    if (["circle", "square", "line", "cone", "custom"].includes(p.tool)) {
      const point = e.shiftKey ? pos : snap(pos, p.scene.grid);
      const effect: Effect = {
        ...p.effectTemplate,
        id: uid(), type: p.tool as Effect["type"], ...point,
        size: boundEffectSize(p.effectSize), width: Math.max(0.05, Math.min(200, p.effectWidth)), rotation: p.effectTemplate?.rotation??0, angle: p.effectTemplate?.angle??90,
        color: p.effectColor, label: p.effectLabel,
        persistent: p.effectPersistent, hidden: p.effectHidden, tokenId: null,
        points: p.tool === "custom" ? (p.effectTemplate?.points.length?p.effectTemplate.points.map(point=>({x:point.x*boundEffectSize(p.effectSize)/p.effectTemplate!.size,y:point.y*boundEffectSize(p.effectSize)/p.effectTemplate!.size})):[{ x: 0, y: 0 }]) : [],
      };
      gesture.current = { ...g, start: point, kind: "effect", effect,templateCustom:p.tool==="custom"&&!!p.effectTemplate?.points.length,initialEffect:p.tool==="custom"&&p.effectTemplate?.points.length?structuredClone(effect):undefined };
      setEffectDraft(effect);
    }
  };
  const move = (e: React.PointerEvent) => {
    const sp = screen(e);
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, sp);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()],
        start = pinch.current;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale = Math.max(
          0.01,
          Math.min(
            6,
            (start.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) /
              Math.max(1, start.distance),
          ),
        );
      setView({
        ...start.view,
        scale,
        x:
          center.x -
          ((start.center.x - start.view.x) * scale) / start.view.scale,
        y:
          center.y -
          ((start.center.y - start.view.y) * scale) / start.view.scale,
      });
      return;
    }
    const g = gesture.current;
    if (p.fogShape === "polygon") setFogCursor(clamp(world(sp)));
    if (!g) return;
    if (g.kind === "poi") {
      if (!g.moved && Math.hypot(sp.x - g.screen.x, sp.y - g.screen.y) < 4) return;
      g.moved = true;
      const pos = world(sp);
      setDrag({ id: g.id!, p: clamp({ x: g.original!.x + pos.x - g.start.x, y: g.original!.y + pos.y - g.start.y }) });
      return;
    }
    if (g.kind === "marquee") { setMarquee([g.start, clamp(world(sp))]); return; }
    if (g.kind === "fog-resize" && g.stroke) {
      const bounds = regionBounds(g.stroke.points), next = { ...bounds }, point = clamp(world(sp));
      const handle = g.resizeHandle!;
      if ([0, 6, 7].includes(handle)) next.left = Math.min(point.x, bounds.right - 1);
      if ([2, 3, 4].includes(handle)) next.right = Math.max(point.x, bounds.left + 1);
      if ([0, 1, 2].includes(handle)) next.top = Math.min(point.y, bounds.bottom - 1);
      if ([4, 5, 6].includes(handle)) next.bottom = Math.max(point.y, bounds.top + 1);
      setFogEdit({ ...g.stroke, points: g.stroke.points.map(point => ({
        x: next.left + (point.x - bounds.left) / Math.max(1, bounds.right - bounds.left) * (next.right - next.left),
        y: next.top + (point.y - bounds.top) / Math.max(1, bounds.bottom - bounds.top) * (next.bottom - next.top),
      })) });
      return;
    }
    if (g.kind === "fog-move" && g.stroke) {
      if (Math.hypot(sp.x - g.screen.x, sp.y - g.screen.y) < 4) return;
      const points = g.stroke.points;
      const desired = world(sp);
      const dx = Math.max(-Math.min(...points.map(point => point.x)), Math.min(p.scene.width - Math.max(...points.map(point => point.x)), desired.x - g.start.x));
      const dy = Math.max(-Math.min(...points.map(point => point.y)), Math.min(p.scene.height - Math.max(...points.map(point => point.y)), desired.y - g.start.y));
      setFogEdit({ ...g.stroke, points: points.map(point => ({ x: point.x + dx, y: point.y + dy })) });
      return;
    }
    if (g.kind === "fog-vertex" && g.stroke) {
      const target = clamp(world(sp)), original = g.initialPoints ?? g.stroke.points;
      const vertices = g.vertices ?? [g.vertex!];
      const chosen = vertices.map(index => original[index]);
      const dx = Math.max(-Math.min(...chosen.map(point => point.x)), Math.min(p.scene.width - Math.max(...chosen.map(point => point.x)), target.x - original[g.vertex!].x));
      const dy = Math.max(-Math.min(...chosen.map(point => point.y)), Math.min(p.scene.height - Math.max(...chosen.map(point => point.y)), target.y - original[g.vertex!].y));
      g.stroke.points = original.map((point, index) => vertices.includes(index) ? { x: point.x + dx, y: point.y + dy } : point);
      setFogEdit({ ...g.stroke, points: [...g.stroke.points] });
      return;
    }
    if (g.kind === "grid") {
      setGridDrag(gridPosition(g, sp));
      return;
    }
    const pos = clamp(world(sp));
    if ((g.kind === "effect" || g.kind === "resize" || g.kind === "rotate") && g.effect) {
      const effect = g.effect;
      const dx = pos.x - effect.x, dy = pos.y - effect.y;
      const distance = Math.hypot(dx, dy);
      if (g.kind === "rotate") {
        effect.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
        if (!e.shiftKey) effect.rotation = Math.round(effect.rotation / 5) * 5;
      } else if (effect.type === "custom" && g.kind === "effect" && !g.templateCustom) {
        const last = effect.points[effect.points.length - 1];
        if (!last || Math.hypot(dx - last.x, dy - last.y) >= 5 / view.scale) {
          const limit = Math.min(1, 200 * p.scene.grid.size / Math.max(1, distance));
          effect.points = thinArea([...effect.points, { x: dx * limit, y: dy * limit }]);
          effect.size = boundEffectSize(Math.max(...effect.points.map((point) => Math.hypot(point.x, point.y))) / p.scene.grid.size);
        }
      } else if (effect.type === "custom" && g.initialEffect) {
        const original = g.initialEffect;
        const radius = Math.max(1, ...original.points.map((point) => Math.hypot(point.x, point.y)));
        const targetSize = boundEffectSize(original.size * distance / radius);
        const factor = targetSize / original.size;
        effect.points = original.points.map((point) => ({ x: point.x * factor, y: point.y * factor }));
        effect.size = targetSize;
      } else {
        const radians = (effect.rotation || 0) * Math.PI / 180;
        const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
        const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
        const pixels = effect.type === "square" ? Math.max(Math.abs(localX), Math.abs(localY)) * 2 : distance;
        const cells = pixels / p.scene.grid.size;
        effect.size = boundEffectSize(e.shiftKey ? cells : Math.round(cells * 4) / 4);
        if (g.kind === "effect" && (effect.type === "line" || effect.type === "cone")) effect.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
      }
      setEffectDraft({ ...effect });
      return;
    }
    if (g.kind === "measure" && g.measure) {
      const q = e.altKey ? pos : snap(pos, { ...p.scene.grid, snap: true });
      g.measure = [...g.measure.slice(0, -1), q];
      setMeasurement(g.measure);
      return;
    }
    if (
      g.kind === "pan" ||
      (["empty", "plan-tap"].includes(g.kind) &&
        Math.hypot(sp.x - g.screen.x, sp.y - g.screen.y) > 7)
    ) {
      g.kind = "pan";
      setView({
        ...g.view,
        x: g.view.x + sp.x - g.screen.x,
        y: g.view.y + sp.y - g.screen.y,
      });
    } else if (g.kind === "drag") {
      if (!drag && Math.hypot(sp.x - g.screen.x, sp.y - g.screen.y) < 4) return;
      g.pointer = pos;
      placeDrag(g, e.altKey);
    } else if (g.kind === "fog" && g.stroke) {
      const prev = g.stroke.points[g.stroke.points.length - 1];
      if (Math.hypot(pos.x - prev.x, pos.y - prev.y) < 2) return;
      g.stroke = {
        ...g.stroke,
        points:
          g.stroke.shape === "rect"
            ? [g.stroke.points[0], pos]
            : [...g.stroke.points, pos],
      };
      setDraft(g.stroke);
    }
  };
  const up = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (!pointers.current.size) pinch.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (p.player && p.onPlayerPoiTap) {
      const sp = screen(e);
      if (Math.hypot(sp.x - g.screen.x, sp.y - g.screen.y) < 6) {
        const pos = world(sp);
        p.onPlayerPoiTap([...p.scene.pointsOfInterest].reverse().find(item => !item.hidden && Math.hypot(item.x - pos.x, item.y - pos.y) <= Math.max(18, 18 / view.scale))?.id ?? null);
      }
    }
    if (g.kind === "plan-tap" && validMovePlan) {
      const next = appendTokenMovePoint(validMovePlan, clamp(world(screen(e))), p.scene.grid, p.scene);
      setMovePlan(next); setMeasurement(next.points);
      return;
    }
    if (g.kind === "poi") {
      const poi = p.scene.pointsOfInterest.find(item => item.id === g.id);
      if (g.moved && poi) {
        lastPoiDrag.current = Date.now();
        const pos = world(screen(e));
        const point = clamp({ x: g.original!.x + pos.x - g.start.x, y: g.original!.y + pos.y - g.start.y });
        p.update(scene => { const item = scene.pointsOfInterest.find(item => item.id === g.id); if (item) Object.assign(item, point); });
      } else if (poi?.activation === "single" && poi.targetSceneId) p.openLinkedScene?.(poi.targetSceneId);
      setDrag(null);
      return;
    }
    if (g.kind === "marquee") {
      const bounds = regionBounds([g.start, clamp(world(screen(e)))]);
      const inside = (point: Point) => point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
      const corners = [{ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top }, { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }];
      const segmentHits = (a: Point, b: Point, radius = 0) => {
        if (inside(a) || inside(b)) return true;
        // Distance between the segment and each box edge, including parallel and crossing edges.
        return corners.some((c, i) => {
          const d = corners[(i + 1) % corners.length];
          const cross = (u: Point, v: Point, w: Point) => (v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x);
          const crosses = cross(a,b,c)*cross(a,b,d) <= 0 && cross(c,d,a)*cross(c,d,b) <= 0 &&
            Math.max(a.x,b.x) >= Math.min(c.x,d.x) && Math.min(a.x,b.x) <= Math.max(c.x,d.x) &&
            Math.max(a.y,b.y) >= Math.min(c.y,d.y) && Math.min(a.y,b.y) <= Math.max(c.y,d.y);
          return crosses || Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b)) <= radius;
        });
      };
      const pathHits = (points: Point[], closed: boolean, radius = 0) => points.some((point, i) =>
        segmentHits(point, points[i + 1] ?? (closed ? points[0] : point), radius)) || (closed && corners.some(corner => polygonContains(points, corner)));
      const circleHits = (point: Point, radius: number) => Math.hypot(point.x - Math.max(bounds.left, Math.min(bounds.right, point.x)), point.y - Math.max(bounds.top, Math.min(bounds.bottom, point.y))) <= radius;
      const ids = [
        ...(allowTokens ? p.scene.tokens : []).filter(token => circleHits(token, tokenRadius(token, p.scene.grid))).map(item => item.id),
        ...(allowEffects ? p.scene.effects : []).filter(stored => { const effect = resolveEffect(stored, p.scene.tokens); return effect.type === "circle" ? circleHits(effect, effect.size * p.scene.grid.size) : pathHits(effectPolygon(effect, p.scene.grid), true); }).map(item => item.id),
        ...(allowMeasurements ? p.scene.measurements : []).filter(item => pathHits(item.points, false, 3 / view.scale)).map(item => item.id),
      ];
      const fog = (allowFog ? p.scene.fog.strokes : []).flatMap((stroke, index) =>
        (stroke.shape === "brush" ? pathHits(stroke.points, false, stroke.size / 2) : (fogRegionParts(stroke).some(part => { const points=fogPolygon({ ...stroke, shape: part.shape, points: part.points }).points; return points.some((point,i)=>segmentHits(point,points[(i+1)%points.length])); }) || corners.some(corner=>fogRegionContains(stroke,corner)))) ? [index] : []);
      const selection = g.additive ? [...new Set([...scopedSelectedIds, ...ids])] : ids;
      const fogSelection = g.additive ? [...new Set([...fogSelected, ...fog])] : fog;
      p.onMarqueeSelection?.(selection, fogSelection); setFogIndex(fogSelection.at(-1) ?? null);
      setMarquee(null); return;
    }
    if (g.kind === "fog-move" || g.kind === "fog-resize") {
      if (fogEdit) p.update(scene => { scene.fog.strokes[g.fogIndex!] = fogEdit; });
      setFogEdit(null); return;
    }
    if (g.kind === "fog-vertex" && g.stroke) {
      p.update(scene => { scene.fog.strokes[g.fogIndex!] = g.stroke!; });
      setFogEdit(null); return;
    }
    if (["effect", "resize", "rotate"].includes(g.kind) && g.effect) {
      const effect = g.effect;
      const valid = effect.type !== "custom" || effect.points.length >= 3;
      const changed = g.kind === "effect" || !g.initialEffect || JSON.stringify(effect) !== JSON.stringify(g.initialEffect);
      if (valid && changed) {
        p.update((scene) => {
          const index = scene.effects.findIndex((item) => item.id === effect.id);
          if (index >= 0) { if (!scene.effects[index].locked) scene.effects[index] = effect; }
          else scene.effects.push(effect);
        });
        p.select(effect.id);
      }
      setEffectDraft(null);
      return;
    }
    if (g.kind === "measure" && g.measure) {
      const q = e.altKey ? clamp(world(screen(e))) : snap(clamp(world(screen(e))), { ...p.scene.grid, snap: true });
      const points = [...g.measure.slice(0, -1), q];
      setMeasurement(points.filter((point, index) => index === 0 ||
        point.x !== points[index - 1].x || point.y !== points[index - 1].y));
      return;
    }
    if (g.kind === "grid") {
      const q = gridPosition(g, screen(e));
      if (q.x !== g.original!.x || q.y !== g.original!.y) {
        p.update((s) => {
          s.grid.offsetX = q.x;
          s.grid.offsetY = q.y;
        });
      }
      setGridDrag(null);
    setEffectDraft(null);
      return;
    }
    if (g.kind === "drag" && (drag || g.position)) {
      const finalPosition = clamp(tokenDragPosition(g.original!, g.start, clamp(world(screen(e))), p.scene.grid,
        p.scene.tokens.find(t => t.id === g.id)?.size, e.altKey));
      if (g.measure) setMeasurement([...g.measure.slice(0, -1), finalPosition]);
      p.update((s) => {
        const item =
          s.tokens.find((t) => t.id === g.id) ||
          s.effects.find((t) => t.id === g.id);
        if (item && !("locked" in item && item.locked)) Object.assign(item, finalPosition);
      });
      setDrag(null);
    }
    if (g.kind === "fog" && g.stroke) {
      p.update((s) => {
        s.fog.enabled = true;
        s.fog.strokes.push(g.stroke!);
      });
      setDraft(null);
    }
    if (g.kind === "empty") {
      p.select(null);
    }
  };
  const cancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (gesture.current?.kind === "measure" || gesture.current?.measure) setMeasurement([]);
    gesture.current = null;
    pinch.current = null;
    setMarquee(null);
    setFogEdit(null);
    setDraft(null);
    setDrag(null);
    setGridDrag(null);
    setEffectDraft(null);
  };
  const fogControls = (node: React.ReactNode) => p.fogControlsHost ? createPortal(node, p.fogControlsHost) : null;
  // Saved crops sit in the bar above the map (handoff 2.6); phones keep them behind the Crops button on the map.
  const cropActions = (
        <div className="crop-control-actions">
        <select aria-label="Saved map crops" style={{width:180,pointerEvents:"auto"}} value={p.scene.activeCropId??""} onChange={e=>{const id=e.target.value;const saved=p.scene.savedCrops.find(c=>c.id===id);if(saved){p.update(s=>{s.activeCropId=id;s.crop={x:saved.x,y:saved.y,width:saved.width,height:saved.height};s.cropFocus=true;});}else setCropFocus(false);}}>
          <option value="" disabled>{p.scene.crop&&!p.scene.activeCropId?"Current crop (unsaved name)":"Choose a saved crop"}</option>
          {p.scene.savedCrops.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button style={{pointerEvents:"auto"}} disabled={p.scene.savedCrops.length>=100} onClick={()=>{setNewCrop(true);setCropEditing(true);}}>New crop</button>
        {p.scene.crop&&<><button style={{pointerEvents:"auto"}} onClick={()=>{setNewCrop(false);setCropEditing(true);}}>Edit crop</button><button style={{pointerEvents:"auto"}} onClick={()=>setCropFocus(value=>!value)}>{cropFocus?"Show full map":"Focus crop"}</button><button style={{pointerEvents:"auto"}} onClick={()=>{p.update(s=>{s.cropFocus=false;s.savedCrops=s.savedCrops.filter(c=>c.id!==s.activeCropId);s.activeCropId=null;s.crop=null;});}}>Delete crop</button></>}
        </div>
  );
  const menuItem = contextMenu?.kind === "token" ? p.scene.tokens.find(item => item.id === contextMenu.id)
    : contextMenu?.kind === "effect" ? p.scene.effects.find(item => item.id === contextMenu.id)
    : contextMenu?.kind === "poi" ? p.scene.pointsOfInterest.find(item => item.id === contextMenu.id)
    : contextMenu?.kind === "measurement" ? p.scene.measurements.find(item => item.id === contextMenu.id) : undefined;
  const editMenuTarget = () => {
    if (!contextMenu) return;
    const { kind, id } = contextMenu;
    if (kind === "token") p.editToken(String(id));
    else {
      if (kind === "poi") p.selectPoi?.(String(id));
      else if (kind === "fog") { setFogIndex(Number(id)); setFogVertex(null); p.onFogSelection?.([Number(id)]); }
      else p.select(String(id));
      p.onEditElement?.(kind, id);
    }
  };
  const changeMenuTarget = (action: "visibility" | "duplicate" | "delete" | "forward" | "backward") => {
    if (!contextMenu) return;
    const { kind, id } = contextMenu;
    p.update(scene => {
      if (kind === "fog") { if (action === "delete") scene.fog.strokes.splice(Number(id), 1); return; }
      const items = kind === "token" ? scene.tokens : kind === "effect" ? scene.effects : kind === "poi" ? scene.pointsOfInterest : scene.measurements;
      const index = items.findIndex(item => item.id === id), item = items[index];
      if (!item) return;
      if (action === "visibility") item.hidden = !item.hidden;
      if (action === "delete") items.splice(index, 1);
      if (action === "forward" || action === "backward") {
        const next = Math.max(0, Math.min(items.length - 1, index + (action === "forward" ? 1 : -1)));
        [items[index], items[next]] = [items[next], items[index]];
      }
      if (action === "duplicate") {
        const copy = structuredClone(item);
        copy.id = uid();
        const offset = scene.grid.size / 2;
        if ("x" in copy) { copy.x = Math.min(scene.width, copy.x + offset); copy.y = Math.min(scene.height, copy.y + offset); }
        if (kind === "token" && "attachedToId" in copy) copy.attachedToId = null;
        if (kind === "effect" && "tokenId" in copy) {
          const resolved = resolveEffect(scene.effects[index], scene.tokens);
          const effectCopy = copy as Effect; effectCopy.tokenId = null; effectCopy.x = Math.min(scene.width, resolved.x + offset); effectCopy.y = Math.min(scene.height, resolved.y + offset);
        }
        // Each branch retains the collection's concrete element type.
        if (kind === "token") scene.tokens.push(copy as Scene["tokens"][number]);
        else if (kind === "effect") scene.effects.push(copy as Scene["effects"][number]);
        else if (kind === "poi") scene.pointsOfInterest.push(copy as Scene["pointsOfInterest"][number]);
      }
    });
    if (action === "delete") {
      if (kind === "poi") p.selectPoi?.(null);
      else if (kind === "fog") { setFogIndex(null); setFogVertex(null); p.onFogSelection?.([]); }
      else p.select(null);
    }
  };
  const menuAction = (label: string, action: () => void, options: { disabled?: boolean; icon?: ReactNode; checked?: boolean; danger?: boolean } = {}) => <button type="button" role={options.checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={options.checked} disabled={options.disabled} className={options.danger ? "danger" : undefined} onClick={() => { setContextMenu(null); action(); }}><span className="context-menu-icon" aria-hidden="true">{options.checked === undefined ? options.icon : options.checked ? <Check size={15} /> : null}</span><span>{label}</span></button>;
  return (
    <div className={"board tool-" + p.tool + (pageDrop ? " page-drop-target" : "")} ref={host} onPointerDownCapture={e => { if (hintGone !== p.scene.id && !(e.target as HTMLElement).closest?.(".board-hint")) setHintGone(p.scene.id); }}>
      <canvas
        onDoubleClick={e=>{
          if(p.player || p.gridAdjust || p.tool!=="select")return;
          const point=world(screen(e));
          const poi = allowPois ? [...p.scene.pointsOfInterest].reverse().find(item => Math.hypot(item.x-point.x,item.y-point.y)<=Math.max(18,18/view.scale)) : undefined;
          if(poi && Date.now() - lastPoiDrag.current < 400)return;
          if(poi){e.preventDefault();p.selectPoi?.(poi.id);if(poi.activation === "double" && poi.targetSceneId)p.openLinkedScene?.(poi.targetSceneId);return;}
          if(!allowTokens)return;
          if (movePlan) return;
          const token=[...p.scene.tokens].reverse().find(t=>Math.hypot(point.x-t.x,point.y-t.y)<=tokenRadius(t,p.scene.grid));
          if(token){e.preventDefault();p.editToken(token.id);}
        }}
        onDragOver={e => {
          if (p.player || !p.onPageDrop || !e.dataTransfer.types.includes(PAGE_DRAG)) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setPageDrop(true);
        }}
        onDragLeave={() => setPageDrop(false)}
        onDrop={e => {
          setPageDrop(false);
          const id = e.dataTransfer.getData(PAGE_DRAG);
          if (p.player || !p.onPageDrop || !id) return;
          e.preventDefault();
          const pos = clamp(world(screen(e)));
          const poi = [...p.scene.pointsOfInterest].reverse().find(item => Math.hypot(item.x - pos.x, item.y - pos.y) <= Math.max(18, 18 / view.scale));
          p.onPageDrop(id, pos, poi?.id ?? null);
        }}
        ref={canvas}
        data-library-token-drop={!p.player && !cropEditing && !!p.onLibraryTokenDrop ? "true" : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          if (movePlan) { e.preventDefault(); return; }
          if (gesture.current?.kind === "measure") {
            e.preventDefault();
            addWaypoint();
            return;
          }
          if (p.player || p.gridAdjust) return;
          e.preventDefault();
          const pos = world(screen(e));
          let target: Pick<MenuTarget, "kind" | "id"> | undefined;
          if (allowFog) {
            for (let i = p.scene.fog.strokes.length - 1; i >= 0; i--) {
              const stroke = p.scene.fog.strokes[i];
              if (stroke.shape === "brush" ? stroke.points.some((point, n) => segmentDistance(pos, stroke.points[Math.max(0, n - 1)], point) <= stroke.size / 2 + 5 / view.scale) : fogRegionParts(stroke).some(part => { const points = fogPolygon({ ...stroke, shape: part.shape, points: part.points }).points; return fogRegionContains(stroke, pos) || points.some((point, n) => segmentDistance(pos, point, points[(n + 1) % points.length]) <= 6 / view.scale); })) { target = { kind: "fog", id: i }; break; }
            }
          }
          const poi = allowPois ? [...p.scene.pointsOfInterest].reverse().find(item => Math.hypot(item.x - pos.x, item.y - pos.y) <= Math.max(18, 18 / view.scale)) : undefined;
          const token = allowTokens ? [...p.scene.tokens].reverse().find(item => Math.hypot(item.x - pos.x, item.y - pos.y) <= tokenRadius(item, p.scene.grid)) : undefined;
          const effect = allowEffects ? [...p.scene.effects].reverse().find(item => effectContains(resolveEffect(item, p.scene.tokens), pos, p.scene.grid)) : undefined;
          const saved = allowMeasurements ? [...p.scene.measurements].reverse().find(item => item.points.some((point, index) => index > 0 && segmentDistance(pos, item.points[index - 1], point) <= 10 / view.scale)) : undefined;
          if (poi) target = { kind: "poi", id: poi.id };
          else if (token) target = { kind: "token", id: token.id };
          else if (saved) target = { kind: "measurement", id: saved.id };
          else if (effect) target = { kind: "effect", id: effect.id };
          const z = uiZoom();
          setContextMenu(target ? { ...target, x: Math.max(8, e.clientX / z), y: Math.max(8, e.clientY / z) } : null);
        }}
        tabIndex={0}
        aria-label={`Interactive map: ${p.scene.name}. Use the token list to edit tokens and their coordinates.`}
      />
      {p.renderOverlay?.({ x: view.x, y: view.y, scale: view.scale, width: view.width, height: view.height })}
      {p.notePoiId && p.renderNote && (() => {
        const poi = p.scene.pointsOfInterest.find(item => item.id === p.notePoiId);
        return poi && (!p.player || !poi.hidden) ? p.renderNote(poi, { x: poi.x * view.scale + view.x, y: poi.y * view.scale + view.y, width: view.width, height: view.height }) : null;
      })()}
      {contextMenu && createPortal(<div ref={menuRef} className="context-menu" role="menu" aria-label={`${contextMenu.kind} actions`} onContextMenu={event => event.preventDefault()} style={{ left: contextMenu.x, top: contextMenu.y }}>
        {menuItem && "name" in menuItem && menuItem.name && <div className="context-menu-title">{menuItem.name}</div>}
        {menuAction(contextMenu.kind === "fog" ? "Edit fog region" : contextMenu.kind === "measurement" ? "Select measurement" : `Edit ${contextMenu.kind === "poi" ? "location" : contextMenu.kind}`, editMenuTarget, { icon: contextMenu.kind === "measurement" ? <MousePointer2 size={15} /> : <Pencil size={15} /> })}
        {menuItem && menuAction(menuItem.hidden ? "Show to players" : "Hide from players", () => changeMenuTarget("visibility"), { icon: menuItem.hidden ? <Eye size={15} /> : <EyeOff size={15} /> })}
        {contextMenu.kind !== "fog" && contextMenu.kind !== "measurement" && menuAction("Duplicate", () => changeMenuTarget("duplicate"), { icon: <Copy size={15} />, disabled: contextMenu.kind === "token" ? p.scene.tokens.length >= 500 : contextMenu.kind === "effect" ? p.scene.effects.length >= 300 : p.scene.pointsOfInterest.length >= 500 })}
        {contextMenu.kind === "poi" && "targetSceneId" in (menuItem ?? {}) && menuAction("Open linked map", () => { const poi = p.scene.pointsOfInterest.find(item => item.id === contextMenu.id); if (poi?.targetSceneId) p.openLinkedScene?.(poi.targetSceneId); }, { icon: <ExternalLink size={15} />, disabled: !p.scene.pointsOfInterest.find(item => item.id === contextMenu.id)?.targetSceneId })}
        {contextMenu.kind === "token" && <><hr /><div className="context-menu-label" id="context-menu-status">Status</div><div role="group" aria-labelledby="context-menu-status">{(["active", "unconscious", "dead"] as const).map(status => <span key={status}>{menuAction(status === "active" ? "Active" : status === "unconscious" ? "Unconscious" : "Dead", () => p.update(scene => { const token = scene.tokens.find(t => t.id === contextMenu.id); if(token) token.status = status; }), { checked: (p.scene.tokens.find(t => t.id === contextMenu.id)?.status ?? "active") === status })}</span>)}</div></>}
        {contextMenu.kind === "token" && <><hr />{menuAction("Bring forward", () => changeMenuTarget("forward"), { icon: <ArrowUpToLine size={15} /> })}{menuAction("Send backward", () => changeMenuTarget("backward"), { icon: <ArrowDownToLine size={15} /> })}</>}
        <hr />
        {menuAction("Delete", () => changeMenuTarget("delete"), { icon: <Trash2 size={15} />, danger: true })}
      </div>, document.body)}
      {!p.scene.mapId && !p.scene.drawing && !p.scene.pointsOfInterest.length && p.scene.tokens.length === 0 && !p.scene.effects.length && !p.scene.measurements.length && !p.scene.fog.strokes.length && ["select","pan"].includes(p.tool) && hintGone !== p.scene.id && (
        <div className="board-hint" role="note">
          <button type="button" className="board-hint-close" aria-label="Dismiss" title="Dismiss" onClick={() => setHintGone(p.scene.id)}><X size={16} /></button>
          <strong>Your next encounter starts here</strong>
          <span>Upload a map picture or start with this blank grid, then add the party and the monsters.</span>
          {(p.onUploadMap || p.onAddToken) && <span className="board-hint-actions">{p.onUploadMap && <button type="button" className="primary" onClick={() => { setHintGone(p.scene.id); p.onUploadMap?.(); }}><Upload size={15} />Upload a map</button>}{p.onAddToken && <button type="button" onClick={() => { setHintGone(p.scene.id); p.onAddToken?.(); }}><Plus size={15} />Add token</button>}</span>}
        </div>
      )}
      <div className="board-info">
        {p.player
          ? "PLAYER VIEW"
          : p.scene.grid.type === "none"
            ? "FREEFORM"
            : `${p.scene.grid.type.startsWith("hex") ? "HEX" : "SQUARE"} GRID`}
        <span>
          {p.scene.width} × {p.scene.height}
        </span>
      </div>
      {!p.player && p.cropControlsHost && createPortal(<div className="crop-bar">{cropActions}</div>, p.cropControlsHost)}
      {!p.player && <div className="crop-controls" data-open={cropMenuOpen}>
        <div className="crop-quick-actions">
          {!validMovePlan && selectedMoveToken && <button onClick={() => {
            if (!selectedMoveToken) return;
            const plan = startTokenMovePlan(p.scene.id, selectedMoveToken);
            p.onMeasureTokenMovementChange(true);
            gesture.current = null; setDrag(null); setMovePlan(plan); setMeasurement(plan.points);
          }}>Plan move</button>}
        <button className="mobile-only crop-menu-toggle" aria-expanded={cropMenuOpen} onClick={()=>setCropMenuOpen(v=>!v)}>{cropMenuOpen?"Close crops":cropFocus?"Crops (focused)":"Crops"}</button>
        </div>
        {cropActions}
      </div>}
      {cropEditing && !p.player && <MapCropEditor scene={newCrop?{...p.scene,crop:null}:p.scene} initialName={newCrop?`Area ${p.scene.savedCrops.length+1}`:p.scene.savedCrops.find(c=>c.id===p.scene.activeCropId)?.name??"Area 1"} view={view} close={()=>setCropEditing(false)} save={(crop,name)=>{p.update(s=>{const id=!newCrop&&s.savedCrops.some(c=>c.id===s.activeCropId)?s.activeCropId!:uid();const entry={...crop,id,name};const index=s.savedCrops.findIndex(c=>c.id===id);if(index>=0)s.savedCrops[index]=entry;else s.savedCrops.push(entry);s.activeCropId=id;s.crop=crop;s.cropFocus=true;});setCropEditing(false);}}/>}
      <div className="zoom-controls">
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoom(0.8)}
        >
          <Minus size={17} />
        </button>
        <span>{Math.round(view.scale * 100)}%</span>
        <input type="range" aria-label="Map zoom" title="Map zoom" min={1} max={600} step={0.1} value={view.scale * 100} onChange={e => zoom(Number(e.target.value) / 100 / view.scale)} style={{width:100}} />
        <button title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.25)}>
          <Plus size={17} />
        </button>
        <button title="Fit map" aria-label="Fit map" onClick={fit}>
          <Maximize size={17} />
        </button>
      </div>
      {!p.player && p.tool === "poi" && <div className="measure-hint">Click the map to add a location. Use Select to move a pin or open its linked map.</div>}
      {!p.player && effectDraft && (
        <div className="measure-hint" role="status" aria-live="polite">
          {effectDraft.label ? `${effectDraft.label} · ` : ""}
          {effectDraft.type === "custom" ? "Custom reach" : effectDraft.type === "circle" ? "Radius" : effectDraft.type === "square" ? "Side" : "Length"}: {Number((effectDraft.size * p.scene.grid.units).toFixed(2))} {p.scene.grid.unit}
          {effectDraft.type === "line" ? ` · Width: ${Number((effectDraft.width * p.scene.grid.units).toFixed(2))} ${p.scene.grid.unit}` : ""}
          {effectDraft.type === "cone" ? ` · ${effectDraft.angle}° cone` : ""}
        </div>
      )}
      {!p.player && !effectDraft && ["circle", "square", "line", "cone", "custom"].includes(p.tool) && (
        <div className="measure-hint">{p.tool === "custom" ? "Drag to trace a closed custom area." : "Drag to set the area. Hold Shift for precise sizing."} Select an area to move it or edit its handles.</div>
      )}
      {!p.player && allowFog && ["reveal", "cover"].includes(p.tool) && p.fogShape === "polygon" && fogControls(
        <div className="measure-hint" role="status">
          Click corners; click the first point or press Enter to finish. {polygon.length} points. {p.scene.fog.strokes.length >= 2000 ? "Region limit reached; delete a region first." : ""}
          <button disabled={polygon.length < 3 || p.scene.fog.strokes.length >= 2000} onClick={finishPolygon}>Finish region</button>
          <button disabled={!polygon.length} onClick={() => setPolygon(points => points.slice(0, -1))}>Undo point</button>
          <button disabled={!polygon.length} onClick={() => setPolygon([])}>Cancel</button>
        </div>
      )}
      {!p.player && fogEditing && fogControls(
        <div className="measure-hint">
          <button aria-pressed={fogEditMode === "resize"} onClick={() => { setFogEditMode("resize"); setFogVertex(null); }}>Resize region</button>
          <button disabled={fogIndex !== null && ["merged", "brush"].includes(p.scene.fog.strokes[fogIndex]?.shape)} aria-pressed={fogEditMode === "points"} onClick={() => { setFogEditMode("points"); setFogVertex(null); }}>Edit points</button>
          {fogIndex !== null && p.scene.fog.strokes[fogIndex]?.shape === "brush" ? "Drag square handles to resize the stroke, or drag its painted area to move. Shift-click strokes or regions to select several." : fogIndex !== null && p.scene.fog.strokes[fogIndex]?.shape === "merged" ? p.scene.fog.strokes[fogIndex]?.fillRule === "evenodd" ? "Shift-click regions to select several. Drag square handles to resize, or drag inside to move. This union preserves separate islands and holes." : "Shift-click regions to select several. Drag square handles to resize, or drag inside to move. Use Ungroup below to edit individual points." : fogEditMode === "resize" ? "Shift-click regions to select several. Click a region, then drag a square corner or edge handle to expand its borders. Drag inside to move it." : "Shift-click points to select several, then drag them together; drag white edge handles to add points. Delete removes the selected point or region."}
          <button disabled={fogIndex === null || fogVertex === null || p.scene.fog.strokes[fogIndex]?.shape === "merged" || (p.scene.fog.strokes[fogIndex] ? fogPolygon(p.scene.fog.strokes[fogIndex]).points.length : 0) - fogVertices.length < 3} onClick={() => {
            if (fogIndex === null || fogVertex === null) return;
            p.update(scene => { const copy = structuredClone(fogPolygon(scene.fog.strokes[fogIndex])); copy.points = copy.points.filter((_, index) => !fogVertices.includes(index)); scene.fog.strokes[fogIndex] = copy; }); setFogVertex(null);
          }}>Delete point</button>
          <button disabled={fogIndex === null} onClick={() => {
            if (fogIndex === null) return;
            p.update(scene => { scene.fog.strokes = scene.fog.strokes.filter((_, index) => !fogSelected.includes(index)); }); setFogIndex(null); setFogVertex(null); p.onFogSelection?.([]);
          }}>Delete region</button>
        </div>
      )}
      {!p.player && p.tool === "marquee" && <div className="measure-hint">Drag to select {p.selectionScope === "scenes" ? "tokens and effects" : p.selectionScope === "fog" ? "fog regions" : p.selectionScope === "none" ? "nothing in this panel" : p.selectionScope}. Hold Shift to add to the selection. Middle-drag to pan.</div>}
      {!p.player && !movePlan && drag && p.scene.tokens.some(token => token.id === drag.id) && (
        <div className="measure-hint">{measurement.length ? "Q or Space: add waypoint | Alt: off the grid | Escape: cancel move" : "Q: enable movement measuring | Alt: off the grid | Escape: cancel move"}</div>
      )}
      {!p.player && validMovePlan && (
        <div className="movement-planner" role="group" aria-label="Token movement planner">
          {validMovePlan && <>
            <span role="status">Tap the map to add waypoints. {validMovePlan.points.length - 1} waypoint{validMovePlan.points.length === 2 ? "" : "s"} | {Number(pathDistance(validMovePlan.points, p.scene.grid).toFixed(2))} {p.scene.grid.unit}. Drag to pan; pinch to zoom.</span>
            <button className="primary" disabled={validMovePlan.points.length < 2} onClick={commitMovePlan}>Move token</button>
            <button disabled={validMovePlan.points.length < 2} onClick={() => { const next = undoTokenMovePoint(validMovePlan); setMovePlan(next); setMeasurement(next.points); }}>Undo point</button>
            <button onClick={cancelMovePlan}>Cancel</button>
          </>}
        </div>
      )}
      {p.tool === "measure" && (
        <div className="measure-hint">
          Drag to measure. Press Q, Space, or right-click for a waypoint. On touch, tap cells to extend a path.{" "}
          <button onClick={() => setMeasurement([])}>Clear</button>
        </div>
      )}
    </div>
  );
}

