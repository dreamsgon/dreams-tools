/** UVTT is JSON shared by .uvtt, .dd2vtt and .df2vtt exporters. */
export const MAX_VTT_IMPORT_BYTES = 48 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const isVttImportFilename = (name: string) => /\.(uvtt|dd2vtt|df2vtt)$/i.test(name);
type RecordValue = Record<string, unknown>;
function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid UVTT ${label}.`);
  return value as RecordValue;
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`UVTT ${label} must be between ${min} and ${max}.`);
  return value;
}
function pair(value: unknown, label: string, min: number, max: number) {
  const p = record(value, label);
  return { x: number(p.x, `${label} x`, min, max), y: number(p.y, `${label} y`, min, max) };
}

export function parseVttImport(text: string, filename = "Imported map.uvtt") {
  if (text.length > MAX_VTT_IMPORT_BYTES || new TextEncoder().encode(text).length > MAX_VTT_IMPORT_BYTES)
    throw new Error("UVTT file exceeds the 48 MB import limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new Error("Invalid UVTT JSON. Export a Universal VTT file from your map editor."); }
  const data = record(parsed, "document");
  const format = number(data.format, "format version", 0.001, 100);
  const resolution = record(data.resolution, "resolution");
  const pixelsPerGrid = number(resolution.pixels_per_grid, "pixels per grid", 20, 500);
  const mapSize = pair(resolution.map_size, "map size", Number.MIN_VALUE, 8000);
  const origin = resolution.map_origin === undefined ? { x: 0, y: 0 } : pair(resolution.map_origin, "map origin", -1000000, 1000000);
  const width = Math.round(mapSize.x * pixelsPerGrid), height = Math.round(mapSize.y * pixelsPerGrid);
  if (width < 1 || height < 1 || width > 8000 || height > 8000)
    throw new Error("UVTT map dimensions must be between 1 and 8000 pixels. Export at a lower resolution.");
  if (typeof data.image !== "string") throw new Error("UVTT must contain an embedded PNG, JPEG or WebP map image.");
  // Only embedded raster content is accepted; never fetch URLs or render SVG from imported JSON.
  const match = /^(?:data:image\/(png|jpeg|webp);base64,)?([A-Za-z0-9+/\r\n\t ]+={0,2})$/.exec(data.image.trim());
  if (!match) throw new Error("Invalid UVTT embedded base64 image.");
  const encoded = match[2].replace(/\s/g, "");
  if (encoded.length % 4 !== 0 || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
    throw new Error("UVTT image is invalid or exceeds the 20 MB image limit.");
  let binary: string;
  try { binary = atob(encoded); } catch { throw new Error("Invalid UVTT embedded base64 image."); }
  if (binary.length > MAX_IMAGE_BYTES) throw new Error("UVTT image exceeds the 20 MB image limit.");
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const png = bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) && binary.slice(12,16) === "IHDR";
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 16 && binary.slice(0,4) === "RIFF" && binary.slice(8,12) === "WEBP";
  const extension = png ? "png" : jpeg ? "jpg" : webp ? "webp" : null;
  if (!extension) throw new Error("UVTT embedded image must be PNG, JPEG or WebP.");
  const mimeType = png ? "image/png" : jpeg ? "image/jpeg" : "image/webp";
  if (match[1] && `image/${match[1]}` !== mimeType) throw new Error("UVTT image type does not match its content.");
  const counts: Record<string, number> = {};
  for (const key of ["line_of_sight", "objects_line_of_sight", "portals", "lights"]) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`Invalid UVTT ${key}: expected an array.`);
    counts[key] = Array.isArray(data[key]) ? data[key].length : 0;
  }
  const warnings = ["Imports map image and square grid only. Walls, doors, windows, lights and environment settings are not applied; fog remains manual."];
  if (format !== 0.2) warnings.push(`UVTT format ${format}: importing compatible image and grid fields.`);
  // Origins are in grid squares. A cropped image starts at origin; use the preceding grid line.
  const offset = (v: number) => { const n = ((-v * pixelsPerGrid) % pixelsPerGrid + pixelsPerGrid) % pixelsPerGrid; return n === 0 ? 0 : n - pixelsPerGrid; };
  return {
    name: filename.replace(/^.*[\\/]/, "").replace(/\.(uvtt|dd2vtt|df2vtt)$/i, "").trim().slice(0,120) || "Imported map",
    image: { bytes, mimeType, extension }, width, height,
    grid: { size: pixelsPerGrid, offsetX: offset(origin.x), offsetY: offset(origin.y) },
    metadata: { format, origin, mapSize, pixelsPerGrid, counts }, warnings,
  };
}
