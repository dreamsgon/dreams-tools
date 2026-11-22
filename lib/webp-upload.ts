/**
 * Pictures people upload are stored as WebP, which is usually much smaller than PNG or JPEG at the same look.
 * It is on by default; Account settings › Uploads turns it off for the account (Supabase metadata `webp_uploads: false`).
 * Only PNG and JPEG are converted: WebP is already WebP, GIFs may be animated and SVGs are drawings, so those keep their format.
 * The conversion runs in the browser, so no image library is added to the server.
 */
export const WEBP_QUALITY = 0.9;
const CONVERTIBLE = ["image/png", "image/jpeg"];

/** True for a still PNG or JPEG picture, the only kinds worth converting. */
export const convertible = (type: string) => CONVERTIBLE.includes(type);

/** The WebP version when the browser made a real, smaller one; otherwise the original (some browsers can only encode PNG). */
export function pickUpload(original: Blob, converted: Blob | null) {
  return converted && converted.type === "image/webp" && converted.size > 0 && converted.size < original.size ? converted : original;
}

let preference: Promise<boolean> | null = null;
/** Remembers a change made on this page, so the next upload uses it without asking the server again. */
export function rememberWebpUploads(on: boolean) { preference = Promise.resolve(on); }
/** The signed-in account's choice, asked once per page. Anyone not signed in, or a failed request, gets the default (on). */
export function webpUploadsOn(request: typeof fetch = fetch) {
  preference ??= request("/api/account", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((d: { webpUploads?: unknown } | null) => d?.webpUploads !== false)
    .catch(() => true);
  return preference;
}

/** The picture to upload: a WebP copy of a PNG or JPEG when the setting is on and it comes out smaller, else the picture unchanged. */
export async function toWebp(blob: Blob): Promise<Blob> {
  if (!convertible(blob.type) || typeof document === "undefined" || !(await webpUploadsOn())) return blob;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0);
    const out = await new Promise<Blob | null>(done => canvas.toBlob(done, "image/webp", WEBP_QUALITY));
    canvas.width = canvas.height = 0;
    return pickUpload(blob, out);
  } catch {
    // Too large for this browser's canvas, or not decodable here: upload the original as before.
    return blob;
  } finally { bitmap?.close(); }
}
