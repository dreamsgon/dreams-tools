"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Link, Cloud, ImagePlus } from "lucide-react";
import { loadImage, canvasBlob, uploadAsset } from "@/lib/api";
import { uid, fitImageDimensions, type Asset } from "@/lib/model";
import { parseVttImport, isVttImportFilename, MAX_VTT_IMPORT_BYTES } from "@/lib/vtt-import";
import { Modal, Field, Toggle, type MapImportSettings } from "./dialogs";

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


