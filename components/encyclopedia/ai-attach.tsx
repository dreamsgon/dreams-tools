"use client";
/*
 * Attaching files to an AI panel message (lib/ai/attachments.ts): reading what the GM picks, pastes or drops, shrinking
 * big pictures so they travel quickly, and the chips that show what is attached.
 */
import { FileText, Image as ImageIcon, X } from "lucide-react";
import { FILES_PER_MESSAGE, IMAGE_TYPES, TEXT_FILE_CHARS, type Attachment, type AttachmentName, type ImageType } from "@/lib/ai/attachments";

/** Pictures are shrunk to fit this many pixels on their long side (what vision models read anyway). */
const LONG_SIDE = 1600, PDF_BYTES = 2_300_000, IMAGE_BYTES = 20_000_000, TEXT_BYTES = 400_000;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|ya?ml)$/i;

const base64Of = (buf: ArrayBuffer) => {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** A picture as the AI gets it: as it is when small, else redrawn to LONG_SIDE as JPEG (PNG keeps transparency). */
async function readImage(file: File): Promise<Attachment> {
  const type: ImageType = (IMAGE_TYPES as readonly string[]).includes(file.type) ? file.type as ImageType : "image/png";
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw Error(`${file.name} couldn't be opened as a picture.`);
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1_000_000 && type !== "image/gif") { bitmap.close(); return { kind: "image", name: file.name, mimeType: type, data: base64Of(await file.arrayBuffer()) }; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const out = type === "image/png" ? "image/png" : "image/jpeg";
  let blob = await new Promise<Blob | null>(r => canvas.toBlob(r, out, 0.85));
  // A big PNG photo: JPEG is far smaller.
  if (blob && out === "image/png" && blob.size > 1_500_000) blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw Error(`${file.name} couldn't be read.`);
  return { kind: "image", name: file.name, mimeType: blob.type === "image/png" ? "image/png" : "image/jpeg", data: base64Of(await blob.arrayBuffer()) };
}

/** Reads the files the GM picked, pasted or dropped. Throws a sentence about the first one that can't be sent. */
export async function readAttachments(files: File[], already: number): Promise<Attachment[]> {
  if (already + files.length > FILES_PER_MESSAGE) throw Error(`Attach up to ${FILES_PER_MESSAGE} files to one message.`);
  const out: Attachment[] = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      if (file.size > IMAGE_BYTES) throw Error(`${file.name} is too big. Pictures up to 20 MB.`);
      out.push(await readImage(file));
    } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      if (file.size > PDF_BYTES) throw Error(`${file.name} is too big. PDFs up to 2 MB: attach the pages you need, or pictures of them.`);
      out.push({ kind: "pdf", name: file.name, mimeType: "application/pdf", data: base64Of(await file.arrayBuffer()) });
    } else if (file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(file.name)) {
      if (file.size > TEXT_BYTES) throw Error(`${file.name} is too long. Text files up to ${TEXT_FILE_CHARS.toLocaleString("en-US")} characters.`);
      out.push({ kind: "text", name: file.name, mimeType: "text/plain", text: (await file.text()).slice(0, TEXT_FILE_CHARS) });
    } else throw Error(`${file.name} isn't a picture, PDF or text file.`);
  }
  return out;
}

const icon = (kind: Attachment["kind"]) => kind === "image" ? <ImageIcon size={13} aria-hidden/> : <FileText size={13} aria-hidden/>;

/** Files on a message: a thumbnail for a picture still in this tab, else the file's name. `onRemove` adds a remove button. */
export function AttachChips({ files, onRemove }: { files: (Attachment | AttachmentName)[]; onRemove?: (i: number) => void }) {
  if (!files.length) return null;
  return <ul className="ai-attach-list" aria-label="Attached files">{files.map((f, i) => <li key={i} className="ai-attach">
    {"data" in f && f.kind === "image" ? <img src={`data:${f.mimeType};base64,${f.data}`} alt=""/> : icon(f.kind)}
    <span title={f.name}>{f.name}</span>
    {onRemove && <button type="button" className="icon-button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)}><X size={12}/></button>}
  </li>)}</ul>;
}
