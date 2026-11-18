/*
 * A minimal zip reader for repository downloads (GitHub's "Download ZIP") and RPG Tools' own exports.
 * Stored and deflate entries only. Deflate uses the platform DecompressionStream('deflate-raw') (Node 22, modern browsers).
 * It refuses encrypted entries, zip64, more than 5000 files, more than 50 MB uncompressed, bad checksums and unsafe names.
 */
import { crc32 } from "./bridge/zip.ts";

export const ZIP_MAX_FILES = 5000, ZIP_MAX_BYTES = 50 * 1024 * 1024;
export class ZipError extends Error {}
export type ZipEntry = { name: string; data: Uint8Array };

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw"), writer = stream.writable.getWriter(), reader = stream.readable.getReader();
  const written = writer.write(data as unknown as BufferSource).then(() => writer.close()).catch(() => undefined);
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel().catch(() => undefined); throw new ZipError("A file in the ZIP is larger than it says."); }
      chunks.push(value);
    }
  } catch (e) { if (e instanceof ZipError) throw e; throw new ZipError("A file in the ZIP could not be decompressed."); }
  await written;
  const out = new Uint8Array(total); let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** A name safe to use as a relative path: slashes only, no empty or dot segments, no drive letters, no leading slash. */
function safeName(raw: string): string {
  const name = raw.replace(/\\/g, "/");
  if (!name || name.startsWith("/") || /^[a-zA-Z]:/.test(name) || name.includes("\0") || name.split("/").some((p, i, a) => p === ".." || p === "." || (p === "" && i < a.length - 1)))
    throw new ZipError(`The ZIP has an unsafe file name: ${raw.slice(0, 80)}`);
  return name;
}

/** `limits` raises the file count and unpacked size for RPG Tools' own larger archives (a campaign backup with its pictures). */
export async function readZip(bytes: Uint8Array, limits: { files?: number; bytes?: number } = {}): Promise<ZipEntry[]> {
  const maxFiles = limits.files ?? ZIP_MAX_FILES, maxBytes = limits.bytes ?? ZIP_MAX_BYTES;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder("utf-8");
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ZipError("This is not a ZIP file.");
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) throw new ZipError("ZIP64 files are not supported.");
  const count = view.getUint16(eocd + 10, true), cdSize = view.getUint32(eocd + 12, true), cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError("ZIP64 files are not supported.");
  if (count > maxFiles) throw new ZipError(`The ZIP has more than ${maxFiles} files.`);
  if (cdOffset + cdSize > eocd) throw new ZipError("The ZIP directory is damaged.");

  type Head = { name: string; method: number; crc: number; csize: number; usize: number; offset: number };
  const heads: Head[] = []; let at = cdOffset, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new ZipError("The ZIP directory is damaged.");
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true), crc = view.getUint32(at + 16, true), csize = view.getUint32(at + 20, true), usize = view.getUint32(at + 24, true);
    const n = view.getUint16(at + 28, true), x = view.getUint16(at + 30, true), k = view.getUint16(at + 32, true), offset = view.getUint32(at + 42, true);
    if (at + 46 + n + x + k > bytes.length) throw new ZipError("The ZIP directory is damaged.");
    const raw = dec.decode(bytes.subarray(at + 46, at + 46 + n));
    at += 46 + n + x + k;
    if (flags & 1 || flags & 0x40) throw new ZipError("Encrypted ZIP files are not supported.");
    if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff) throw new ZipError("ZIP64 files are not supported.");
    if (raw.endsWith("/")) continue; // a folder
    if (method !== 0 && method !== 8) throw new ZipError(`Unsupported compression in the ZIP (method ${method}).`);
    total += usize;
    if (total > maxBytes) throw new ZipError(`The ZIP is larger than ${Math.round(maxBytes / 1024 / 1024)} MB when unpacked.`);
    heads.push({ name: safeName(raw), method, crc, csize, usize, offset });
  }

  const files: ZipEntry[] = [], seen = new Set<string>();
  for (const h of heads) {
    if (h.offset + 30 > bytes.length || view.getUint32(h.offset, true) !== 0x04034b50) throw new ZipError(`The ZIP entry ${h.name} is damaged.`);
    const start = h.offset + 30 + view.getUint16(h.offset + 26, true) + view.getUint16(h.offset + 28, true);
    if (start + h.csize > bytes.length) throw new ZipError(`The ZIP entry ${h.name} is cut short.`);
    const packed = bytes.subarray(start, start + h.csize);
    const data = h.method === 0 ? packed.slice() : await inflateRaw(packed, h.usize);
    if (data.length !== h.usize || crc32(data) !== h.crc) throw new ZipError(`The ZIP entry ${h.name} is damaged.`);
    files.push({ name: h.name, data });
  }

  // Skip macOS metadata, then drop one shared top-level folder (GitHub's "Download ZIP" adds repo-main/).
  const real = files.filter(f => !f.name.startsWith("__MACOSX/"));
  // Only with two or more files: a lone repo-main/x stays where it is, since one file cannot show that the folder is a wrapper.
  const first = real[0]?.name.split("/")[0];
  const strip = real.length >= 2 && !!first && real.every(f => f.name.includes("/") && f.name.split("/")[0] === first);
  return real.map(f => ({ name: strip ? f.name.slice(first!.length + 1) : f.name, data: f.data })).filter(f => {
    if (!f.name) return false;
    const key = f.name.toLowerCase(); // a case-insensitive disk would merge these
    if (seen.has(key)) throw new ZipError(`The ZIP has two files named ${f.name}.`);
    seen.add(key); return true;
  });
}
