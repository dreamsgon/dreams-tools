"use client";

import { drawingStampAssets } from "@/lib/map-stamps";
import { stageTransfer } from "@/lib/transfer-client";
import { useEffect, useState } from "react";
import { Download, Send } from "lucide-react";
import { api, loadImage, canvasBlob, download } from "@/lib/api";
import { sceneRenderBounds, mapCrop, type Workspace, type Scene } from "@/lib/model";
import { renderScene, type Images } from "@/lib/render";
import type { View } from "./board";
import { Modal, Field } from "./dialogs";

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


