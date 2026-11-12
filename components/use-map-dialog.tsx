"use client";
import { useState } from "react";
import { Download, FileJson, X } from "lucide-react";
import { uid, type Asset, type MapDrawing, type Workspace } from "@/lib/model";
import { orderedShapes } from "@/lib/map-drawing";
import { drawMapDrawing, drawStampPiece } from "@/lib/map-style";
import { buildUvtt, exportName, roomNumbers, stampPieces } from "@/lib/map-export";
import { canvasBlob, download, uploadAsset } from "@/lib/api";
import DrawingShape, { DrawingBackground } from "./drawing-shape";

type Draft = { name: string; width: number; height: number; drawing: MapDrawing };
export type UseChoice = { fog: boolean; markers: boolean; pieces: boolean; destination: string | null };

/** The places a new scene can go: the campaign the creator was opened from, and its folders. */
function places(workspace: Workspace, start: string | null) {
  let root = start;
  for (let c = workspace.collections.find(x => x.id === start); c?.parentId; c = workspace.collections.find(x => x.id === c!.parentId)) root = c.parentId;
  const out: { id: string; name: string }[] = [];
  const walk = (id: string, path: string) => {
    const c = workspace.collections.find(x => x.id === id);
    if (!c) return;
    const name = path ? `${path} / ${c.name}` : c.name;
    out.push({ id, name });
    workspace.collections.filter(x => x.parentId === id && x.kind === "folder").forEach(x => walk(x.id, name));
  };
  if (root) walk(root, "");
  return out;
}

async function renderPng(d: Draft): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = d.width; canvas.height = d.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the map image.");
  drawMapDrawing(ctx, d.drawing, d.width, d.height);
  return canvasBlob(canvas);
}
/**
 * Pictures for stamps that become pieces: one per look, reusing a picture already in the library.
 * Returns each look's asset id and the assets that were added.
 */
export async function pieceArt(drawing: MapDrawing, gridSize: number, library: Asset[]) {
  const looks: Record<string, string> = {}, added: Asset[] = [];
  for (const piece of stampPieces(drawing, gridSize)) {
    if (looks[piece.look]) continue;
    const have = library.find(a => a.name === piece.lookName) ?? added.find(a => a.name === piece.lookName);
    if (have) { looks[piece.look] = have.id; continue; }
    const shape = drawing.shapes.find(s => s.id === piece.shapeId)!;
    const side = Math.min(1024, Math.max(32, Math.round(piece.size * gridSize * 2)));
    const canvas = document.createElement("canvas");
    canvas.width = side; canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw the stamp pictures.");
    drawStampPiece(ctx, shape, drawing, side);
    const { src } = await uploadAsset(await canvasBlob(canvas), exportName(piece.name, "png"));
    const asset: Asset = { id: uid(), kind: "image", name: piece.lookName, src, width: side, height: side };
    added.push(asset); looks[piece.look] = asset.id;
  }
  return { looks, added };
}
const base64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
  reader.onerror = () => reject(new Error("The map image could not be read."));
  reader.readAsDataURL(blob);
});

/** Use in Maptable: put the drawn map on the table set up for play, or export it. */
export default function UseMapDialog({ draft, grid, workspace, sceneName, hadPieces, destination, close, use }: {
  draft: Draft; grid: { size: number; units: number; unit: string }; workspace: Workspace;
  sceneName: string | null; hadPieces: boolean; destination: string | null; close: () => void; use: (choice: UseChoice) => void;
}) {
  const numbers = roomNumbers(draft.drawing).length, stamped = stampPieces(draft.drawing, grid.size).length;
  const options = places(workspace, destination);
  const [fog, setFog] = useState(!sceneName), [markers, setMarkers] = useState(numbers > 0), [pieces, setPieces] = useState(stamped > 0 && (!sceneName || hadPieces)), [place, setPlace] = useState(destination);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const cols = Math.round(draft.width / grid.size * 10) / 10, rows = Math.round(draft.height / grid.size * 10) / 10;
  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label); setError("");
    try { await job(); } catch (e) { setError(e instanceof Error ? e.message : "Export failed."); } finally { setBusy(""); }
  };
  return <div className="creator-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="creator-dialog creator-use" role="dialog" aria-modal="true" aria-labelledby="use-map-title" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <header><h2 id="use-map-title">Use in Maptable</h2><button className="creator-icon" aria-label="Close" onClick={close}><X size={18}/></button></header>
      <div className="creator-dialog-body single">
        <div className="creator-panel">
          <div className="creator-use-summary">
            <svg viewBox={`0 0 ${draft.width} ${draft.height}`} aria-hidden="true">
              <DrawingBackground drawing={draft.drawing} width={draft.width} height={draft.height}/>
              {orderedShapes(draft.drawing).map(s => <DrawingShape key={s.id} shape={s} drawing={draft.drawing} prefix="use"/>)}
            </svg>
            <div><strong>{draft.name}</strong><span>{cols} × {rows} squares · {Math.round(cols * grid.units)} × {Math.round(rows * grid.units)} {grid.unit}</span></div>
          </div>
          {sceneName ? <p className="creator-measure">Updates the scene “{sceneName}”. Its tokens and notes stay as they are.</p>
            : options.length > 1 && <label>Put the scene in<select value={place ?? ""} onChange={e => setPlace(e.target.value || null)}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
          <p className="creator-measure"><strong>The grid lines up:</strong> {grid.units} {grid.unit} squares of {grid.size} px, matching the drawing exactly.</p>
          <div className="creator-checks">
            <label className="creator-check"><input type="checkbox" checked={fog} onChange={e => setFog(e.target.checked)}/><span>Start with fog over the whole map<small>Reveal rooms as the party explores.{sceneName ? " This clears the fog you have already revealed." : ""}</small></span></label>
            <label className="creator-check"><input type="checkbox" checked={markers} disabled={!numbers} onChange={e => setMarkers(e.target.checked)}/><span>Numbered rooms become markers<small>{numbers ? `${numbers} room number${numbers === 1 ? "" : "s"} become GM-only markers you can add notes to.` : "Add room numbers with the Label tool (in a circle) to get markers."}</small></span></label>
            <label className="creator-check"><input type="checkbox" checked={pieces} disabled={!stamped && !hadPieces} onChange={e => setPieces(e.target.checked)}/><span>Stamps become movable pieces<small>{stamped ? `${stamped} stamp${stamped === 1 ? "" : "s"} (crates, tables, rocks…) become pieces you can drag and turn on the table, so the terrain can change mid-fight. Walls and floors stay in the map.${sceneName && hadPieces ? " Pieces you have moved stay where they are." : ""}` : hadPieces ? "Untick to take the pieces off the table." : "Add stamps from the Stamp tool to get pieces."}</small></span></label>
          </div>
          {error && <p className="creator-error" role="alert">{error}</p>}
        </div>
      </div>
      <footer>
        <button disabled={!!busy} onClick={() => run("png", async () => download(await renderPng(draft), exportName(draft.name, "png")))}><Download size={15}/> {busy === "png" ? "Exporting…" : "Export image"}</button>
        <button disabled={!!busy} title="A Universal VTT file with walls and doors, for other virtual tabletops" onClick={() => run("vtt", async () => {
          const image = await base64(await renderPng(draft));
          const json = JSON.stringify(buildUvtt(draft.drawing, draft.width, draft.height, grid.size, image));
          download(new Blob([json], { type: "application/json" }), exportName(draft.name, "dd2vtt"));
        })}><FileJson size={15}/> {busy === "vtt" ? "Exporting…" : "Export Universal VTT"}</button>
        <span className="creator-spacer"/>
        <button onClick={close}>Cancel</button>
        <button className="primary" disabled={!!busy} onClick={() => use({ fog, markers, pieces, destination: place })}>Use in Maptable</button>
      </footer>
    </div>
  </div>;
}
