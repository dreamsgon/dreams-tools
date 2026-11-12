"use client";

import { drawingStampAssets } from "@/lib/map-stamps";
import {stageTransfer} from "@/lib/transfer-client";

import AgentAccess from "./agent-access";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {

  X,

  Upload,

  Link,

  Cloud,

  Download,

  Send,

  ImagePlus,

} from "lucide-react";

import { api, loadImage, canvasBlob, uploadAsset, download } from "@/lib/api";

import { uid, fitImageDimensions, sceneRenderBounds, mapCrop, type Asset, type Workspace, type Scene } from "@/lib/model";

import { renderScene, type Images } from "@/lib/render";

import type { View } from "./board";

import { parseVttImport, isVttImportFilename, MAX_VTT_IMPORT_BYTES } from "@/lib/vtt-import";



export type MapImportSettings = {

  width: number;

  height: number;

  grid: { size: number; offsetX: number; offsetY: number };

};



export function Modal({

  title,

  children,

  close,

  wide = false,

}: {

  title: string;

  children: ReactNode;

  close: () => void;

  wide?: boolean;

}) {

  const panel = useRef<HTMLDivElement>(null),

    closeRef = useRef(close);

  closeRef.current = close;

  useEffect(() => {

    const previous = document.activeElement as HTMLElement;

    panel.current?.focus();

    const key = (e: KeyboardEvent) => {

      if (e.key === "Escape") {

        e.stopPropagation();

        closeRef.current();

      }

      if (e.key === "Tab") {

        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>(

          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',

        ) ?? []).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);

        if (!elements?.length) return;

        const first = elements[0],

          last = elements[elements.length - 1];

        if (

          e.shiftKey &&

          (document.activeElement === first ||

            document.activeElement === panel.current)

        ) {

          e.preventDefault();

          last.focus();

        } else if (!e.shiftKey && document.activeElement === last) {

          e.preventDefault();

          first.focus();

        }

      }

    };

    document.addEventListener("keydown", key);

    return () => {

      document.removeEventListener("keydown", key);

      previous?.focus();

    };

  }, []);

  return (

    <div

      className="modal-backdrop"

      onMouseDown={(e) => {

        if (e.target === e.currentTarget) close();

      }}

    >

      <div

        ref={panel}

        tabIndex={-1}

        role="dialog"

        aria-modal="true"

        aria-label={title}

        className={"modal " + (wide ? "wide" : "")}

      >

        <div className="modal-header">

          <h2>{title}</h2>

          <button aria-label="Close dialog" onClick={close}>

            <X size={20} />

          </button>

        </div>

        {children}

      </div>

    </div>

  );

}

export function Field({

  label,

  children,

  hint,

}: {

  label: string;

  children: ReactNode;

  hint?: string;

}) {

  return (

    <label className="field">

      <span>{label}</span>

      {children}

      {hint && <small>{hint}</small>}

    </label>

  );

}

export function Toggle({

  label,

  checked,

  onChange,

}: {

  label: string;

  checked: boolean;

  onChange: (v: boolean) => void;

}) {

  return (

    <label className="toggle">

      <span>{label}</span>

      <input

        type="checkbox"

        checked={checked}

        onChange={(e) => onChange(e.target.checked)}

      />

    </label>

  );

}

export function NumberField({

  label,

  value,

  onChange,

  min = 0,

  max = 1000000,

  step = 1,

}: {

  label: string;

  value: number;

  onChange: (v: number) => void;

  min?: number;

  max?: number;

  step?: number;

}) {

  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  return (

    <Field label={label}>

      <input

        type="number"

        aria-label={label}

        value={draft}

        min={min}

        max={max}

        step={step}

        onChange={(e) => setDraft(e.target.value)}

        onBlur={() => {

          const number = Number(draft);

          const next =

            draft.trim() && Number.isFinite(number)

              ? Math.min(max, Math.max(min, number))

              : value;

          setDraft(String(next));

          if (next !== value) onChange(next);

        }}

        onKeyDown={(e) => {

          if (e.key === "Enter") e.currentTarget.blur();

        }}

      />

    </Field>

  );

}



export function ImportDialog({

  kind,

  close,

  onImport,

  s3,

  title,

  submitLabel,

}: {

  kind: "map" | "token";

  close: () => void;

  onImport: (asset: Asset, name: string, color: string, settings?: MapImportSettings) => void;

  s3: boolean;

  title?: string;

  submitLabel?: string;

}) {

  const [mode, setMode] = useState<"upload" | "url" | "s3">("upload"),

    [name, setName] = useState(""),

    [url, setUrl] = useState(""),

    [img, setImg] = useState<HTMLImageElement | null>(null),

    [source, setSource] = useState(""),

    [error, setError] = useState(""),

    [busy, setBusy] = useState(false),

    [storage, setStorage] = useState("hosted");

  const [largeMap,setLargeMap]=useState(false);

  const [zoom, setZoom] = useState(1),

    [cx, setCx] = useState(50),

    [cy, setCy] = useState(50),

    [color, setColor] = useState("#388565");

  const preview = useRef<HTMLCanvasElement>(null);

  const mapPreview = useRef<HTMLCanvasElement>(null);

  const input = useRef<HTMLInputElement>(null);

  const [vtt, setVtt] = useState<ReturnType<typeof parseVttImport> | null>(null);

  const prepare = async (src: string, fileName?: string) => {

    setVtt(null);

    setBusy(true);

    setError("");

    setImg(null);

    setSource("");

    try {

      const image = await loadImage(src);

      if (image.width > 16000 || image.height > 16000)

        throw new Error(

          "Please resize this image to 16,000 pixels or less per side first.",

        );

      setImg(image);

      setSource(src.startsWith("blob:") ? "" : src);

      setZoom(1);

      setCx(50);

      setCy(50);

      if (fileName) setName(fileName.replace(/\.[^.]+$/, ""));

    } catch (e) {

      setError((e as Error).message + (src.startsWith('https://') ? ' External hosts must allow CORS image access.' : ''));

    } finally {

      setBusy(false);

    }

  };

  const file = async (f?: File) => {

    if (!f || busy) return;

    setImg(null);

    setSource("");

    setVtt(null);

    setError("");

    if (kind === "map" && isVttImportFilename(f.name)) {

      setBusy(true);

      let previewUrl = "";

      try {

        if (f.size > MAX_VTT_IMPORT_BYTES) throw new Error("Choose a Universal VTT export smaller than 48 MiB.");

        const imported = parseVttImport(await f.text(), f.name);

        const blob = new Blob([new Uint8Array(imported.image.bytes)], { type: imported.image.mimeType });

        previewUrl = URL.createObjectURL(blob);

        const image = await loadImage(previewUrl);

        if (image.width !== imported.width || image.height !== imported.height)

          throw new Error("The embedded image dimensions do not match the exported map dimensions. Export the map again with matching image and grid settings.");

        if (image.width > 16000 || image.height > 16000)

          throw new Error("Export this map at 16,000 pixels or less per side. The image will not be resized because that would change its grid alignment.");

        setImg(image);

        setName(imported.name);

        setVtt(imported);

      } catch (e) {

        setError((e as Error).message);

      } finally {

        if (previewUrl) URL.revokeObjectURL(previewUrl);

        setBusy(false);

      }

      return;

    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {

      setError(kind === "map" ? "Choose a PNG, JPG, WebP, .uvtt, .dd2vtt, or .df2vtt export. Native project files are unsupported." : "Choose a PNG, JPG, or WebP image.");

      return;

    }

    if (f.size > 20 * 1024 * 1024) {

      setError("Choose an image smaller than 20 MB.");

      return;

    }

    const src = URL.createObjectURL(f);

    await prepare(src, f.name);

    URL.revokeObjectURL(src);

  };

  const crop = (canvas: HTMLCanvasElement) => {

    const c = canvas.getContext("2d")!,

      size = canvas.width;

    c.clearRect(0, 0, size, size);

    if (!img) return;

    const edge = Math.min(img.width, img.height) / zoom,

      x = ((img.width - edge) * cx) / 100,

      y = ((img.height - edge) * cy) / 100;

    c.save();

    c.beginPath();

    c.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);

    c.clip();

    c.drawImage(img, x, y, edge, edge, 0, 0, size, size);

    c.restore();

    c.beginPath();

    c.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);

    c.strokeStyle = color;

    c.lineWidth = 10;

    c.stroke();

  };

  useEffect(() => {

    if (preview.current) crop(preview.current);

  }, [img, zoom, cx, cy, color]);

  useEffect(() => {

    if (!img || !mapPreview.current) return;

    const canvas = mapPreview.current;

    const size = fitImageDimensions(img.width, img.height, 800);

    canvas.width = size.width;

    canvas.height = size.height;

    canvas.getContext('2d')!.drawImage(img, 0, 0, size.width, size.height);

  }, [img]);

  const submit = async () => {

    if (!img) return;

    setBusy(true);

    setError("");

    try {

      let src = source,

        width = img.width,

        height = img.height;

      if (kind === "token") {

        const canvas = document.createElement("canvas");

        canvas.width = canvas.height = 512;

        crop(canvas);

        src = (

          await uploadAsset(

            await canvasBlob(canvas),

            `${name || "token"}.png`,

            storage,

          )

        ).src;

        width = height = 512;

      } else if (vtt) {

        src = (await uploadAsset(

          new Blob([new Uint8Array(vtt.image.bytes)], { type: vtt.image.mimeType }),

          `${name || "map"}.${vtt.image.extension}`,

          storage,

        )).src;

      } else if (!source) {

        const canvas = document.createElement("canvas");

        const size = fitImageDimensions(img.width, img.height, largeMap ? 8000 : 4096);

        canvas.width = size.width;

        canvas.height = size.height;

        canvas

          .getContext("2d")!

          .drawImage(img, 0, 0, canvas.width, canvas.height);

        src = (

          await uploadAsset(

            await canvasBlob(canvas, "image/webp", 0.94),

            `${name || "map"}.webp`,

            storage,

          )

        ).src;

        width = canvas.width;

        height = canvas.height;

      }

      onImport(

        {

          id: uid(),

          name: (name || "Untitled " + kind).slice(0, 120),

          src,

          width,

          height,

        },

        (name || "New " + kind).slice(0, 120),

        color,

        vtt ? { width: vtt.width, height: vtt.height, grid: vtt.grid } : undefined,

      );

      close();

    } catch (e) {

      setError((e as Error).message);

    } finally {

      setBusy(false);

    }

  };

  return (

    <Modal

      title={title ?? (kind === "map" ? "Import a map" : "Make a token")}

      close={close}

    >

      <div className="segmented">

        {(

          [

            ["upload", Upload, "Upload"],

            ["url", Link, "Image URL"],

            ["s3", Cloud, "S3 object"],

          ] as const

        ).map(([key, Icon, label]) => (

          <button

            key={key}

            disabled={busy}

            className={mode === key ? "active" : ""}

            onClick={() => {

              setMode(key);

              setImg(null);

              setSource("");

              setError("");

              setVtt(null);

            }}

          >

            <Icon size={15} />

            {label}

          </button>

        ))}

      </div>

      {mode === "upload" ? (

        <button

          className="upload-zone"

          disabled={busy}

          onClick={() => input.current?.click()}

          onDragOver={(e) => e.preventDefault()}

          onDrop={(e) => {

            e.preventDefault();

            void file(e.dataTransfer.files[0]);

          }}

        >

          <ImagePlus size={28} />

          <strong>{kind === "map" ? "Choose an image or Universal VTT export" : "Choose an image"}</strong>

          <span>{kind === "map" ? "PNG, JPG, WebP · 20 MB; UVTT, DD2VTT, DF2VTT · 48 MiB" : "PNG, JPG, WebP · up to 20 MB"}</span>

        </button>

      ) : (

        <>

          <Field

            label={mode === "s3" ? "Object key" : "Direct image URL"}

            hint={

              mode === "s3"

                ? "Relative to your configured bucket prefix."

                : "The image host must permit cross-origin access (CORS)."

            }

          >

            <input

              value={url}

              onChange={(e) => setUrl(e.target.value)}

              placeholder={

                mode === "s3" ? "maps/forest.webp" : "https://…/map.jpg"

              }

            />

          </Field>

          {mode === "s3" && !s3 ? (

            <p className="notice">

              S3 is not connected yet. Open Connections for the required server

              settings. Hosted uploads work now.

            </p>

          ) : (

            <button

              disabled={busy || !url}

              onClick={() => {

                if (mode === "url" && !url.startsWith("https://")) {

                  setError("Use an HTTPS image URL.");

                  return;

                }

                void prepare(

                  mode === "s3"

                    ? "/api/s3?key=" + encodeURIComponent(url)

                    : url,

                );

              }}

            >

              Load image

            </button>

          )}

        </>

      )}

      <input

        ref={input}

        hidden

        type="file"

        accept={kind === "map" ? "image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt" : "image/png,image/jpeg,image/webp"}

        onChange={(e) => { const selected = e.target.files?.[0]; e.target.value = ''; void file(selected); }}

      />

      {kind === "map" && mode === "upload" && (

        <p className="muted">From Dungeon Alchemist or Dungeon Scrawl, choose a Universal VTT export. Native project files are unsupported. The map image and grid are imported; walls, doors, and lighting are not applied.</p>

      )}

      {img && (

        <>

          <Field label={kind === "map" ? "Map name" : "Token name"}>

            <input

              maxLength={120}

              value={name}

              onChange={(e) => setName(e.target.value)}

              placeholder={kind === "map" ? "The old watchtower" : "Rook"}

            />

          </Field>

          {kind === "token" ? (

            <div className="cropper">

              <canvas ref={preview} width={240} height={240} />

              <div>

                <Field label="Zoom">

                  <input

                    type="range"

                    min={1}

                    max={5}

                    step={0.05}

                    value={zoom}

                    onChange={(e) => setZoom(+e.target.value)}

                  />

                </Field>

                <Field label="Horizontal crop">

                  <input

                    type="range"

                    min={0}

                    max={100}

                    value={cx}

                    onChange={(e) => setCx(+e.target.value)}

                  />

                </Field>

                <Field label="Vertical crop">

                  <input

                    type="range"

                    min={0}

                    max={100}

                    value={cy}

                    onChange={(e) => setCy(+e.target.value)}

                  />

                </Field>

                <Field label="Border color">

                  <input

                    type="color"

                    value={color}

                    onChange={(e) => setColor(e.target.value)}

                  />

                </Field>

              </div>

            </div>

          ) : (

            <><div className="map-import-preview"><canvas ref={mapPreview} role="img" aria-label="Selected map preview" /></div><p className="muted">

              {img.width} × {img.height} pixels ·{" "}

              {vtt ? "Original embedded image preserved." : source

                ? "Linked image"

                : `Uploaded maps are optimized to a maximum of ${largeMap ? 8000 : 4096} pixels.`}

            </p></>

          )}

          {kind==="map" && img && !vtt && !source && <Toggle label="Large map: preserve detail (up to 8000 px)" checked={largeMap} onChange={setLargeMap}/>}

      {vtt && (

            <div className="notice" role="status">

              <p>Universal VTT grid: {vtt.grid.size} pixels per cell · offset {vtt.grid.offsetX}, {vtt.grid.offsetY} pixels.</p>

              {vtt.warnings.map((warning, index) => <p key={index}>{warning}</p>)}

            </div>

          )}

          {s3 && (!source || kind === "token") && (

            <Field label="Save image to">

              <select

                value={storage}

                onChange={(e) => setStorage(e.target.value)}

              >

                <option value="hosted">Private Site storage</option>

                <option value="s3">Your S3 bucket</option>

              </select>

            </Field>

          )}

        </>

      )}

      {error && (

        <p role="alert" className="error">

          {error}

        </p>

      )}

      <div className="modal-footer">

        <button onClick={close}>Cancel</button>

        <button

          className="primary"

          disabled={!img || busy}

          onClick={() => void submit()}

        >

          {busy

            ? "Working…"

            : submitLabel ?? (kind === "map"

              ? "Create scene"

              : "Save & place token")}

        </button>

      </div>

    </Modal>

  );

}



export function ExportDialog({

  campaignId,

  campaignName,

  scene,

  workspace,

  images,

  view,

  close,

  discord,

}: {

  scene: Scene;

  workspace: Workspace;

  images: Images;

  view: View;

  close: () => void;

  discord: boolean;

  campaignName: string | null;

  campaignId: string | null;

}) {

  const [destination, setDestination] = useState(scene.mapType === "world" ? "world" : scene.mapType === "area" ? "exploration" : "combat");

  const [area, setArea] = useState(scene.activeCropId ? `named:${scene.activeCropId}` : scene.crop ? "crop" : "full"),

    [size, setSize] = useState(2400),

    [format, setFormat] = useState("image/webp"),

    [caption, setCaption] = useState(""),

    [busy, setBusy] = useState(false),

    [error, setError] = useState(""),

    [sent, setSent] = useState(false),

    [blob, setBlob] = useState<Blob | null>(null),

    [preview, setPreview] = useState("");

  useEffect(() => {

    let active = true,

      url = "";

    setBlob(null);

    setError("");

    setSent(false);

    (async () => {

      try {

        const needed = new Set(

          [

            scene.mapId,  ...drawingStampAssets(scene.drawing),

            ...scene.tokens.filter((t) => !t.hidden).flatMap((t) => [t.assetId, t.borderAssetId]),

            ...workspace.conditions.filter(c=>scene.tokens.some(t=>!t.hidden&&t.conditions.includes(c.id))).map(c=>c.assetId),

          ].filter(Boolean),

        );

        for (const id of needed) {

          if (!images.has(id!)) {

            const asset = workspace.assets.find((a) => a.id === id);

            if (!asset) throw new Error("An image is missing from this scene.");

            images.set(id!, await loadImage(asset.src));

          }

        }

        const named=area.startsWith("named:")?scene.savedCrops.find(c=>c.id===area.slice(6)):null;

        const crop=named?mapCrop({...scene,crop:named}):area === "crop" ? mapCrop(scene) : null;

        const bounds=sceneRenderBounds(scene,crop);

        const left = area !== "viewport" ? bounds.x : Math.max(bounds.x, -view.x / view.scale),

          top = area !== "viewport" ? bounds.y : Math.max(bounds.y, -view.y / view.scale),

          right =

            area !== "viewport"

              ? bounds.x+bounds.width

              : Math.min(bounds.x+bounds.width, (view.width - view.x) / view.scale),

          bottom =

            area !== "viewport"

              ? bounds.y+bounds.height

              : Math.min(bounds.y+bounds.height, (view.height - view.y) / view.scale);

        const width = right - left,

          height = bottom - top;

        if (width <= 0 || height <= 0)

          throw new Error(

            "Move the map into view before exporting this region.",

          );

        const scale = Math.min(2, size / Math.max(width, height));

        const canvas = document.createElement("canvas");

        canvas.width = Math.round(width * scale);

        canvas.height = Math.round(height * scale);

        const ctx = canvas.getContext("2d")!;

        ctx.scale(scale, scale);

        ctx.translate(-left, -top);

        renderScene(ctx, scene, workspace, images, { player: true, crop });

        const b = await canvasBlob(canvas, format, 0.9);

        if (active) {

          setBlob(b);

          url = URL.createObjectURL(b);

          setPreview(url);

        }

      } catch (e) {

        if (active) setError((e as Error).message);

      }

    })();

    return () => {

      active = false;

      if (url) URL.revokeObjectURL(url);

    };

  }, [area, size, format, scene, workspace, view, images]);

  const post = async () => {

    if (!blob) return;

    setBusy(true);

    setError("");

    try {

      const form = new FormData();

      form.set("transferId", await stageTransfer(blob, "discord"));

      form.set("caption", caption);

      form.set("sceneId",scene.id);

      form.set("route",destination);

      form.set("campaignId",campaignId ?? "");

      await api("/api/discord", { method: "POST", body: form });

      setSent(true);

    } catch (e) {

      setError((e as Error).message);

    } finally {

      setBusy(false);

    }

  };

  return (

    <Modal title="Share the table" close={close} wide>

      <p><strong>Discord destination:</strong> {campaignName ? `${campaignName} campaign` : "No campaign — move this scene into a campaign to post."}</p>

      <p className="muted">

        Player view only. Hidden tokens and GM controls are excluded; fog covers

        the unexplored map.

      </p>

      <div className="export-preview">

        {blob && preview ? (

          <img src={preview} alt="Player-view export preview" />

        ) : (

          <span>

            {error ? "Preview unavailable" : "Rendering player view…"}

          </span>

        )}

      </div>

      <div className="form-row">

        <Field label="Area">

          <select value={area} onChange={(e) => setArea(e.target.value)}>

            <option value="full">Whole map</option>

            <option value="viewport">Visible region</option>

            {scene.crop && !scene.activeCropId && <option value="crop">Current map crop</option>}

            {scene.savedCrops.map(c=><option key={c.id} value={`named:${c.id}`}>{c.name}</option>)}

          </select>

        </Field>

        <Field label="Longest edge">

          <select value={size} onChange={(e) => setSize(+e.target.value)}>

            <option value={1200}>1200 px</option>

            <option value={2400}>2400 px</option>

            <option value={4000}>4000 px</option>

          </select>

        </Field>

        <Field label="Format">

          <select value={format} onChange={(e) => setFormat(e.target.value)}>

            <option value="image/webp">WebP · smaller file (default)</option>

            <option value="image/png">PNG</option>

            <option value="image/jpeg">JPG · smaller file</option>

          </select>

        </Field>

      </div>

      {blob && blob.type !== format && (

        <p className="notice" role="status">This browser could not export the selected format. Using {blob.type === "image/jpeg" ? "JPG" : blob.type === "image/webp" ? "WebP" : "PNG"} instead.</p>

      )}

      <Field label="Discord caption (optional)">

        <textarea

          maxLength={1900}

          rows={2}

          value={caption}

          onChange={(e) => setCaption(e.target.value)}

          placeholder="Round 3 — where are you moving?"

        />

      </Field>

      {blob && (

        <p className="muted">

          {(blob.size / 1024 / 1024).toFixed(2)} MB · Coordinates keep their

          original map addresses.

        </p>

      )}

      <Field label="Discord destination"><select value={destination} onChange={e=>{setDestination(e.target.value);setSent(false);}}><option value="combat">Combat</option><option value="exploration">Exploration</option><option value="world">World</option></select></Field>

      {!discord && (

        <p className="notice">

          {campaignName ? `Add a webhook for ${campaignName} in Connections to post directly.` : "Unfiled scenes have no Discord webhook."} You can still download the image.

        </p>

      )}

      {sent && (

        <p className="success" role="status">

          Posted to Discord.

        </p>

      )}

      {error && (

        <p className="error" role="alert">

          {error}

        </p>

      )}

      <div className="modal-footer">

        <button

          disabled={!blob || busy}

          onClick={() =>

            blob &&

            download(

              blob,

              `${scene.name.replace(/[^a-z0-9 -]/gi, "") || "map"}.${blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png"}`,

            )

          }

        >

          <Download size={17} />

          Download image

        </button>

        <button

          className="primary"

          disabled={

            !blob ||

            !discord ||

            busy ||

            sent ||

            (blob?.size ?? 0) > 9 * 1024 * 1024

          }

          onClick={() => void post()}

        >

          <Send size={16} />

          {busy ? "Posting…" : sent ? "Posted" : "Post to Discord"}

        </button>

      </div>

    </Modal>

  );

}



export function ConnectionsDialog({

  campaignId,

  campaignName,

  close,

  onUpdated,

}: {

  close: () => void;

  campaignId: string | null;

  campaignName: string | null;

  onUpdated: (s: { s3Configured: boolean; discordConfigured: boolean; discordRoutes?: Record<string,boolean> }) => void;

}) {

  const [route,setRoute]=useState("default");

  const [testing,setTesting]=useState(false);

  const [status, setStatus] = useState<{

      s3Configured: boolean; s3ObjectPrefix?: string;

      discordConfigured: boolean; discordRoutes?: Record<string,boolean>;

    } | null>(null),

    [webhook, setWebhook] = useState(""),

    [error, setError] = useState(""),

    [busy, setBusy] = useState(false),

    [message, setMessage] = useState("");

  useEffect(() => {

    let active=true;

    setStatus(null);setWebhook("");setMessage("");setError("");

    api<{ s3Configured: boolean; discordConfigured: boolean; discordRoutes?: Record<string,boolean> }>("/api/settings"+(campaignId?`?campaignId=${encodeURIComponent(campaignId)}`:""))

      .then(value=>{if(active)setStatus(value);})

      .catch((e) => {if(active)setError(e.message);});

    return ()=>{active=false;};

  }, [campaignId]);

  const save = async (value: string) => {

    if(!campaignId)return;

    setBusy(true);

    setError("");

    setMessage("");

    try {

      await api("/api/settings", {

        method: "PUT",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ campaignId, route, webhook: value.trim() }),

      });

      const next = await api<{

        s3Configured: boolean; s3ObjectPrefix?: string;

        discordConfigured: boolean; discordRoutes?: Record<string,boolean>;

      }>(`/api/settings?campaignId=${encodeURIComponent(campaignId)}`);

      setStatus(next);

      onUpdated(next);

      setWebhook("");

      setMessage(

        value

          ? "Webhook saved. You can now post from Share."

          : "Webhook removed.",

      );

    } catch (e) {

      setError((e as Error).message);

    } finally {

      setBusy(false);

    }

  };

  const configured = !!status?.discordRoutes?.[route];

  const available = configured || !!status?.discordRoutes?.default;

  const testWebhook = async () => {

    if(!campaignId || busy || !available || webhook.trim())return;

    setBusy(true);setTesting(true);setError("");setMessage("");

    try {

      await api("/api/discord/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({campaignId,route})});

      setMessage(`Test sent for ${campaignName}. Check Discord for the campaign-named message to confirm the channel.`);

    } catch(e) {setError((e as Error).message);}

    finally {setBusy(false);setTesting(false);}

  };

  return (

    <Modal title="Connections" close={close}>

      <h3>Discord</h3>

      <Field label="Webhook destination"><select disabled={busy} value={route} onChange={e=>{setRoute(e.target.value);setWebhook("");setMessage("");setError("");}}><option value="default">Default / fallback</option><option value="combat">Combat maps</option><option value="exploration">Exploration / area maps</option><option value="world">World maps</option></select></Field>

      <p className="muted">Each destination can use its own channel. Destinations without a saved URL use the default webhook. Share lets you choose the destination for mixed exploration/combat maps.</p>

      <p><strong>{campaignName ? `Campaign: ${campaignName}` : "Open a campaign to configure its Discord webhook."}</strong></p>

      <p className="muted">Each campaign has its own webhook. A webhook saved here is never used by another campaign.</p>

      <p className="muted">

        {configured

          ? "A webhook is connected."

          : available ? "Using the default webhook." : "No webhook connected."}{" "}

        Messages are sent only when you press Post to Discord or Test webhook.

      </p>

      <Field

        label={

          configured ? "Replace webhook URL" : "Webhook URL"

        }

        hint="Create one in Discord → Channel settings → Integrations → Webhooks. The saved URL stays on the server."

      >

        <input

          type="password"

          disabled={!campaignId || busy}

          autoComplete="off"

          value={webhook}

          onChange={(e) => setWebhook(e.target.value)}

          placeholder="https://discord.com/api/webhooks/…"

        />

      </Field>

      <div className="button-row">

        <button

          className="primary"

          disabled={busy || !webhook.trim() || !campaignId || !status}

          onClick={() => void save(webhook)}

        >

          Save webhook

        </button>

        <button disabled={busy || !campaignId || !available || !!webhook.trim()} onClick={()=>void testWebhook()}>

          {testing ? "Testing…" : "Test webhook"}

        </button>

        {configured && (

          <button disabled={busy} onClick={() => void save("")}>

            Disconnect

          </button>

        )}

      </div>

      <p className="muted">Test webhook sends a short message naming this campaign to its saved Discord channel. Save any new URL before testing.</p>

      {message && <p role="status" className="success">{message}</p>}

      {error && <p role="alert" className="error">{error}</p>}

      <hr />

      <AgentAccess campaignId={campaignId} campaignName={campaignName}/>

      <hr />

      <h3>

        Amazon S3{" "}

        <span className="status-label">

          {status?.s3Configured ? "Configured" : "Optional"}

        </span>

      </h3>

      <p className="muted">

        Map images already use the app’s private storage bucket. To connect an additional image bucket, add

        these server environment variables in Vercel:

      </p>

      <p><a href="https://s3.console.aws.amazon.com/s3/buckets" target="_blank" rel="noreferrer">Open Amazon S3 console</a></p>

      {status?.s3ObjectPrefix && <p className="muted">Your image folder in the optional bucket: <code>{status.s3ObjectPrefix}</code>. Enter object keys relative to this folder.</p>}

      <div className="code-list">

        S3_BUCKET

        <br />

        MAPTABLE_AWS_REGION

        <br />

        MAPTABLE_AWS_ACCESS_KEY_ID

        <br />

        MAPTABLE_AWS_SECRET_ACCESS_KEY

        <br />

        S3_PREFIX <span>(default: maptable/)</span>

        <br />

        MAPTABLE_AWS_SESSION_TOKEN <span>(only for temporary credentials)</span>

      </div>

      <p className="muted">

        Use a dedicated IAM identity with GetObject and PutObject permissions

        for that prefix. The bucket can remain private. Import an existing image

        using its object key, or choose S3 when uploading.

      </p>

      <p className="muted">

        Public S3 or CloudFront URLs also work through Image URL if the host

        allows CORS. Credentials are never entered into this browser form.

      </p>

    </Modal>

  );

}

