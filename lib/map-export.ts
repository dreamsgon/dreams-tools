import { newToken, type MapDrawing, type PointOfInterest, type Scene, type Token } from "./model.ts";
import { orderedShapes } from "./map-drawing.ts";
import { customStampAsset, stampById } from "./map-stamps.ts";

const round = (n: number) => Math.round(n * 1000) / 1000;
import { cutOpenings, wallSegments } from "./map-creator.ts";

/**
 * Taking a drawn map to the table: lining up the scene, room numbers as markers,
 * and exporting a Universal VTT file other virtual tabletops can read.
 */
export type UseOptions = {
  fog: boolean; markers: boolean; grid: { size: number; units: number; unit: string };
  /** Stamps become pieces on the table: the picture for each stamp's `look`, as an asset id. Null leaves stamps in the map. */
  pieces?: Record<string, string> | null;
};

/** Labels drawn in a circle are room numbers. */
export function roomNumbers(d: MapDrawing) {
  return orderedShapes(d).filter(s => s.type === "label" && s.fill && s.name.trim()).map(s => ({ id: s.id, text: s.name.trim(), x: s.points[0].x, y: s.points[0].y }));
}

/** Markers made from room numbers carry this prefix, so using the map again replaces them. */
export const roomMarkerPrefix = "room-";
export function roomMarkers(d: MapDrawing): PointOfInterest[] {
  return roomNumbers(d).map(n => ({
    id: `${roomMarkerPrefix}${n.id}`.slice(0, 120), name: (/^\d+$/.test(n.text) ? `Room ${n.text}` : n.text).slice(0, 120),
    x: n.x, y: n.y, color: "#e3b341", hidden: true, folderId: null, targetSceneId: null, activation: "double",
  }));
}

/** A stamp on the drawing as a piece to move on the table: where it is, how big and how it is turned. */
export type StampPiece = { shapeId: string; name: string; look: string; lookName: string; x: number; y: number; size: number; rotation: number };

/**
 * Stamps that can become pieces. Stamps that look the same (same stamp, size, flip and ink)
 * share a `look`, so they share one picture.
 */
export function stampPieces(d: MapDrawing, gridSize: number): StampPiece[] {
  const ink = d.style?.ink ?? "#2b2b2b";
  return orderedShapes(d).flatMap(s => {
    const builtIn = s.type === "stamp" ? stampById(s.stamp) : null, uploaded = s.type === "stamp" ? customStampAsset(s.stamp) : null;
    if (!builtIn && !uploaded) return [];
    const stamp = builtIn ?? { id: s.stamp!, name: s.name.replace(/\s+\d+$/, "").trim() || "Stamp" };
    const [p, q] = s.points, w = Math.abs(q.x - p.x), h = Math.abs(q.y - p.y);
    const tenths = (n: number) => Math.round(n * 10) / 10, across = `${tenths(w / gridSize)}×${tenths(h / gridSize)}`;
    const turned = ((((s.rotation ?? 0) % 360) + 540) % 360) - 180;
    return [{
      shapeId: s.id, name: (s.name.trim() || stamp.name).slice(0, 120),
      look: `${stamp.id}|${round(w)}|${round(h)}|${s.flip ? 1 : 0}|${ink}`,
      lookName: `Map piece: ${stamp.name} ${across}${s.flip ? " flipped" : ""} ${ink}`.slice(0, 120),
      x: (p.x + q.x) / 2, y: (p.y + q.y) / 2,
      size: Math.min(20, Math.max(0.25, Math.max(w, h) / gridSize)), rotation: turned === -180 ? 180 : turned,
    }];
  });
}

/** A GM-moved piece: no ring, HP, name or turn in initiative. */
export function pieceToken(piece: StampPiece, assetId: string): Token {
  return {
    ...newToken(piece.name), id: `${piecePrefix}${piece.shapeId}`.slice(0, 120), pieceOf: piece.shapeId,
    x: piece.x, y: piece.y, size: piece.size, imageRotation: piece.rotation, assetId,
    color: "#8a8a84", borderWidth: 0, useDispositionColor: false, disposition: "neutral",
    hp: 1, maxHp: 1, showHp: false, showName: false, skipInitiative: true,
  };
}
export const piecePrefix = "piece-";

/**
 * Puts the drawing's stamps on the scene as pieces. Pieces already on the table stay where they were moved,
 * with their picture and size brought up to date; pieces whose stamp is gone are taken off. With `assets`
 * null every piece is taken off, so the stamps are drawn in the map again.
 */
export function placePieces(scene: Scene, assets: Record<string, string> | null, gridSize: number) {
  const pieces = assets && scene.drawing ? stampPieces(scene.drawing, gridSize).filter(p => assets[p.look]) : [];
  const byShape = new Map(pieces.map(p => [p.shapeId, p]));
  const kept = scene.tokens.filter(t => !t.pieceOf || byShape.has(t.pieceOf)).map(t => {
    const p = t.pieceOf ? byShape.get(t.pieceOf) : undefined;
    return p ? { ...t, assetId: assets![p.look], size: p.size } : t;
  });
  const placed = new Set(kept.flatMap(t => t.pieceOf ? [t.pieceOf] : []));
  scene.tokens = [...kept, ...pieces.filter(p => !placed.has(p.shapeId)).map(p => pieceToken(p, assets![p.look]))];
}

/** Sets a scene up for a drawn map: the grid lined up with the drawing, fog, room markers and stamps as pieces. */
export function setUpDrawnMapScene(scene: Scene, options: UseOptions) {
  Object.assign(scene.grid, { type: "square", size: options.grid.size, offsetX: 0, offsetY: 0, units: options.grid.units, unit: options.grid.unit });
  if (options.fog) scene.fog = { enabled: true, base: true, strokes: [] };
  if (options.markers && scene.drawing) {
    const kept = (scene.pointsOfInterest ?? []).filter(p => !p.id.startsWith(roomMarkerPrefix));
    scene.pointsOfInterest = [...kept, ...roomMarkers(scene.drawing)].slice(0, 500);
  }
  if (options.pieces !== undefined) placePieces(scene, options.pieces, options.grid.size);
}

/**
 * A Universal VTT document (.dd2vtt): the map image, its grid, walls for line of sight,
 * and doors and windows as portals. Positions are in grid squares.
 */
export function buildUvtt(d: MapDrawing, width: number, height: number, gridSize: number, imageBase64: string) {
  const at = (p: { x: number; y: number }) => ({ x: round(p.x / gridSize), y: round(p.y / gridSize) });
  const shapes = orderedShapes(d);
  const walls = cutOpenings(wallSegments(shapes), shapes);
  const portals = shapes.filter(s => s.type === "door" || s.type === "window").map(s => {
    const [a, b] = s.points;
    return { position: at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), bounds: [at(a), at(b)], rotation: round(Math.atan2(b.y - a.y, b.x - a.x)), closed: s.type === "door", freestanding: false };
  });
  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: round(width / gridSize), y: round(height / gridSize) }, pixels_per_grid: gridSize },
    line_of_sight: walls.map(w => [at(w.a), at(w.b)]),
    objects_line_of_sight: [],
    portals,
    environment: { baked_lighting: false, ambient_light: "ffffffff" },
    lights: [],
    image: imageBase64,
  };
}

/** A file name from a map name: letters, digits and dashes. */
export function exportName(name: string, extension: string) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/^-+|-+$/g, "") || "map";
  return `${base}.${extension}`;
}
