/*
 * The handler behind POST /api/encyclopedia/sheet, with who is asking and the network passed in so it can be tested:
 * signed-in owner only, same-origin only, a small request body, a few reads per owner every ten seconds.
 */
import { z } from "zod";
import { readPublishedSheet, SheetReadError } from "./sheet-published.ts";

export const MAX_BODY = 4000, READS = 5, WINDOW_MS = 10_000;
const action = z.object({ action: z.literal("read"), link: z.string().max(1000) });
const recent = new Map<string, number[]>();
/** True when this owner has read too many sheets in the last ten seconds; otherwise counts this read. */
export function throttled(owner: string, now = Date.now()) {
  const times = (recent.get(owner) ?? []).filter(t => now - t < WINDOW_MS);
  if (times.length >= READS) { recent.set(owner, times); return true; }
  times.push(now); recent.set(owner, times);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some(t => now - t < WINDOW_MS)) recent.delete(k);
  return false;
}
export const resetThrottle = () => recent.clear();

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export type Deps = { owner: (r: Request) => Promise<string | null>; sameOrigin: (r: Request) => boolean; read?: typeof readPublishedSheet; now?: number };

export async function handleSheetRead(request: Request, deps: Deps) {
  const owner = await deps.owner(request);
  if (!owner) return json({ error: "Sign in required" }, 401);
  if (!deps.sameOrigin(request)) return json({ error: "Same-origin request required" }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "That request is too large." }, 413);
  if (throttled(owner, deps.now)) return json({ error: "Reading sheets too quickly. Wait a few seconds and try again." }, 429);
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: "That request is too large." }, 413);
    const input = action.parse(JSON.parse(text));
    return json(await (deps.read ?? readPublishedSheet)(input.link));
  } catch (e) { return json({ error: e instanceof SheetReadError ? e.message : "Could not read that sheet." }, 400); }
}
