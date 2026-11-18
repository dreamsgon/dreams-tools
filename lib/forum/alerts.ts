/*
 * Alerts: someone @named you or your character, quoted you, or added you to a private topic. Each member's alerts
 * live in their own file beside the forum (store.ts), newest first, at most 50. Pure.
 */
import { z } from "zod";

export const ALERT_LIMIT = 50;
const at = z.string().datetime(), id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const alertSchema = z.object({
  id: z.string().min(1).max(220), at, kind: z.enum(["mention", "quote", "private"]),
  topicId: id, postId: id.optional(),
  /** Who did it: their account and the character they wrote as. */
  by: z.string().min(1).max(100), as: id.nullable(),
});
export const alertsSchema = z.object({ schemaVersion: z.literal(1), items: z.array(alertSchema).max(ALERT_LIMIT), seen: at });
export type Alert = z.infer<typeof alertSchema>;
export type Alerts = z.infer<typeof alertsSchema>;

export const freshAlerts = (seen: string): Alerts => ({ schemaVersion: 1, items: [], seen });
/** Adds alerts, newest first, once each. */
export function addAlerts(a: Alerts | null, items: readonly Alert[], now: Date): Alerts {
  const base = a ?? freshAlerts(new Date(now.getTime() - 1000).toISOString()), have = new Set(base.items.map(x => x.id));
  const fresh = items.filter(x => !have.has(x.id));
  return { ...base, items: [...fresh, ...base.items].sort((x, y) => y.at.localeCompare(x.at)).slice(0, ALERT_LIMIT) };
}
export const unseen = (a: Alerts | null | undefined) => a ? a.items.filter(x => x.at > a.seen).length : 0;

const fold = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
/** Names a post @mentions, of those given: "@Name" not followed by a letter or digit. Case doesn't matter. */
export function mentioned(text: string, names: readonly string[]) {
  const body = fold(text), out = new Set<string>();
  for (const name of names) {
    const n = fold(name.trim());
    if (!n) continue;
    for (let i = body.indexOf("@" + n); i >= 0; i = body.indexOf("@" + n, i + 1)) {
      const before = i ? body.charAt(i - 1) : "", after = body.charAt(i + n.length + 1);
      if (!/[\p{L}\p{N}_.]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) { out.add(name); break; }
    }
  }
  return out;
}
/** Names a post quotes: the "> — Name" line a Quote leaves at the end of the quoted lines. */
export function quoted(text: string, names: readonly string[]) {
  const want = new Map(names.map(n => [fold(n.trim()), n])), out = new Set<string>();
  for (const m of text.matchAll(/^>\s*[—–-]\s*(.+?)\s*$/gm)) { const n = want.get(fold(m[1]!)); if (n) out.add(n); }
  return out;
}
