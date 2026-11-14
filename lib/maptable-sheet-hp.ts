/*
 * Maptable side of writing HP back to a character's Google Sheet: which tokens' HP just changed between two scene
 * states (a click, a zero-HP rule, undo, redo or a change that arrived from the cloud), and which of those belong to a
 * GM-linked Google sheet with write-back on. Pure: the writing itself is components/use-token-sheet-hp.ts.
 */
import { sheetSchema, type Sheet } from "./encyclopedia/sheet-link.ts";
import { hpTarget, hpValue } from "./encyclopedia/sheet-write.ts";

type Tokens = { scenes: { id: string; tokens: { id: string; hp: number; encyclopediaEntryId?: string }[] }[] };
export type HpChange = { entryId: string; tokenId: string; hp: number };

/** Tokens linked to an Encyclopedia character whose HP differs from the same token in the earlier state. New and removed tokens are not changes. One entry per character: the last token changed wins. */
export function hpChanges(before: Tokens | null | undefined, after: Tokens | null | undefined): HpChange[] {
  if (!before || !after) return [];
  const prior = new Map<string, number>();
  for (const s of before.scenes) for (const t of s.tokens) prior.set(`${s.id}\n${t.id}`, t.hp);
  const found = new Map<string, HpChange>();
  for (const s of after.scenes) for (const t of s.tokens) {
    if (!t.encyclopediaEntryId) continue;
    const was = prior.get(`${s.id}\n${t.id}`);
    if (was !== undefined && was !== t.hp) found.set(t.encyclopediaEntryId, { entryId: t.encyclopediaEntryId, tokenId: t.id, hp: t.hp });
  }
  return [...found.values()];
}

type Book = { entries?: { id: string; kind: string; title?: string; character?: { sheet?: unknown } }[] };
/** The character's sheet when HP may be written to it from Maptable: Google sign-in link, linked by the GM (not a player), write-back on, with an HP cell. */
export function writableSheet(book: Book | null | undefined, entryId: string): Sheet | null {
  const e = book?.entries?.find(x => x.id === entryId && x.kind === "character");
  const parsed = e?.character?.sheet ? sheetSchema.safeParse(e.character.sheet) : null;
  if (!parsed?.success) return null;
  const s = parsed.data;
  return s.source === "google" && !s.linkedById && s.writeBack === true && hpTarget(s).ok ? s : null;
}
/** Which of the changes to write: only characters with a writable sheet and a whole-number HP in range. */
export function chooseWrites(changes: HpChange[], book: Book | null | undefined): { entryId: string; name: string; hp: number; sheet: Sheet }[] {
  return changes.flatMap(c => {
    const sheet = writableSheet(book, c.entryId), hp = hpValue(c.hp);
    return sheet && hp !== null ? [{ entryId: c.entryId, name: book!.entries!.find(e => e.id === c.entryId)?.title ?? "The character", hp, sheet }] : [];
  });
}
