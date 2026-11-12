"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./dialogs";
import { canvasBlob, uploadAsset } from "@/lib/api";
import { uid, type Asset, type Scene } from "@/lib/model";
import { planMapSplit, createSplitScenes } from "@/lib/map-split";

export default function MapSplitDialog({ close, onImport, containerId }: {
  close: () => void;
  onImport: (assets: Asset[], scenes: Scene[]) => void | Promise<void>;
  containerId: string | null;
}) {
  const [source, setSource] = useState<{ image: HTMLImageElement; url: string; width: number; height: number } | null>(null);
  const [name, setName] = useState(""), [columns, setColumns] = useState(1), [rows, setRows] = useState(1);
  const [overlap, setOverlap] = useState(100), [gridSize, setGridSize] = useState(70);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState("");
  const uploads = useRef(new Map<string, Asset>());
  const sourceUrl = useRef<string | null>(null);
  useEffect(() => () => { if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); }, []);
  const plan = useMemo(() => {
    if (!source) return { tiles: [], error: "" };
    try {
      if (!Number.isInteger(gridSize) || gridSize < 20 || gridSize > 500) throw new Error("Pixels per cell must be a whole number from 20 to 500.");
      return { tiles: planMapSplit(source.width, source.height, columns, rows, overlap), error: "" };
    } catch (err) { return { tiles: [], error: err instanceof Error ? err.message : "Check the split settings." }; }
  }, [source, columns, rows, overlap, gridSize]);
  const choose = async (file: File) => {
    setBusy(true); setError(""); setProgress("Reading map…");
    let url: string | null = null;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, or WebP image.");
      if (file.size > 80 * 1024 * 1024) throw new Error("The source image must be 80 MB or smaller.");
      url = URL.createObjectURL(file);
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("This image could not be decoded. Try exporting it as PNG, JPG, or WebP.")); image.src = url!; });
      const width = image.naturalWidth, height = image.naturalHeight;
      if (!width || !height || width > 32000 || height > 32000 || width * height > 256000000) throw new Error("Choose an image no larger than 32,000 pixels on either side and 256 million pixels in total.");
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = url;
      setSource({ image, url, width, height }); url = null;
      uploads.current.clear(); setName(file.name.replace(/\.[^.]+$/, "").slice(0, 80));
      setColumns(Math.ceil(width / 4096)); setRows(Math.ceil(height / 4096));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to read this image."); }
    finally { if (url) URL.revokeObjectURL(url); setBusy(false); setProgress(""); }
  };
  const importTiles = async () => {
    if (!source || !plan.tiles.length || plan.error || !name.trim() || busy) return;
    setBusy(true); setError("");
    const canvas = document.createElement("canvas");
    try {
      const assets: Asset[] = [];
      for (const [index, tile] of plan.tiles.entries()) {
        setProgress(`Preparing and uploading tile ${index + 1} of ${plan.tiles.length}…`);
        const key = `${tile.x},${tile.y},${tile.width},${tile.height}`;
        let asset = uploads.current.get(key);
        const tileName = `${name.trim().slice(0, 80)} — ${tile.label}`;
        if (!asset) {
          if (tile.width > 8000 || tile.height > 8000) throw new Error("Each tile must be at most 8,000 pixels per side. Increase columns or rows, or reduce overlap.");
          canvas.width = tile.width; canvas.height = tile.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("The browser could not allocate a tile canvas. Try more columns or rows.");
          ctx.drawImage(source.image, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
          const blob = await canvasBlob(canvas, "image/webp", .96);
          if (blob.size > 20 * 1024 * 1024) throw new Error(`Tile ${index + 1} exceeds the 20 MB upload limit. Increase columns or rows to make smaller tiles, then retry.`);
          const result = await uploadAsset(blob, `${tileName}.${blob.type === "image/webp" ? "webp" : "png"}`);
          asset = { id: uid(), name: tileName, src: result.src, width: tile.width, height: tile.height };
          uploads.current.set(key, asset);
        }
        assets.push({ ...asset, name: tileName });
      }
      setProgress("Creating linked scenes…");
      await onImport(assets, createSplitScenes(name.trim(), plan.tiles, assets, containerId, gridSize));
      close();
    } catch (err) { setError(err instanceof Error ? err.message : "Split import failed. Try smaller tiles."); }
    finally { canvas.width = 0; canvas.height = 0; setBusy(false); setProgress(""); }
  };
  return <Modal title="Split a large map into linked scenes" close={() => { if (!busy) close(); }} wide>
    <div className="map-split-dialog">
      <p>Crop a large map into full-resolution tiles. Every tile becomes a scene with links to its neighboring tiles. The map is not resized.</p>
      {!containerId && <p role="alert">Choose a campaign destination before importing so the scenes can link to one another.</p>}
      <label>Source map (PNG, JPG, WebP · up to 80 MB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void choose(file); }}/></label>
      {source && <>
        <p className="muted">Source: {source.width.toLocaleString()} × {source.height.toLocaleString()} pixels</p>
        <label>Map name<input maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)}/></label>
        <div className="form-row">
          <label>Columns<input type="number" min={1} max={10} step={1} value={columns} disabled={busy} onChange={e => setColumns(Number(e.target.value))}/></label>
          <label>Rows<input type="number" min={1} max={10} step={1} value={rows} disabled={busy} onChange={e => setRows(Number(e.target.value))}/></label>
          <label>Overlap (pixels)<input type="number" min={0} max={500} step={1} value={overlap} disabled={busy} onChange={e => setOverlap(Number(e.target.value))}/></label>
          <label>Pixels per grid cell<input type="number" min={20} max={500} step={1} value={gridSize} disabled={busy} onChange={e => setGridSize(Number(e.target.value))}/></label>
        </div>
        <p className="muted">Up to 36 tiles; each tile must fit within 8,000 × 8,000 pixels. Overlap repeats edge pixels to make transitions easier.</p>
        <svg role="img" aria-label="Numbered tile preview, ordered left to right then top to bottom" viewBox={`0 0 ${source.width} ${source.height}`} style={{ display: "block", width: "100%", maxHeight: "calc(42vh / var(--ui-zoom, 1))", background: "#171717" }}>
          <image href={source.url} width={source.width} height={source.height}/>
          {plan.tiles.map((tile, index) => <g key={index}>
            <rect x={tile.x} y={tile.y} width={tile.width} height={tile.height} fill="none" stroke="#fbbf24" strokeWidth={3} vectorEffect="non-scaling-stroke"/>
            <text x={tile.x + tile.width / 2} y={tile.y + tile.height / 2} fill="white" stroke="black" strokeWidth={Math.max(source.width, source.height) / 450} paintOrder="stroke" textAnchor="middle" dominantBaseline="central" fontSize={Math.max(source.width, source.height) / 35} fontWeight="bold">{index + 1} · {tile.label}</text>
          </g>)}
        </svg>
        <p className="muted">↑ North · → East · ↓ South · ← West. Numbered scenes link in both directions to each adjacent tile.</p>
        {plan.tiles.length > 0 && <p>{plan.tiles.length} linked scenes · largest tile {Math.max(...plan.tiles.map(t => t.width))} × {Math.max(...plan.tiles.map(t => t.height))} pixels</p>}
      </>}
      {(error || plan.error) && <p role="alert">{error || plan.error}</p>}
      {busy && <p role="status" aria-live="polite">{progress}</p>}
      {error && uploads.current.size > 0 && <p className="muted">Completed tile uploads are kept for retry while this dialog stays open.</p>}
      <div className="button-row"><button disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={busy || !containerId || !source || !name.trim() || !!plan.error || !plan.tiles.length} onClick={() => void importTiles()}>{busy ? "Importing…" : `Create ${plan.tiles.length || "linked"} scenes`}</button></div>
    </div>
  </Modal>;
}
