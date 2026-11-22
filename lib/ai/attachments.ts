/*
 * Files the GM attaches to an AI panel message: pictures, PDFs and text files, for models that can read them.
 * Pictures and PDFs travel as base64 with the message; a text file travels as its text. They go to the AI with the
 * conversation and are not saved: a saved chat keeps only their names. Shared by the browser and the server.
 */

export type Attachment =
  | { kind: "image"; name: string; mimeType: ImageType; data: string }
  | { kind: "pdf"; name: string; mimeType: "application/pdf"; data: string }
  | { kind: "text"; name: string; mimeType: "text/plain"; text: string };
/** What a saved chat keeps of an attachment. */
export type AttachmentName = { name: string; kind: Attachment["kind"] };

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type ImageType = typeof IMAGE_TYPES[number];
/** Up to FILES_PER_MESSAGE files a message; base64 or text of all the files sent with one request, at most SEND_BUDGET characters. */
export const FILES_PER_MESSAGE = 6, SEND_BUDGET = 3_200_000, TEXT_FILE_CHARS = 100_000, NAME_MAX = 120;
/** What the file picker offers. */
export const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,application/pdf,.pdf,.txt,.md,.markdown,.csv,.json,.yaml,.yml,text/plain,text/markdown,text/csv,application/json";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "").slice(0, NAME_MAX) || "file";

/** Checks the files on one message. Throws a sentence the GM can act on. */
export function cleanAttachments(v: unknown): Attachment[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw Error("Attach files again.");
  if (v.length > FILES_PER_MESSAGE) throw Error(`Attach up to ${FILES_PER_MESSAGE} files to one message.`);
  return v.map((f: unknown): Attachment => {
    const o = f && typeof f === "object" ? f as Record<string, unknown> : {};
    const name = cleanName(o.name);
    if (o.kind === "text") {
      if (typeof o.text !== "string") throw Error(`${name} couldn't be read as text.`);
      return { kind: "text", name, mimeType: "text/plain", text: o.text.slice(0, TEXT_FILE_CHARS) };
    }
    if (typeof o.data !== "string" || !o.data || o.data.length > SEND_BUDGET || !BASE64.test(o.data)) throw Error(`${name} couldn't be read. Attach it again.`);
    if (o.kind === "image" && (IMAGE_TYPES as readonly string[]).includes(o.mimeType as string)) return { kind: "image", name, mimeType: o.mimeType as ImageType, data: o.data };
    if (o.kind === "pdf" && o.mimeType === "application/pdf") return { kind: "pdf", name, mimeType: "application/pdf", data: o.data };
    throw Error(`${name} isn't a picture, PDF or text file the AI can read.`);
  });
}

/** How many characters a file adds to a request. */
export const sizeOf = (a: Attachment) => a.kind === "text" ? a.text.length : a.data.length;
export const namesOf = (files: Attachment[] | undefined): AttachmentName[] => (files ?? []).map(f => ({ name: f.name, kind: f.kind }));
/** A line noting attached files, for a saved chat's Markdown and for turns whose files weren't sent again. */
export const attachedLine = (files: AttachmentName[] | undefined) => files?.length ? `[Attached: ${files.map(f => f.name).join(", ")}]` : "";
