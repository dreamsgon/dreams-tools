/*
 * The handler behind POST /api/encyclopedia/sheet-hp, for Maptable: after the browser wrote a character's HP to the
 * Google Sheet (or the GM chose the sheet's value), store that HP on the character's sheet copy, or switch write-back
 * on or off. The signed-in owner only, same-origin, small bodies, a throttle. Only that one entry's sheet changes, on
 * the newest stored copy (a save that crossed someone else's is retried), so concurrent edits elsewhere are kept.
 * Google is never contacted from here and no token is accepted.
 */
import { z } from "zod";
import type { Sheet } from "./sheet-link.ts";
import { hpTarget, hpValue, withHp, withWriteBack } from "./sheet-write.ts";
import { workspaceSchema, type Workspace } from "./world-model.ts";
import { createThrottle } from "./throttle.ts";

export class SheetHpError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
const no = (message: string, status = 400): never => { throw new SheetHpError(message, status); };

/** One entry's GM-linked Google sheet changed with `f`; everything else in the workspace is untouched. */
function change(w: Workspace, entryId: string, now: Date, f: (sheet: Sheet) => Sheet): Workspace {
  const e = w.entries.find(x => x.id === entryId && x.kind === "character");
  const sheet = e?.character?.sheet;
  if (!e || !sheet) return no("That character has no linked sheet.", 404);
  if (sheet.source !== "google" || sheet.linkedById) return no("Only a sheet you linked with Google sign-in can be written to.", 403);
  const next = f(sheet);
  const parsed = workspaceSchema.safeParse({ ...w, entries: w.entries.map(x => x.id === entryId ? { ...x, character: { ...x.character, sheet: next }, editedBy: undefined, updatedAt: now.toISOString() } : x) });
  return parsed.success ? parsed.data : no("That change would break the page.", 400);
}
/** HP stored on the character's sheet copy (with the read time), only while write-back is on. */
export const storeHp = (w: Workspace, entryId: string, value: unknown, now = new Date()) => {
  const n = hpValue(value);
  if (n === null) no("HP must be a whole number.");
  return change(w, entryId, now, s => { if (s.writeBack !== true || !hpTarget(s).ok) no("Write HP back is off for this sheet.", 409); return withHp(s, n!, now.toISOString()); });
};
/** Write-back switched on or off. Turning it on needs a Google sheet with an HP cell. */
export const storeWriteBack = (w: Workspace, entryId: string, on: boolean, now = new Date()) =>
  change(w, entryId, now, s => { const next = withWriteBack(s, on); if (on && next.writeBack !== true) no(hpTarget(s, false).ok ? "Write-back can't be turned on for this sheet." : (hpTarget(s, false) as { reason: string }).reason); return next; });

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hp"), entryId: z.string().min(1).max(100), value: z.number() }),
  z.object({ action: z.literal("writeBack"), entryId: z.string().min(1).max(100), on: z.boolean() }),
]);
export const MAX_BODY = 1000;
const throttle = createThrottle(30, 10_000);
export const resetThrottle = () => throttle.reset();
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export type Deps = {
  owner: (r: Request) => Promise<string | null>; sameOrigin: (r: Request) => boolean;
  store: { read: (owner: string) => Promise<{ data: Workspace; revision: number }>; save: (owner: string, data: Workspace, revision: number) => Promise<unknown> };
  now?: number;
};

export async function handleSheetHp(request: Request, deps: Deps) {
  try {
    const owner = await deps.owner(request);
    if (!owner) return json({ error: "Sign in required" }, 401);
    if (!deps.sameOrigin(request)) return json({ error: "A same-origin request is required." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "That request is too large." }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: "That request is too large." }, 413);
    const body = action.parse(JSON.parse(text));
    if (throttle.hit(owner, deps.now)) return json({ error: "Too many changes too quickly. Wait a few seconds and try again." }, 429);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, revision } = await deps.store.read(owner), now = new Date(deps.now ?? Date.now());
      const next = body.action === "hp" ? storeHp(data, body.entryId, body.value, now) : storeWriteBack(data, body.entryId, body.on, now);
      if (await deps.store.save(owner, next, revision)) return json({ ok: true });
    }
    return json({ error: "The Encyclopedia is busy. Try again in a moment." }, 409);
  } catch (e) {
    return e instanceof SheetHpError ? json({ error: e.message }, e.status)
      : e instanceof z.ZodError || e instanceof SyntaxError ? json({ error: "That request isn't valid." }, 400)
      : json({ error: "Could not save to your Encyclopedia." }, 500);
  }
}
