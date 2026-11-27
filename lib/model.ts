import { z } from "zod";
export const uid = () => crypto.randomUUID();
const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const short = z.string().max(120);
/** Tokens one scene can hold (lib/token-clipboard.ts and the board use it too). */
export const MAX_SCENE_TOKENS = 2000;
const point = z.object({ x: finite, y: finite });
export const assetSchema = z.object({
  kind: z.enum(["image", "border", "stamp"]).optional(),
  // A map stamp you uploaded: how many grid squares it covers when placed.
  squares: z.object({ w: z.number().int().min(1).max(10), h: z.number().int().min(1).max(10) }).optional(),
  id: short,
  name: short,
  src: z
    .string()
    .max(4096)
    .refine((v) => /^https:\/\//.test(v) || /^\/api\/(assets|s3)\?/.test(v)),
  width: finite.min(1).max(16000),
  height: finite.min(1).max(16000),
});
export const conditionSchema = z.object({
  id: short,
  name: z.string().min(1).max(40),
  color,
  icon: z.string().max(16),
  assetId: short.nullable().optional(),
});
export const tokenSchema = z.object({
  encyclopediaEntryId: short.optional(),
  sourceLibraryId: short.optional(),
  initiativeGroup: z.string().max(80).optional(),
  skipInitiative: z.boolean().optional(),
  conditionRounds: z.record(short, finite.int().min(1)).optional(),
  notes: z.string().max(20000).optional(),
  initiative: finite.min(-1000000).max(1000000).nullable().optional(),
  ac: finite.int().min(0).max(1000000).nullable().optional(),
  dc: finite.int().min(0).max(1000000).nullable().optional(),
  passivePerception: finite.int().min(0).max(1000000).nullable().optional(),
  tempHp: finite.int().min(0).max(1000000).nullable().optional(),
  showAc: z.boolean().optional(),
  showDc: z.boolean().optional(),
  showPassivePerception: z.boolean().optional(),
  showTempHp: z.boolean().optional(),
  discordHpDisplay: z.enum(["default", "exact", "health", "hidden"]).optional(),
  showDiscordConditions: z.boolean().optional(),
  partyMarker: z.boolean().optional(),
  status: z.enum(["active", "unconscious", "dead"]).optional(),
  zeroHpStatus: z.enum(["off", "unconscious", "dead"]).optional(),
  nameVisibility: z.enum(["inherit", "show", "hide"]).optional(),
  hpVisibility: z.enum(["inherit", "show", "hide"]).optional(),
  disposition: z.enum(["enemy", "party", "ally", "neutral"]).optional(),
  useDispositionColor: z.boolean().optional(),
  /** Fill, ring and letters follow the token's side (party/ally/neutral/enemy). Unset: only the old default fill does. False: never. */
  sideColours: z.boolean().optional(),
  rosterRole: z.enum(["library","npc","party"]).default("library"),
  id: short,
  name: short,
  x: finite,
  y: finite,
  elevation: finite.min(-100000).max(100000).default(0),
  /** Walking speed in the scene's units; the drag ruler colours squares within it, a dash (twice it) and beyond. */
  speed: finite.min(0).max(100000).optional(),
  attachedToId: short.nullable().default(null),
  /** Tokens sharing a group id are selected and moved together (Ctrl G). */
  groupId: short.optional(),
  size: finite.min(0.25).max(20),
  color,
  textColor: color.optional(),
  borderColor: color.optional(),
  borderWidth: finite.min(0).max(50).optional(),
  borderAssetId: short.nullable().optional(),
  imageZoom: finite.min(0.25).max(5).optional(),
  imageOffsetX: finite.min(-1).max(1).optional(),
  imageOffsetY: finite.min(-1).max(1).optional(),
  imageRotation: finite.min(-180).max(180).optional(),
  /** Which way the token faces, in degrees clockwise from up. Turns the art and shows a notch on the ring. */
  facing: finite.min(-360).max(360).optional(),
  /** Mirrored left to right, or top to bottom. */
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  assetId: short.nullable(),
  hp: finite.min(0).max(1000000),
  maxHp: finite.min(1).max(1000000),
  showName: z.boolean(),
  namePosition: z.enum(["bottom", "top", "side", "wrap"]).optional(),
  nameScale: finite.min(0.5).max(3).optional(),
  hpPosition: z.enum(["bottom", "top", "side", "wrap"]).optional(),
  hpBarWidth: finite.min(0.25).max(2).optional(),
  hpBarHeight: finite.min(2).max(40).optional(),
  nameSpacing: finite.min(0).max(60).optional(),
  hpSpacing: finite.min(0).max(60).optional(),
  nameHpSpacing: finite.min(0).max(60).optional(),
  hpBarColor: color.nullable().optional(),
  showHp: z.boolean(),
  hidden: z.boolean(),
  conditions: z.array(short).max(30),
  // A piece of the map (a stamp from the Map Creator): drawn as its picture, with no ring, HP or name.
  // While it is on the scene, the stamp it came from is not drawn in the map.
  pieceOf: short.optional(),
});
export const gridSchema = z.object({
  type: z.enum(["square", "hex-flat", "hex-pointy", "none"]),
  size: finite.min(20).max(500),
  offsetX: finite.min(-500).max(500),
  offsetY: finite.min(-500).max(500),
  color,
  opacity: finite.min(0).max(1),
  labels: z.boolean(),
  labelMode: z.enum(["cells", "perimeter"]).default("cells"),
  labelTheme: z.enum(["light", "dark"]).default("light"),
  snap: z.boolean(),
  units: finite.min(0.01).max(10000).default(5),
  unit: z.string().max(16).default("ft"),
  diagonal: z.enum(["equal", "alternating", "euclidean"]),
});
export const effectSchema = z.object({
  locked: z.boolean().optional(),
  kind: z.enum(["area", "object", "label"]).optional(),
  fillOpacity: finite.min(0).max(1).optional(),
  strokeWidth: finite.min(0).max(20).optional(),
  strokeStyle: z.enum(["solid", "dashed"]).optional(),
  labelSize: finite.min(8).max(120).optional(),
  labelColor: color.optional(),
  showLabel: z.boolean().optional(),
  labelOffsetX: finite.min(-2000).max(2000).optional(),
  labelOffsetY: finite.min(-2000).max(2000).optional(),
  id: short,
  type: z.enum(["circle", "square", "line", "cone", "custom"]),
  x: finite,
  y: finite,
  size: finite.min(0.25).max(200),
  color,
  label: short,
  persistent: z.boolean().default(false),
  tokenId: short.nullable().default(null),
  /** A token's aura: how far it reaches past the token's edge, in squares. Its size follows the token's size (see lib/effects.ts, auraSize). */
  reach: finite.min(0).max(200).optional(),
  hidden: z.boolean().default(false),
  rotation: finite.default(0),
  width: finite.min(0.05).max(200).default(1),
  angle: finite.min(1).max(180).default(90),
  // Custom vertices are pixel offsets from the effect origin, before rotation.
  points: z.array(point).max(200).default([]),
});
export const effectPresetSchema = effectSchema.omit({ x: true, y: true, tokenId: true }).extend({ name: z.string().trim().min(1).max(120) });
export type EffectPreset = z.infer<typeof effectPresetSchema>;
export const fogStrokeSchema = z.object({
  mode: z.enum(["reveal", "cover"]),
  shape: z.enum(["brush", "rect", "polygon", "merged"]),
  size: finite.min(5).max(2000),
  points: z.array(point).min(1).max(10000),
  fillRule: z.literal("evenodd").optional(),
  parts: z.array(z.object({shape:z.enum(["rect","polygon"]),start:z.number().int().min(0),count:z.number().int().min(2)})).min(1).max(2000).optional(),
}).refine(s => !s.fillRule || s.shape === "merged" && !!s.parts?.length && s.parts.every(p => p.shape === "polygon"), "Union contours must be polygons")
  .refine(s => s.shape !== "polygon" || s.points.length >= 3, "Fog polygons need at least three points")
  .refine(s => s.shape !== "rect" || s.points.length >= 2, "Fog rectangles need two points")
  .refine(s => s.shape !== "merged" || !!s.parts?.length && s.parts.every(p=>p.start+p.count<=s.points.length && (p.shape!=="polygon" || p.count>=3)), "Invalid merged fog region");
/** How a light shines: its kind, bright and dim reach in squares, colour, and whether it is lit, flickers and stops at walls. Every field is optional, so a stamp can change just one. */
export const mapLightSchema = z.object({
  kind: z.enum(["torch", "brazier", "candles", "lantern", "magic", "crystal", "fire", "plain"]).optional(),
  bright: finite.min(0).max(60).optional(),
  dim: finite.min(0).max(120).optional(),
  colour: color.optional(),
  on: z.boolean().optional(),
  flicker: z.boolean().optional(),
  walls: z.boolean().optional(),
});
export const mapShapeSchema = z.object({
  id: short,
  name: short.default(""),
  folderId: short.nullable().default(null),
  smooth: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  // An opening is a stretch of wall erased in the Map Creator: a gap drawn over the wall, with no door.
  // A light is a point that lights the map around it (points: its centre, twice); see lib/map-light.ts.
  type: z.enum(["rect", "ellipse", "line", "curve", "path", "merged", "door", "window", "opening", "stamp", "label", "light"]),
  roomParts: z.array(z.object({type:z.enum(["rect","ellipse","path"]),start:z.number().int().min(0),count:z.number().int().min(2),smooth:z.boolean(),closed:z.boolean()})).max(1000).default([]),
  points: z.array(point).min(2).max(2000),
  fill: color.nullable(),
  stroke: color,
  thickness: finite.min(1).max(100),
  closed: z.boolean(),
  // A stamp is a picture from the stamp library, drawn in its box (points), turned and flipped.
  stamp: short.nullable().default(null),
  rotation: finite.min(-360).max(360).default(0),
  flip: z.boolean().default(false),
  // A built-in stamp can be recoloured with a tint (stampTints in lib/map-stamps.ts).
  tint: z.enum(["oak", "stone", "iron", "gold", "moss", "crimson", "frost"]).nullable().optional(),
  // A light's settings, or changes to the light a stamp gives (lib/map-light.ts). Reach is in squares.
  light: mapLightSchema.nullable().optional(),
  // Light and sight pass through this shape's outline: a road, a river, a pool or a field, not a wall.
  seeThrough: z.boolean().optional(),
  // A room number's entry in the room key: the room's name and a GM note. It becomes the GM marker's name and notes in Maptable.
  key: z.object({ name: z.string().max(80), note: z.string().max(1000) }).nullable().optional(),
  // A room's floor pattern, drawn over the floor in the style's ink (lib/map-style.ts). Absent is plain.
  pattern: z.enum(["flag", "boards", "tiles", "cobbles", "earth"]).nullable().optional(),
  // A door's kind. Absent is wood. An arch is an open doorway, and a secret door looks like wall.
  door: z.enum(["wood", "iron", "arch", "secret"]).nullable().optional(),
}).refine((s) => s.type !== "curve" || s.points.length === 3, "Curves need three control points")
  .refine(s=>s.type!=="merged"||(s.roomParts.length>0&&s.roomParts.every(p=>p.start+p.count<=s.points.length)),"Invalid merged room outlines");
/** How a drawn map looks as a whole: chosen from a preset, then fine-tuned. */
export const mapStyleSchema = z.object({
  preset: short.default("custom"),
  floor: color,
  wall: color,
  hatch: color,
  ink: color,
  walls: z.enum(["solid", "double", "rough"]).default("solid"),
  outside: z.enum(["hatched", "solid", "clear"]).default("solid"),
  grid: z.enum(["on", "faint", "off"]).default("off"),
  gridSize: finite.min(10).max(400).default(70),
  shadow: z.boolean().default(false),
});
/**
 * A generated hex map under a drawing's shapes (lib/hexmap): its grid, two letters per hex
 * (biome, then terrain; ".." outside the outline), rivers as lists of hexes, and the options it was made with.
 */
export const hexLayerSchema = z.object({
  x: finite.min(-8000).max(8000).default(0),
  y: finite.min(-8000).max(8000).default(0),
  size: finite.min(20).max(500),
  cols: z.number().int().min(4).max(100),
  rows: z.number().int().min(4).max(80),
  orient: z.enum(["flat", "pointy"]),
  outline: z.enum(["rect", "hex", "circle"]).default("rect"),
  miles: finite.min(0.1).max(1000).default(6),
  cells: z.string().max(16000).regex(/^([a-l][dslbfwhmpx]|\.\.)*$/),
  rivers: z.array(z.array(z.number().int().min(0).max(7999)).min(2).max(400)).max(40).default([]),
  options: z.record(z.string().max(40), z.union([z.string().max(80), finite, z.boolean()])).refine(o => Object.keys(o).length <= 80, "Too many hex map options").default({}),
  // How it is drawn. Maps saved before these existed keep the painted look with outlines.
  look: z.enum(["painted", "flat", "atlas", "ink"]).default("painted"),
  lines: z.boolean().default(true),
  numbers: z.boolean().default(false),
  legend: z.enum(["none", "nw", "ne", "sw", "se"]).default("none"),
  labels: z.boolean().default(true),
  // Settlements, ruins and lairs by hex (ruins and lairs are GM-only), and roads as lists of hexes.
  places: z.array(z.object({ i: z.number().int().min(0).max(7999), kind: z.enum(["city", "town", "village", "ruin", "tower", "cave", "shrine", "lair"]), name: z.string().trim().min(1).max(60) })).max(40).default([]),
  roads: z.array(z.array(z.number().int().min(0).max(7999)).min(2).max(400)).max(40).default([]),
  // Hexes painted by hand in the Map Creator, which Regenerate keeps.
  painted: z.array(z.number().int().min(0).max(7999)).max(8000).default([]),
}).refine(h => h.cells.length === h.cols * h.rows * 2, "Hex cells must match the hex map's size")
  .refine(h => h.rivers.every(r => r.every(i => i < h.cols * h.rows)), "Rivers must stay on the hex map")
  .refine(h => h.roads.every(r => r.every(i => i < h.cols * h.rows)) && h.places.every(p => p.i < h.cols * h.rows), "Roads and places must stay on the hex map")
  .refine(h => h.painted.every(i => i < h.cols * h.rows), "Painted hexes must be on the hex map");
export type HexLayerData = z.infer<typeof hexLayerSchema>;
export const mapDrawingSchema = z.object({
  background: color,
  // What players see where no light reaches: daylight (lights only glow), dim or dark (lib/map-light.ts). Old maps are in daylight.
  ambient: z.enum(["day", "dim", "dark"]).optional(),
  hexes: hexLayerSchema.optional(),
  style: mapStyleSchema.nullable().default(null),
  shapes: z.array(mapShapeSchema).max(1000),
  folders: z.array(z.object({id:short,name:short,parentId:short.nullable(),hidden:z.boolean().default(false),locked:z.boolean().default(false)})).max(200).default([]),
  layerOrder: z.array(short).max(1200).default([]),
}).superRefine((d,ctx)=>{
  const ids=new Set([...d.shapes,...d.folders].map(s=>s.id));
  if(ids.size!==d.shapes.length+d.folders.length)ctx.addIssue({code:"custom",message:"Duplicate layer IDs"});
  for(const item of [...d.folders.map(f=>({id:f.id,parent:f.parentId})),...d.shapes.map(s=>({id:s.id,parent:s.folderId}))]){
    const seen=new Set([item.id]);let parent=item.parent;
    while(parent){const folder=d.folders.find(f=>f.id===parent);if(!folder||seen.has(parent)){ctx.addIssue({code:"custom",message:"Invalid layer folder"});break;}seen.add(parent);parent=folder.parentId;}
  }
});
export type MapShape = z.infer<typeof mapShapeSchema>;
export type MapDrawing = z.infer<typeof mapDrawingSchema>;
export type MapStyle = z.infer<typeof mapStyleSchema>;
export const pointOfInterestSchema = z.object({
  folderId: short.nullable().default(null),
  id: short,
  name: z.string().trim().min(1).max(120),
  x: finite,
  y: finite,
  color,
  hidden: z.boolean().default(false),
  targetSceneId: short.nullable().default(null),
  activation: z.enum(["double", "single"]).default("double"),
  notes: z.string().max(2000).optional(),
  /** Map notes: text to read to the players, and Encyclopedia pages linked to the marker. */
  readAloud: z.string().max(4000).optional(),
  pages: z.array(short).max(20).optional(),
  /** Players can open this note (its read-aloud text and the pages they can already read). */
  playersSee: z.boolean().optional(),
});
export type PointOfInterest = z.infer<typeof pointOfInterestSchema>;
/** Map notes: an area of the map (a box or an outline) that opens a section of an Encyclopedia page. */
export const mapAreaSchema = z.object({
  id: short,
  points: z.array(point).min(2).max(400),
  pageId: short,
  /** The heading of the section it opens; empty for the whole page. */
  section: z.string().max(200).default(""),
  /** Players can click it and read the section, if they can already read the page. */
  playersSee: z.boolean().optional(),
});
export type MapArea = z.infer<typeof mapAreaSchema>;
export const sceneSchema = z.object({
  initiativeLiveDiscord: z.boolean().optional(),
  initiativeState: z.object({round: finite.int().min(1), currentId: z.string().max(160).nullable(), order: z.array(z.string().max(160)).max(MAX_SCENE_TOKENS)}).optional(),
  id: short,
  name: z.string().min(1).max(120),
  folder: short,
  containerId: short.nullable().default(null),
  mapType: z.enum(["encounter", "world", "area"]).default("encounter"),
  crop: z.object({x:finite.min(0),y:finite.min(0),width:finite.min(1),height:finite.min(1)}).nullable().default(null),
  savedCrops: z.array(z.object({id:short,name:z.string().trim().min(1).max(120),x:finite.min(0),y:finite.min(0),width:finite.min(1),height:finite.min(1)})).max(100).default([]),
  activeCropId: short.nullable().default(null),
  cropFocus: z.boolean().optional(),
  pointsOfInterest: z.array(pointOfInterestSchema).max(500).default([]),
  areas: z.array(mapAreaSchema).max(200).optional(),
  poiFolders: z.array(z.object({id:short,name:z.string().trim().min(1).max(120),parentId:short.nullable().default(null)})).max(500).default([]),
  width: finite.min(1).max(8000),
  height: finite.min(1).max(8000),
  background: color.default("#e3e6d8"),
  mapId: short.nullable(),
  drawing: mapDrawingSchema.nullable().default(null),
  grid: gridSchema,
  tokens: z.array(tokenSchema).max(MAX_SCENE_TOKENS),
  effects: z.array(effectSchema).max(300),
  measurements: z.array(z.object({
    id: short, label: short, points: z.array(point).min(2).max(200),
    color, hidden: z.boolean().default(true),
  })).max(100).default([]),
  fog: z.object({
    enabled: z.boolean(),
    base: z.boolean(),
    strokes: z.array(fogStrokeSchema).max(2000),
    /** On a hex grid: clear the hexes around party tokens as they move, this many hexes out (0 is their own hex). */
    around: z.number().int().min(0).max(3).optional(),
  }),
});
export const collectionSchema = z.object({
  tokenDefaults: z.object({
    partyZeroHp: z.enum(["off", "unconscious", "dead"]),
    npcZeroHp: z.enum(["off", "unconscious", "dead"]),
    nameScale: finite.min(0.5).max(3).optional(),
    hpBarWidth: finite.min(0.25).max(2).optional(),
    hpBarHeight: finite.min(2).max(40).optional(),
  nameSpacing: finite.min(0).max(60).optional(),
  hpSpacing: finite.min(0).max(60).optional(),
  nameHpSpacing: finite.min(0).max(60).optional(),
    hpBarColor: color.nullable().optional(),
    /** Campaign override of each side's fill; the ring is derived from it. */
    sideColours: z.object({ party: color.optional(), ally: color.optional(), neutral: color.optional(), enemy: color.optional() }).optional(),
    namePosition: z.enum(["bottom", "top", "side", "wrap"]).optional(),
    hpPosition: z.enum(["bottom", "top", "side", "wrap"]).optional(),
    showName: z.boolean(),
    showHp: z.boolean(),
  }).optional(),
  pinned: z.boolean().optional(),
  /** A Maptable-only campaign's own web address, /campaigns/<slug> (lib/campaign-slug.ts). */
  slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  id: short,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["folder", "campaign"]),
  parentId: short.nullable(),
});
const tokenFolderSchema = collectionSchema.extend({ kind: z.literal("folder"), campaignId: short.nullable() });
export type TokenFolder = z.infer<typeof tokenFolderSchema>;
type TokenFolderWorkspace = {
  tokenFolders?: TokenFolder[]; tokenFolderLocations?: Record<string, string | null>;
  assetFolders: Collection[]; libraryLocations: Record<string, string | null>;
  libraryCampaigns: Record<string, string | null>; tokenLibrary: { id: string }[];
};
/** Separate legacy token folders from asset folders, cloning mixed-campaign paths. */
export function migrateTokenFolders(w: TokenFolderWorkspace) {
  if (w.tokenFolders !== undefined) return { tokenFolders: w.tokenFolders, tokenFolderLocations: w.tokenFolderLocations ?? {} };
  const tokenFolders: TokenFolder[] = [], tokenFolderLocations: Record<string, string | null> = {};
  const copies = new Map<string, string>();
  const copy = (id: string | null, campaignId: string | null, seen = new Set<string>()): string | null => {
    if (!id || seen.has(id)) return null;
    const source = w.assetFolders.find(folder => folder.id === id);
    if (!source) return null;
    const key = JSON.stringify([campaignId, id]);
    if (copies.has(key)) return copies.get(key)!;
    const nextSeen = new Set(seen); nextSeen.add(id);
    const parentId = copy(source.parentId, campaignId, nextSeen), nextId = `legacy-token-folder-${copies.size}`;
    copies.set(key, nextId); tokenFolders.push({ ...source, id: nextId, parentId, kind: "folder", campaignId });
    return nextId;
  };
  for (const token of w.tokenLibrary) tokenFolderLocations[token.id] = copy(w.libraryLocations[token.id] ?? null, w.libraryCampaigns[token.id] ?? null);
  return { tokenFolders, tokenFolderLocations };
}
/** A map moved out of the live workspace into its own file (lib/scene-archive.ts): enough to list it and bring it back. */
export const archivedSceneSchema = z.object({
  id: short,
  name: z.string().max(120),
  mapType: z.enum(["encounter", "world", "area"]),
  /** The folder or campaign it was in; a folder deleted since means it comes back outside any folder. */
  containerId: short.nullable(),
  at: z.string().max(40),
  bytes: z.number().int().min(0),
  tokens: z.number().int().min(0),
});
export type ArchivedScene = z.infer<typeof archivedSceneSchema>;
export const workspaceSchema = z.object({
  version: z.literal(1),
  scenes: z.array(sceneSchema).min(1),
  assets: z.array(assetSchema),
  tokenLibrary: z.array(tokenSchema),
  conditions: z.array(conditionSchema),
  effectPresets: z.array(effectPresetSchema).max(2000).default([]),
  effectPresetFolders: z.array(collectionSchema.extend({kind:z.literal("folder")})).max(2000).default([]),
  presetLocations: z.record(z.string(), short.nullable()).default({}),
  activeId: short,
  collections: z.array(collectionSchema).max(2000).default([]),
  assetCampaigns: z.record(z.string(), short.nullable()).default({}),
  libraryCampaigns: z.record(z.string(), short.nullable()).default({}),
  assetFolders: z.array(collectionSchema.extend({kind:z.literal("folder")})).max(2000).default([]),
  assetLocations: z.record(z.string(), short.nullable()).default({}),
  libraryLocations: z.record(z.string(), short.nullable()).default({}),
  tokenFolders: z.array(tokenFolderSchema).max(10000).optional(),
  tokenFolderLocations: z.record(z.string(), short.nullable()).optional(),
  conditionFolders: z.array(collectionSchema.extend({kind:z.literal("folder")})).max(2000).default([]),
  conditionLocations: z.record(z.string(), short.nullable()).default({}),
  /** Set once the Campaigns page folders have been re-ordered by hand; until then that page lists them by name. */
  campaignFoldersOrdered: z.boolean().optional(),
  /** Archived maps: not loaded with the workspace, each kept in its own file until it is brought back. */
  archivedScenes: z.array(archivedSceneSchema).max(10000).optional(),
}).transform((w) => {
  // Upgrade legacy text folders once, preserving their contents.
  for (const s of w.scenes) {
    if (!s.containerId && s.folder.trim()) {
      let folder = w.collections.find((f) => f.parentId === null && f.kind === "folder" && f.name === s.folder.trim());
      if (!folder) {
        folder = { id: uid(), name: s.folder.trim(), kind: "folder", parentId: null };
        w.collections.push(folder);
      }
      s.containerId = folder.id;
    }
    s.folder = "";
  }
  return { ...w, ...migrateTokenFolders(w) };
}).superRefine((w, ctx) => {
  const presetFolderIds = new Set(w.effectPresetFolders.map(f=>f.id));
  if(presetFolderIds.size!==w.effectPresetFolders.length || w.effectPresetFolders.some(f=>!canMoveCollection(w.effectPresetFolders,f.id,f.parentId)))
    ctx.addIssue({code:"custom",message:"Invalid preset folder hierarchy"});
  if(Object.values(w.presetLocations).some(id=>id!==null&&!presetFolderIds.has(id)))
    ctx.addIssue({code:"custom",message:"Preset folder does not exist"});
  if(new Set(w.effectPresets.map(p=>p.id)).size!==w.effectPresets.length)
    ctx.addIssue({code:"custom",message:"Duplicate effect preset IDs"});
  const conditionFolderIds = new Set(w.conditionFolders.map(f=>f.id));
  if(conditionFolderIds.size!==w.conditionFolders.length || w.conditionFolders.some(f=>!canMoveCollection(w.conditionFolders,f.id,f.parentId)))
    ctx.addIssue({code:"custom",message:"Invalid condition folder hierarchy"});
  if(Object.values(w.conditionLocations).some(id=>id!==null&&!conditionFolderIds.has(id)))
    ctx.addIssue({code:"custom",message:"Condition folder does not exist"});
  const folderIds = new Set(w.assetFolders.map(f=>f.id));
  if(folderIds.size!==w.assetFolders.length || w.assetFolders.some(f=>!canMoveCollection(w.assetFolders,f.id,f.parentId)))
    ctx.addIssue({code:"custom",message:"Invalid asset folder hierarchy"});
  if([...Object.values(w.assetLocations),...Object.values(w.libraryLocations)].some(id=>id!==null&&!folderIds.has(id)))
    ctx.addIssue({code:"custom",message:"Asset folder does not exist"});
  const tokenFolderIds = new Set(w.tokenFolders.map(folder => folder.id));
  if (tokenFolderIds.size !== w.tokenFolders.length || w.tokenFolders.some(folder =>
    !canMoveCollection(w.tokenFolders, folder.id, folder.parentId) ||
    (folder.parentId !== null && w.tokenFolders.find(parent => parent.id === folder.parentId)?.campaignId !== folder.campaignId)))
    ctx.addIssue({ code: "custom", message: "Invalid token folder hierarchy" });
  if (Object.values(w.tokenFolderLocations).some(id => id !== null && !tokenFolderIds.has(id)))
    ctx.addIssue({ code: "custom", message: "Token folder does not exist" });
  if (w.tokenLibrary.some(token => {
    const folder = w.tokenFolders.find(folder => folder.id === w.tokenFolderLocations[token.id]);
    return folder && folder.campaignId !== (w.libraryCampaigns[token.id] ?? null);
  })) ctx.addIssue({ code: "custom", message: "Token folder belongs to another campaign" });
  const ids = new Set(w.collections.map((c) => c.id));
  if (ids.size !== w.collections.length) ctx.addIssue({code: "custom", message: "Duplicate folder or campaign IDs"});
  for (const c of w.collections) {
    const seen = new Set([c.id]);
    let parent = c.parentId;
    while (parent !== null) {
      if (!ids.has(parent) || seen.has(parent)) {
        ctx.addIssue({code: "custom", message: "Invalid folder hierarchy"});
        break;
      }
      seen.add(parent);
      parent = w.collections.find((f) => f.id === parent)!.parentId;
    }
  }
  if (w.scenes.some((s) => s.containerId !== null && !ids.has(s.containerId)))
    ctx.addIssue({code: "custom", message: "Scene folder does not exist"});
  for (const campaign of [...Object.values(w.assetCampaigns), ...Object.values(w.libraryCampaigns), ...w.tokenFolders.map(folder => folder.campaignId)]) {
    if (campaign !== null && !w.collections.some((c) => c.id === campaign && c.kind === "campaign"))
      ctx.addIssue({code: "custom", message: "Asset campaign does not exist"});
  }
});
export type Collection = z.infer<typeof collectionSchema>;
export function collectionPath(collections: Collection[], id: string | null): string {
  const parts: string[] = [], seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const item = collections.find((c) => c.id === id);
    if (!item) break;
    parts.unshift(item.name);
    id = item.parentId;
  }
  return parts.join(" / ") || "All campaigns & scenes";
}
export function canMoveCollection(collections: Collection[], id: string, parentId: string | null) {
  const seen = new Set<string>([id]);
  while (parentId) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = collections.find((c) => c.id === parentId);
    if (!parent) return false;
    parentId = parent.parentId;
  }
  return true;
}
export type Point = z.infer<typeof point>;
export type Asset = z.infer<typeof assetSchema>;
export function isTokenBorder(w: Workspace, id: string) {
  const kind=w.assets.find(a=>a.id===id)?.kind;
  if(kind)return kind==="border";
  return w.tokenLibrary.some(t=>t.borderAssetId===id) ||
    w.scenes.some(s=>s.tokens.some(t=>t.borderAssetId===id));
}
export type Condition = z.infer<typeof conditionSchema>;
export type Token = z.infer<typeof tokenSchema>;
export type Grid = z.infer<typeof gridSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type FogStroke = z.infer<typeof fogStrokeSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export function tokenFoldersForCampaign(w: Workspace, campaignId: string | null) {
  const sharedUsed = new Set<string>();
  for (const token of w.tokenLibrary) if (!(w.libraryCampaigns[token.id] ?? null)) {
    let id = w.tokenFolderLocations[token.id];
    while (id && !sharedUsed.has(id)) { sharedUsed.add(id); id = w.tokenFolders.find(folder => folder.id === id)?.parentId ?? null; }
  }
  return w.tokenFolders.filter(folder => folder.campaignId === campaignId || (folder.campaignId === null && sharedUsed.has(folder.id)));
}
export function createTokenFolder(w: Workspace, campaignId: string | null, name: string) {
  if (!name.trim() || w.tokenFolders.length >= 10000) return;
  const folder: TokenFolder = { id: uid(), name: name.trim().slice(0, 120), kind: "folder", parentId: null, campaignId };
  w.tokenFolders.push(folder); return folder;
}
export function moveTokenToFolder(w: Workspace, tokenId: string, folderId: string | null) {
  if (!w.tokenLibrary.some(token => token.id === tokenId)) return false;
  const folder = folderId === null ? null : w.tokenFolders.find(folder => folder.id === folderId);
  if (folderId !== null && !folder) return false;
  if (folder && folder.campaignId !== (w.libraryCampaigns[tokenId] ?? null)) moveLibraryTokenToCampaign(w, tokenId, folder.campaignId);
  w.tokenFolderLocations[tokenId] = folderId; return true;
}
function syncTokenFolderCampaign(w: Workspace, tokenId: string, campaignId: string | null) {
  const sourceId = w.tokenFolderLocations[tokenId];
  if (!sourceId || w.tokenFolders.find(folder => folder.id === sourceId)?.campaignId === campaignId) return;
  const copyPath = (id: string | null): string | null => {
    const source = w.tokenFolders.find(folder => folder.id === id);
    if (!source) return null;
    const parentId = copyPath(source.parentId);
    const existing = w.tokenFolders.find(folder => folder.campaignId === campaignId && folder.parentId === parentId && folder.name === source.name);
    if (existing) return existing.id;
    const copy = { ...source, id: uid(), parentId, campaignId }; w.tokenFolders.push(copy); return copy.id;
  };
  w.tokenFolderLocations[tokenId] = copyPath(sourceId);
}
export function moveAssetToCampaign(w: Workspace, assetId: string, campaignId: string | null) {
  w.assetCampaigns[assetId] = campaignId;
  for (const token of w.tokenLibrary) if (token.assetId === assetId && token.rosterRole === "library") { w.libraryCampaigns[token.id] = campaignId; syncTokenFolderCampaign(w, token.id, campaignId); }
}
export function moveLibraryTokenToCampaign(w: Workspace, tokenId: string, campaignId: string | null) {
  const token = w.tokenLibrary.find((t) => t.id === tokenId);
  if (!token) return;
  w.libraryCampaigns[token.id] = campaignId;
  syncTokenFolderCampaign(w, token.id, campaignId);
  if (token.assetId && token.rosterRole === "library") moveAssetToCampaign(w, token.assetId, campaignId);
}
export type Tool =
  "select" | "marquee" | "pan" | "measure" | "reveal" | "cover" | "circle" | "square" | "line" | "cone" | "custom" | "poi";
/** Fit within a pixel budget without stretching narrow maps or upscaling. */
export function fitImageDimensions(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
/** Visible offset-grid indices, including partial hexes at all four edges. */
export function hexGridBounds(width: number, height: number, g: Grid) {
  const dx = g.size * (g.type === 'hex-flat' ? 1.5 : Math.sqrt(3));
  const dy = g.size * (g.type === 'hex-flat' ? Math.sqrt(3) : 1.5);
  return {
    minCol: Math.floor((-g.offsetX - g.size) / dx) - 2,
    maxCol: Math.ceil((width - g.offsetX - g.size) / dx) + 2,
    minRow: Math.floor((-g.offsetY - g.size) / dy) - 2,
    maxRow: Math.ceil((height - g.offsetY - g.size) / dy) + 2,
  };
}
export function newScene(name = "Untitled scene"): Scene {
  return {
    id: uid(),
    name,
    folder: "",
    containerId: null,
    mapType: "encounter",
    crop: null,
    savedCrops: [],
    activeCropId: null,
    pointsOfInterest: [],
    poiFolders: [],
    width: 1400,
    height: 1000,
    background: "#e3e6d8",
    mapId: null,
    drawing: null,
    grid: {
      type: "square",
      size: 70,
      offsetX: 0,
      offsetY: 0,
      color: "#58675e",
      opacity: 0.3,
      labels: true,
      labelMode: "perimeter",
      labelTheme: "light",
      snap: true,
      units: 5,
      unit: "ft",
      diagonal: "equal",
    },
    tokens: [],
    effects: [],
    measurements: [],
    fog: { enabled: false, base: true, strokes: [] },
  };
}
export function newToken(name = "New token"): Token {
  return {
    rosterRole: "library",
    useDispositionColor: true,
    id: uid(),
    name,
    x: 350,
    y: 350,
    elevation: 0,
    attachedToId: null,
    size: 1,
    color: "#388565",
    assetId: null,
    hp: 10,
    maxHp: 10,
    showName: true,
    showHp: true,
    hidden: false,
    conditions: [],
  };
}
/** The name of the scene a new Maptable starts with (the workspace always holds at least one scene). */
export const STARTER_SCENE_NAME = "First encounter";
const stableJson = (value: unknown) => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);
/**
 * True for the scene a new Maptable starts with, still untouched: its name, outside every campaign, no map, drawing,
 * tokens or anything else changed. It isn't counted as a map not in a campaign, and goes once there is another scene.
 */
export function isStarterScene(scene: Scene) {
  if (scene.name !== STARTER_SCENE_NAME || scene.containerId) return false;
  const fresh = sceneSchema.safeParse({ ...newScene(STARTER_SCENE_NAME), id: scene.id }), mine = sceneSchema.safeParse(scene);
  return fresh.success && mine.success && stableJson(fresh.data) === stableJson(mine.data);
}
/** Drops the untouched starter scene once the workspace has another one. */
export function withoutStarterScene<W extends { scenes: Scene[]; activeId: string }>(w: W): W {
  if (w.scenes.length < 2) return w;
  const scenes = w.scenes.filter(s => !isStarterScene(s));
  if (!scenes.length || scenes.length === w.scenes.length) return w;
  return { ...w, scenes, activeId: scenes.some(s => s.id === w.activeId) ? w.activeId : scenes[0].id };
}
export function initialWorkspace(): Workspace {
  const scene = newScene(STARTER_SCENE_NAME);
  return {
    version: 1,
    collections: [],
    assetCampaigns: {},
    libraryCampaigns: {},
    assetFolders: [],
    assetLocations: {},
    libraryLocations: {},
    tokenFolders: [],
    tokenFolderLocations: {},
    effectPresets: [],
    effectPresetFolders: [],
    presetLocations: {},
    conditionFolders: [],
    conditionLocations: {},
    scenes: [scene],
    activeId: scene.id,
    assets: [],
    tokenLibrary: [],
    conditions: [
      { id: "marked", name: "Marked", color: "#a57030", icon: "!" },
      { id: "injured", name: "Injured", color: "#bd5350", icon: "+" },
      { id: "hidden", name: "Hidden", color: "#6075ad", icon: "?" },
    ],
  };
}
export function columnName(n: number) {
  let text = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26))
    text = String.fromCharCode(65 + ((n - 1) % 26)) + text;
  return text;
}
export function hexCell(p: Point, g: Grid) {
  const x = (p.x - g.offsetX - g.size) / g.size,
    y = (p.y - g.offsetY - g.size) / g.size;
  const q =
    g.type === "hex-flat" ? (2 * x) / 3 : (Math.sqrt(3) * x) / 3 - y / 3;
  const r =
    g.type === "hex-flat" ? -x / 3 + (Math.sqrt(3) * y) / 3 : (2 * y) / 3;
  let rx = Math.round(q),
    rz = Math.round(r),
    ry = Math.round(-q - r);
  const dx = Math.abs(rx - q),
    dz = Math.abs(rz - r),
    dy = Math.abs(ry + q + r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}
export function hexCenter(q: number, r: number, g: Grid): Point {
  return g.type === "hex-flat"
    ? {
        x: g.offsetX + g.size + g.size * 1.5 * q,
        y: g.offsetY + g.size + g.size * Math.sqrt(3) * (r + q / 2),
      }
    : {
        x: g.offsetX + g.size + g.size * Math.sqrt(3) * (q + r / 2),
        y: g.offsetY + g.size + g.size * 1.5 * r,
      };
}
export function snap(p: Point, g: Grid, tokenSize = 1): Point {
  if (!g.snap || g.type === "none") return p;
  if (g.type.startsWith("hex")) {
    const c = hexCell(p, g);
    return hexCenter(c.q, c.r, g);
  }
  // Align the footprint's top-left corner; small tokens stay centered in a cell.
  const half = Math.max(1, tokenSize) / 2;
  return {
    x: (Math.round((p.x - g.offsetX) / g.size - half) + half) * g.size + g.offsetX,
    y: (Math.round((p.y - g.offsetY) / g.size - half) + half) * g.size + g.offsetY,
  };
}
/** Where a new token goes: the free cell nearest `center` inside the map, so tokens added one after another don't pile up on one square. */
export function freeSpotNear(center: Point, tokens: readonly Point[], g: Grid, bounds: { width: number; height: number }, tokenSize = 1): Point {
  const step = g.type === "none" || !(g.size > 0) ? 70 : g.size;
  const taken = (p: Point) => tokens.some(t => Math.hypot(t.x - p.x, t.y - p.y) < step * 0.5);
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= bounds.width && p.y <= bounds.height;
  for (let ring = 0; ring <= 12; ring++) {
    const cells: Point[] = [];
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cells.push({ x: dx, y: dy });
    cells.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    for (const c of cells) {
      const p = snap({ x: center.x + c.x * step, y: center.y + c.y * step }, g, tokenSize);
      if (inside(p) && !taken(p)) return p;
    }
  }
  return snap(center, g, tokenSize);
}
export function address(p: Point, g: Grid) {
  if (g.type === "none") return "";
  let col: number, row: number;
  if (g.type.startsWith("hex")) {
    const c = hexCell(p, g);
    if (g.type === "hex-flat") {
      col = c.q;
      row = c.r + Math.floor(c.q / 2);
    } else {
      row = c.r;
      col = c.q + Math.floor(c.r / 2);
    }
  } else {
    col = Math.floor((p.x - g.offsetX) / g.size);
    row = Math.floor((p.y - g.offsetY) / g.size);
  }
  return col >= 0 && row >= 0 ? `${columnName(col)}${row + 1}` : "";
}
export function distance(a: Point, b: Point, g: Grid) {
  if (g.type.startsWith("hex")) {
    const ac = hexCell(a, g),
      bc = hexCell(b, g);
    return (
      Math.max(
        Math.abs(ac.q - bc.q),
        Math.abs(ac.r - bc.r),
        Math.abs(ac.q + ac.r - bc.q - bc.r),
      ) * g.units
    );
  }
  const dx = Math.abs(b.x - a.x) / g.size,
    dy = Math.abs(b.y - a.y) / g.size;
  if (g.diagonal === "euclidean" || g.type === "none")
    return Math.hypot(dx, dy) * g.units;
  return (
    (Math.max(dx, dy) +
      (g.diagonal === "alternating" ? Math.floor(Math.min(dx, dy) / 2) : 0)) *
    g.units
  );
}
export function tokenRadius(t: Token, g: Grid) {
  return t.size * g.size * (g.type.startsWith("hex") ? 0.76 : 0.43);
}
export function pathDistance(points: Point[], g: Grid) {
  if (g.type === "square" && g.diagonal === "alternating") {
    let straight = 0,
      diagonal = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = Math.abs(points[i].x - points[i - 1].x) / g.size,
        dy = Math.abs(points[i].y - points[i - 1].y) / g.size;
      straight += Math.max(dx, dy);
      diagonal += Math.min(dx, dy);
    }
    return (straight + Math.floor(diagonal / 2)) * g.units;
  }
  return points
    .slice(1)
    .reduce((total, p, i) => total + distance(points[i], p, g), 0);
}

/** Bounds include the external top and left coordinate strips, when enabled. */
export type MapCrop = {x:number;y:number;width:number;height:number};
export function mapCrop(s:Scene):MapCrop|null {
  if(!s.crop)return null;const x=Math.min(s.width-1,Math.max(0,s.crop.x)),y=Math.min(s.height-1,Math.max(0,s.crop.y));
  return {x,y,width:Math.min(s.width-x,s.crop.width),height:Math.min(s.height-y,s.crop.height)};
}
export function sceneRenderBounds(s: Scene, crop?:MapCrop|null) {
  const margin = s.grid.labels && s.grid.labelMode === "perimeter" && s.grid.type === "square" ? 32 : 0;
  const r=crop??{x:0,y:0,width:s.width,height:s.height};
  return {x:r.x-margin,y:r.y-margin,width:r.width+margin,height:r.height+margin};
}
/** Labels use the same absolute grid indices as cell addresses, including offset grids. */
export function perimeterLabels(s: Scene, crop?:MapCrop|null) {
  const g = s.grid;
  const columns: { position: number; label: string }[] = [], rows: { position: number; label: string }[] = [];
  if (g.type !== "square") return { columns, rows };
  const axis = (extent: number, offset: number, column: boolean, minimum=0) => {
    const labels: { position: number; label: string }[] = [];
    for (let index = Math.max(0, Math.floor((minimum-offset) / g.size)); offset + index * g.size < extent; index++) {
      const start = Math.max(minimum, offset + index * g.size), end = Math.min(extent, offset + (index + 1) * g.size);
      if (end > start) labels.push({ position: (start + end) / 2, label: column ? columnName(index) : String(index + 1) });
    }
    return labels;
  };
  const r=crop??{x:0,y:0,width:s.width,height:s.height};
  return { columns: axis(r.x+r.width, g.offsetX, true,r.x), rows: axis(r.y+r.height, g.offsetY, false,r.y) };
}

