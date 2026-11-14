import { readJsonResponse, stageTransfer } from "./transfer-client.ts";
import { assetsUrl, mapMemberRef } from "./maptable-member.ts";
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  let data: (T & { error?: string }) | undefined;
  try { data = await readJsonResponse<T & { error?: string }>(res); } catch { /* Proxies can return plain text or HTML errors. */ }
  if (!res.ok) {
    if (res.status === 413) throw new Error("This upload exceeds the server's size limit. Try a smaller image (maximum 20 MB).");
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status}). Please try again.`);
  }
  if (data === undefined) throw new Error("The server returned an unexpected response. Please try again.");
  return data;
}
export async function uploadAsset(
  blob: Blob,
  name: string,
  storage = "hosted",
) {
  const transferId = await stageTransfer(blob, "image");
  // A co-GM's pictures go to the GM's hosted storage, never S3.
  return api<{ src: string }>(assetsUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferId, storage: mapMemberRef() ? "hosted" : storage }) });
}
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const res = await fetch(src, {
    mode: "cors",
    credentials: src.startsWith("/") ? "same-origin" : "omit",
  });
  if (!res.ok)
    throw new Error(
      "Image could not be loaded. Check its URL and access permissions.",
    );
  const blob = await res.blob();
  if (!blob.type.startsWith("image/"))
    throw new Error(
      "That URL did not return an image. Use a direct image URL.",
    );
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unsupported or invalid image. Try PNG, JPG, or WebP."));
    };
    img.src = objectUrl;
  });
}
export function canvasBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image export failed."))),
      type,
      quality,
    ),
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
