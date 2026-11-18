/*
 * Writes the notes for the relationship generators with the GM's own API key: a sentence or two for each suggested
 * tie, and, for a generated family, a line about each new person. It reads the pages as that connection may see them
 * (so a connection kept away from GM-only things never reads them), saves nothing itself (the GM adds the result in
 * the generator) and counts the tokens against the connection's monthly limit.
 */
import { z } from "zod";
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, permsOf, publicApi, targetFor, type KeyUse } from "../mcp/connections.ts";
import { loadContext } from "../mcp/load.ts";
import { runOnce, ProviderError, type OnceTool } from "./chat.ts";
import type { Entry } from "../encyclopedia/world-model.ts";

const name = z.string().trim().min(1).max(160), key = z.string().min(1).max(60);
const end = z.object({ id: z.string().max(120).optional(), name });
export const tieWriteSchema = z.object({
  /** What the GM wants, in their words: a tone, a theme, a hook. */
  brief: z.string().max(500).optional(),
  /** The family's name, for Generate a family. */
  family: z.string().max(80).optional(),
  ties: z.array(z.object({ key, from: end, to: end, tie: z.string().min(1).max(80), gm: z.boolean() })).max(40),
  /** New people, for Generate a family: a line about each comes back. */
  people: z.array(z.object({ key, name, note: z.string().max(400).optional() })).max(40).optional(),
});
export type TieWriteRequest = z.infer<typeof tieWriteSchema>;
export type TieWriteResult = { notes: Record<string, string>; bios: Record<string, string> };

export const TIE_SYSTEM = [
  "You write notes for a tabletop roleplaying campaign kept in RPG Tools.",
  "Each note says why two pages are tied, in one or two plain, concrete sentences under 240 characters, using the names given.",
  "Give each tie its own reason: a history, a want, a debt, a secret. Keep to what the pages say about themselves and the campaign's tone, and don't name new people unless a note truly needs one.",
  "A GM-only tie is a secret the players don't know yet: write it as the truth the GM keeps.",
].join(" ");

const plain = (s: string) => s.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_, page: string, label?: string) => (label || page).trim()).replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim();
const excerpt = (e: Entry, max = 300) => { const t = plain(e.body ?? ""); return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t; };
const kindWord = (e: Entry) => e.kind === "faction" ? "organization" : e.kind;

/**
 * Leaves out what this connection may not read: a tie to a page it can't see, and a GM-only tie (or a GM-only twist on a
 * new person) when it is kept to what players see. Says how many ties were left out.
 */
export function forConnection(r: TieWriteRequest, visible: Set<string>, secrets: boolean): { request: TieWriteRequest; skipped: number } {
  const ok = (x: { id?: string }) => !x.id || visible.has(x.id);
  const ties = r.ties.filter(t => ok(t.from) && ok(t.to) && (secrets || !t.gm));
  return { request: { ...r, ties, ...(r.people ? { people: secrets ? r.people : r.people.map(p => ({ key: p.key, name: p.name })) } : {}) }, skipped: r.ties.length - ties.length };
}

/** The request as the AI reads it: the campaign, each page with a line about it, then each tie to write. */
export function tiePrompt(campaign: { name: string; description?: string }, pages: Entry[], r: TieWriteRequest): string {
  const byId = new Map(pages.map(e => [e.id, e])), seen = new Set<string>(), about: string[] = [];
  const label = (x: { id?: string; name: string }) => {
    const e = x.id ? byId.get(x.id) : undefined;
    if (e && !seen.has(e.id)) { seen.add(e.id); const t = excerpt(e); about.push(`- ${e.title} (${kindWord(e)})${t ? `: ${t}` : ""}`); }
    return e?.title ?? x.name;
  };
  const lines = r.ties.map(t => `- ${t.key}: ${label(t.from)} — ${t.tie} — ${label(t.to)}${t.gm ? " (GM only, a secret)" : ""}`);
  const people = (r.people ?? []).map(p => `- ${p.key}: ${p.name}${p.note ? ` (${p.note})` : ""}`);
  return [
    `Campaign: ${campaign.name}${campaign.description ? `. ${plain(campaign.description).slice(0, 400)}` : ""}`,
    ...(r.family ? [`This is the ${r.family} family, just generated.`] : []),
    ...(r.brief?.trim() ? [`What the GM wants: ${r.brief.trim()}`] : []),
    ...(about.length ? ["Pages already in the campaign:", ...about] : []),
    ...(lines.length ? ["Write a note for each tie, by its key:", ...lines] : []),
    ...(people.length ? ["Write one sentence (under 200 characters) introducing each new person, by their key:", ...people] : []),
  ].join("\n");
}

export const tieTool: OnceTool = {
  name: "send_notes", description: "Send the notes: one per tie, and one line per new person.",
  inputSchema: { type: "object", additionalProperties: false, required: ["notes"], properties: {
    notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "note"], properties: { key: { type: "string" }, note: { type: "string" } } } },
    bios: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "text"], properties: { key: { type: "string" }, text: { type: "string" } } } },
  } },
};

/** Keeps the notes and lines the AI sent for keys that were asked for, cut to size. */
export function readNotes(input: Record<string, unknown> | undefined, r: TieWriteRequest): TieWriteResult {
  const ties = new Set(r.ties.map(t => t.key)), people = new Set((r.people ?? []).map(p => p.key));
  const pick = (list: unknown, field: "note" | "text", allowed: Set<string>, max: number) => {
    const out: Record<string, string> = {};
    if (Array.isArray(list)) for (const x of list) {
      const k = (x as Record<string, unknown>)?.key, v = (x as Record<string, unknown>)?.[field];
      if (typeof k === "string" && allowed.has(k) && typeof v === "string" && v.trim()) out[k] = plain(v).slice(0, max);
    }
    return out;
  };
  return { notes: pick(input?.notes, "note", ties, 300), bios: pick(input?.bios, "text", people, 300) };
}

/** Writes the notes with a campaign's API-key connection. */
export async function writeTieNotes(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, r: TieWriteRequest, fetchImpl: typeof fetch = fetch) {
  if (!r.ties.length && !r.people?.length) throw Error("There is nothing to write.");
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === use.connectionId);
  if (!c?.api) throw Error("That AI connection was removed.");
  if (overLimit(c.api)) throw Error(`${c.name} has used this month's ${c.api.limit!.toLocaleString("en-US")} tokens. Raise the limit under What it may do.`);
  const ctx = await loadContext(bucket, { owner, campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) });
  const { request, skipped } = forConnection(r, new Set(ctx.book.entries.map(e => e.id)), permsOf(c).seeSecrets !== "off");
  if (!request.ties.length && !request.people?.length) throw Error(`${c.name} only sees what players see, so it can't write these. Turn on “See GM-only things” for it under What it may do.`);
  const target = targetFor(c, use.apiKey);
  let tokens = 0;
  try {
    const out = await runOnce(target, TIE_SYSTEM, tiePrompt(ctx.campaign, ctx.book.entries, request), tieTool, 4_000, fetchImpl);
    tokens = out.tokens;
    const result = readNotes(out.input, request);
    if (!Object.keys(result.notes).length && !Object.keys(result.bios).length) throw new ProviderError("The AI didn't send any notes. Try again.");
    const after = await addUsage(bucket, owner, campaignId, c.id, tokens);
    return { ...result, skipped, by: c.name, tokens, api: after?.api ? publicApi(after.api) : undefined };
  } catch (e) {
    const spent = (e as { tokens?: unknown }).tokens;
    tokens += typeof spent === "number" ? spent : 0;
    if (tokens) await addUsage(bucket, owner, campaignId, c.id, tokens).catch(() => null);
    throw e;
  }
}
