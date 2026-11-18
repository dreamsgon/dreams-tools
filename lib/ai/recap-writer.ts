/*
 * Writes a session recap in RPG Tools with the GM's own API key, for the New session recap dialog and
 * Write it again. It loads the campaign as that connection may see it and saves through the same tools as
 * the MCP server (save_recap and rewrite_recap), so the draft, the check list and the AI activity log work
 * exactly as when the GM's AI app writes it. The tokens count against the connection's monthly limit.
 */
import type { S3Bucket } from "../storage.ts";
import { addUsage, listConnections, overLimit, permsOf, publicApi, targetFor, type KeyUse } from "../mcp/connections.ts";
import { loadContext } from "../mcp/load.ts";
import { callTool, listTools, type McpContext } from "../mcp/tools.ts";
import { compactTranscript } from "../encyclopedia/recaps.ts";
import { IN_APP_LIMIT, RECAP_SYSTEM, beatLines, checkPrompt, defaultRequest, namesBlock, notesKeys, notesPrompt, prosePrompt, publishedRecaps, questsBlock, quoteLines, storyNow, storyPrompt, unlinkNames } from "../encyclopedia/recap-prompts.ts";
import { runOnce, ProviderError, type OnceTool } from "./chat.ts";
import { styleFor, writingStyleSchema, type WritingStyle } from "../encyclopedia/ai-styles.ts";

/** The connection that writes it, checked: an API key, allowed to write session notes, under its limit. */
async function writer(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse) {
  const c = (await listConnections(bucket, owner, campaignId)).find(x => x.id === use.connectionId);
  if (!c?.api) throw Error("That AI connection was removed.");
  if (c.level === "read" || permsOf(c).notes === "off") throw Error(`${c.name} isn't allowed to write recaps. Turn on “Session notes and recaps” for it under What it may do.`);
  if (overLimit(c.api)) throw Error(`${c.name} has used this month's ${c.api.limit!.toLocaleString("en-US")} tokens. Raise the limit under What it may do.`);
  const ctx = await loadContext(bucket, { owner, campaignId, connectionId: c.id, level: c.level, ...(c.perms ? { perms: c.perms } : {}) });
  return { c, ctx, target: targetFor(c, use.apiKey) };
}

function sessionPage(ctx: McpContext, id: string) {
  const page = ctx.book.entries.find(e => e.id === id && e.kind === "session" && e.campaignId === ctx.campaign.id);
  if (!page) throw Error("That session page is gone.");
  return page;
}

/** Runs a tool as the GM asked for it, and returns its reply, or throws its error. */
async function save(ctx: McpContext, name: string, args: Record<string, unknown>) {
  const out = await callTool(ctx, name, args, { approved: true }) as { content: { type: string; text?: string }[]; isError: boolean };
  const text = out.content.map(x => x.text ?? "").join("\n");
  if (out.isError) throw Error(text);
  return JSON.parse(text) as { saved?: { id: string; title: string }; toCheck?: string[]; added?: string[] };
}

/** save_recap's lists, as the tool the first request must call. */
function notesTool(): OnceTool {
  const full = listTools("run").find(t => t.name === "save_recap")!.inputSchema as { properties: Record<string, unknown> };
  return {
    name: "save_notes", description: "Send your notes on the session: the timeline, quotes, what changed in the world, and GM notes.",
    inputSchema: { type: "object", properties: Object.fromEntries(notesKeys.map(k => [k, full.properties[k]])), required: ["timeline"], additionalProperties: false },
  };
}

/** Counts what was used, even when it failed part way. */
async function counted<T>(bucket: S3Bucket, owner: string, campaignId: string, id: string, job: (add: (n: number) => void) => Promise<T>) {
  let tokens = 0;
  const add = (n: number) => { tokens += n; };
  try {
    const out = await job(add);
    const after = await addUsage(bucket, owner, campaignId, id, tokens);
    return { ...out, tokens, api: after?.api ? publicApi(after.api) : undefined };
  } catch (e) {
    const spent = (e as { tokens?: unknown }).tokens;
    if (typeof spent === "number") add(spent);
    if (tokens) await addUsage(bucket, owner, campaignId, id, tokens).catch(() => null);
    throw e;
  }
}

/** Writes the recap the GM asked for in the New session recap dialog: notes from the transcript, then the recap from the timeline. */
export async function writeRecap(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, entryId: string, fetchImpl: typeof fetch = fetch) {
  const { c, ctx, target } = await writer(bucket, owner, campaignId, use);
  const page = sessionPage(ctx, entryId);
  if (!ctx.transcript) throw Error(`${c.name} can't read transcripts, which are GM-only. Turn on “See GM-only things” for it, or hand the recap to your AI app.`);
  const raw = await ctx.transcript(page.id);
  if (!raw?.trim()) throw Error(`“${page.title}” has no transcript. Paste one on its Transcript tab first.`);
  const transcript = compactTranscript(raw);
  if (transcript.length > IN_APP_LIMIT) throw Error("That transcript is too long to write here in one go. Hand it to your AI app, which reads it in parts.");
  const request = page.recap?.request ?? defaultRequest, scope = { worldId: ctx.campaign.worldId, campaignId: ctx.campaign.id };
  const head = { campaign: ctx.campaign.name, title: page.title, playedOn: page.recap?.playedOn, request, names: namesBlock(ctx.book.entries, scope) };
  return counted(bucket, owner, campaignId, c.id, async add => {
    const first = await runOnce(target, RECAP_SYSTEM, notesPrompt({ ...head, quests: questsBlock(ctx.book, scope), transcript }), notesTool(), 12_000, fetchImpl);
    add(first.tokens);
    if (!first.input) throw new ProviderError("The AI didn't send its notes on the session. Try again, or hand it to your AI app.");
    const notes = Object.fromEntries(notesKeys.filter(k => first.input![k] !== undefined).map(k => [k, first.input![k]]));
    let recap = "(Left out.)";
    if (!request.skip?.includes("recap")) {
      const style = styleFor(ctx.campaign.aiWriting, "recap", request.style);
      const second = await runOnce(target, RECAP_SYSTEM, prosePrompt({ ...head, style, timeline: beatLines(notes.timeline), quotes: quoteLines(notes.quotes) }), null, 6_000, fetchImpl);
      add(second.tokens);
      recap = second.text.trim();
      if (!recap) throw new ProviderError("The AI sent an empty recap. Try again.");
    }
    let saved;
    try { saved = await save(ctx, "save_recap", { page: page.id, title: page.title, ...(page.recap?.source ? { source: page.recap.source } : {}), ...(page.recap?.playedOn ? { playedOn: page.recap.playedOn } : {}), recap, timeline: [], ...notes }); }
    catch (e) { throw Error(`The AI's draft didn't fit: ${e instanceof Error ? e.message : "it was malformed"} Try again.`); }
    return { saved: saved.saved, toCheck: saved.toCheck?.length ?? 0, by: c.name };
  });
}

/** Write it again: the recap players read, from the page's timeline as it is now, with the GM's note, in the style picked (or the recap's own). */
export async function writeRecapAgain(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, entryId: string, note: string, fetchImpl: typeof fetch = fetch, styleId?: string) {
  const { c, ctx, target } = await writer(bucket, owner, campaignId, use);
  const page = sessionPage(ctx, entryId);
  if (!page.recap) throw Error("That page has no recap.");
  if (page.recap.status !== "draft") throw Error("Unpublish the recap before writing it again.");
  if (!page.recap.timeline.length) throw Error("The recap is written from the timeline, and this one is empty. Add a beat first.");
  const scope = { worldId: ctx.campaign.worldId, campaignId: ctx.campaign.id };
  const style = styleFor(ctx.campaign.aiWriting, "recap", styleId ?? page.recap.request?.style);
  const request = { ...(page.recap.request ?? defaultRequest), ...(styleId ? { length: style.length } : {}) };
  const prompt = prosePrompt({
    campaign: ctx.campaign.name, title: page.title, playedOn: page.recap.playedOn, request, style, names: namesBlock(ctx.book.entries, scope),
    timeline: beatLines(page.recap.timeline), quotes: quoteLines(page.recap.quotes), before: unlinkNames(page.body), note: note.slice(0, 500),
  });
  return counted(bucket, owner, campaignId, c.id, async add => {
    const out = await runOnce(target, RECAP_SYSTEM, prompt, null, 6_000, fetchImpl);
    add(out.tokens);
    if (!out.text.trim()) throw new ProviderError("The AI sent an empty recap. Try again.");
    await save(ctx, "rewrite_recap", { page: page.id, recap: out.text.trim() });
    return { saved: { id: page.id, title: page.title }, by: c.name };
  });
}

/**
 * Check it with AI, on a recap the GM wrote: the AI reads the recap and lists what it mentions in the check
 * list (through add_recap_finds, so it shows in the AI activity log). The recap text is never changed.
 */
export async function checkRecap(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, entryId: string, fetchImpl: typeof fetch = fetch) {
  const { c, ctx, target } = await writer(bucket, owner, campaignId, use);
  const page = ctx.book.entries.find(e => e.id === entryId && e.kind === "session" && e.campaignId === ctx.campaign.id);
  if (!page) throw Error(ctx.transcript ? "That session page is gone." : `${c.name} can't read draft recaps, which are GM-only. Turn on “See GM-only things” for it under What it may do.`);
  if (!page.recap) throw Error("That page has no recap.");
  const recap = unlinkNames(page.body).trim();
  if (!recap) throw Error("Write the recap first, then check it.");
  const scope = { worldId: ctx.campaign.worldId, campaignId: ctx.campaign.id };
  const prompt = checkPrompt({ campaign: ctx.campaign.name, title: page.title, playedOn: page.recap.playedOn, names: namesBlock(ctx.book.entries, scope), quests: questsBlock(ctx.book, scope), recap });
  return counted(bucket, owner, campaignId, c.id, async add => {
    const out = await runOnce(target, RECAP_SYSTEM, prompt, findsTool(), 6_000, fetchImpl);
    add(out.tokens);
    if (!out.input) throw new ProviderError("The AI didn't send what it found. Try again.");
    const lists = Object.fromEntries((["found", "quests", "codex"] as const).filter(k => out.input![k] !== undefined).map(k => [k, out.input![k]]));
    let saved;
    try { saved = await save(ctx, "add_recap_finds", { page: page.id, ...lists }); }
    catch (e) { throw Error(`What the AI found didn't fit: ${e instanceof Error ? e.message : "it was malformed"} Try again.`); }
    return { saved: saved.saved, added: saved.added?.length ?? 0, by: c.name };
  });
}

/** add_recap_finds' lists, as the tool Check it with AI must call. */
function findsTool(): OnceTool {
  const full = listTools("run").find(t => t.name === "add_recap_finds")!.inputSchema as { properties: Record<string, unknown> };
  const { page: _page, ...properties } = full.properties;
  return { name: "save_finds", description: "Send what the recap mentions: new or changed people, places and things, quests that moved, and codex finds.", inputSchema: { type: "object", properties, additionalProperties: false } };
}

/**
 * The story so far for the players' front page, from the recaps players can read. Nothing is saved: the
 * text goes back to the front page editor, where it waits beside the GM's own text until they pick.
 * `keep` starts from the current text; `note` is what the GM asks for.
 */
export async function writeStory(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, fetchImpl: typeof fetch = fetch, opts: { note?: string; keep?: boolean; before?: string; styleId?: string; length?: WritingStyle["length"] } = {}) {
  const { c, ctx, target } = await writer(bucket, owner, campaignId, use);
  const { recaps, left } = publishedRecaps(ctx.book.entries, ctx.campaign.id);
  if (!recaps.length) throw Error("Publish a session recap first. The story so far is written only from recaps players can read.");
  const before = opts.keep === false ? "" : opts.before ?? storyNow(ctx.campaign);
  const style = styleFor(ctx.campaign.aiWriting, "story", opts.styleId);
  const prompt = storyPrompt({ campaign: ctx.campaign.name, recaps, left, before, note: opts.note?.slice(0, 500), style, length: opts.length });
  return counted(bucket, owner, campaignId, c.id, async add => {
    const out = await runOnce(target, RECAP_SYSTEM, prompt, null, 2_000, fetchImpl);
    add(out.tokens);
    const text = out.text.trim().slice(0, 6000);
    if (!text) throw new ProviderError("The AI sent an empty story. Try again.");
    return { text, from: recaps.length, by: c.name };
  });
}

/**
 * A sample in a style the GM is setting up, before they save or use it: a recap of one session (from its
 * timeline, or the recap text when there is none) or The story so far. Nothing is saved.
 */
export async function writeSample(bucket: S3Bucket, owner: string, campaignId: string, use: KeyUse, input: { kind: "recap" | "story"; style: unknown; entryId?: string }, fetchImpl: typeof fetch = fetch) {
  const style = writingStyleSchema.parse(input.style);
  const { c, ctx, target } = await writer(bucket, owner, campaignId, use);
  const scope = { worldId: ctx.campaign.worldId, campaignId: ctx.campaign.id };
  let prompt: string;
  if (input.kind === "story") {
    const { recaps, left } = publishedRecaps(ctx.book.entries, ctx.campaign.id);
    if (!recaps.length) throw Error("Publish a session recap first. The story so far is written only from recaps players can read.");
    prompt = storyPrompt({ campaign: ctx.campaign.name, recaps, left, style });
  } else {
    const page = ctx.book.entries.find(e => e.id === input.entryId && e.kind === "session" && e.campaignId === ctx.campaign.id && e.recap);
    if (!page?.recap) throw Error(ctx.transcript ? "Pick a session with a recap to try it on." : `${c.name} can't read draft recaps, which are GM-only. Turn on “See GM-only things” for it under What it may do.`);
    const timeline = beatLines(page.recap.timeline) || unlinkNames(page.body).trim();
    if (!timeline) throw Error(`“${page.title}” has no timeline or recap text to write from yet.`);
    prompt = prosePrompt({ campaign: ctx.campaign.name, title: page.title, playedOn: page.recap.playedOn, request: { ...(page.recap.request ?? defaultRequest), length: style.length }, style, names: namesBlock(ctx.book.entries, scope), timeline, quotes: quoteLines(page.recap.quotes) });
  }
  return counted(bucket, owner, campaignId, c.id, async add => {
    const out = await runOnce(target, RECAP_SYSTEM, prompt, null, 4_000, fetchImpl);
    add(out.tokens);
    if (!out.text.trim()) throw new ProviderError("The AI sent an empty sample. Try again.");
    return { text: out.text.trim().slice(0, 8000), by: c.name };
  });
}
