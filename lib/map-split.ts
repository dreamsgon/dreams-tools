import { newScene, uid, type Asset, type Scene } from "./model";

export type SplitDirection = "north" | "east" | "south" | "west";
export type SplitNeighbor = { direction: SplitDirection; index: number; id: string; label: string };
export type SplitTile = {
  id: string; index: number; row: number; col: number; label: string;
  x: number; y: number; width: number; height: number;
  neighbors: SplitNeighbor[];
};

/** Integer core boundaries cover the source exactly; overlap extends both adjoining crops. */
export function planMapSplit(width: number, height: number, cols: number, rows: number, overlap: number): SplitTile[] {
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 32000) || width * height > 256_000_000)
    throw new Error("Source maps must be at most 32,000 pixels per side and 256 million pixels total.");
  if (![cols, rows].every(n => Number.isInteger(n) && n >= 1 && n <= 10) || cols * rows > 36)
    throw new Error("Choose 1–10 rows and columns, with at most 36 sections.");
  if (cols > width || rows > height) throw new Error("Each section must contain at least one source pixel.");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap > 500) throw new Error("Overlap must be 0–500 whole pixels.");
  const label = (col: number, row: number) => `${String.fromCharCode(65 + col)}${row + 1}`;
  const tiles: SplitTile[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = Math.max(0, Math.floor(col * width / cols) - overlap);
    const y = Math.max(0, Math.floor(row * height / rows) - overlap);
    const right = Math.min(width, Math.floor((col + 1) * width / cols) + overlap);
    const bottom = Math.min(height, Math.floor((row + 1) * height / rows) + overlap);
    if (right - x > 8000 || bottom - y > 8000) throw new Error("Each section including overlap must be at most 8,000 pixels per side. Add rows or columns, or reduce overlap.");
    const neighbors: SplitNeighbor[] = [];
    for (const [direction, dc, dr] of [["north", 0, -1], ["east", 1, 0], ["south", 0, 1], ["west", -1, 0]] as const) {
      const c = col + dc, r = row + dr;
      if (c >= 0 && c < cols && r >= 0 && r < rows) neighbors.push({ direction, index: r * cols + c, id: label(c, r), label: label(c, r) });
    }
    tiles.push({ id: label(col, row), index: tiles.length, row, col, label: label(col, row), x, y, width: right - x, height: bottom - y, neighbors });
  }
  return tiles;
}

/** Uploaded crop assets must be in the same order as the split plan. */
export function createSplitScenes(name: string, tiles: SplitTile[], assets: Asset[], containerId: string | null, gridSize = 70): Scene[] {
  if (tiles.length !== assets.length || !tiles.length) throw new Error("Every section needs an uploaded map asset.");
  if (!Number.isFinite(gridSize) || gridSize < 20 || gridSize > 500) throw new Error("Grid size must be 20–500 pixels.");
  const scenes = tiles.map((tile, index) => {
    const asset = assets[index];
    if (asset.width !== tile.width || asset.height !== tile.height) throw new Error(`Map asset dimensions do not match section ${tile.label}.`);
    const scene = newScene(`${name.trim() || "Map"} · ${tile.label}`.slice(0, 120));
    scene.containerId = containerId;
    scene.mapType = "area";
    scene.width = tile.width;
    scene.height = tile.height;
    scene.mapId = asset.id;
    scene.grid.size = gridSize;
    scene.grid.offsetX = -(tile.x % gridSize) || 0;
    scene.grid.offsetY = -(tile.y % gridSize) || 0;
    return scene;
  });
  tiles.forEach((tile, index) => {
    const insetX = Math.min(gridSize, tile.width / 4), insetY = Math.min(gridSize, tile.height / 4);
    scenes[index].pointsOfInterest = tile.neighbors.map(neighbor => ({
      folderId: null, id: uid(), name: `${neighbor.direction[0].toUpperCase()}${neighbor.direction.slice(1)} → ${neighbor.label}`,
      x: neighbor.direction === "west" ? insetX : neighbor.direction === "east" ? tile.width - insetX : tile.width / 2,
      y: neighbor.direction === "north" ? insetY : neighbor.direction === "south" ? tile.height - insetY : tile.height / 2,
      color: "#388565", hidden: false, activation: "single" as const,
      targetSceneId: scenes[neighbor.index].id,
      notes: `Linked section ${neighbor.label} of ${name.trim() || "Map"}.`,
    }));
  });
  return scenes;
}
