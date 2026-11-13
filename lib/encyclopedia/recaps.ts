/*
 * Session recaps: turning an AI's draft into a recap page, the "Check before publishing" list, and the
 * transcript helpers that keep long sessions cheap to read. Everything here is pure; routes and the MCP
 * tools load and save.
 */
import { defaultCharacter, newId, playerText, type Campaign, type Entry, type Workspace } from "./world-model.ts";
import { defaultCategory, newQuest, questCategories, questsIn } from "./quests.ts";
import { setFound } from "./codex.ts";
import { emptyRecap, recapPageKinds, type Beat, type Quote, type Recap, type RecapItem } from "./recap-schema.ts";

// ---- Transcripts ------------------------------------------------------------------------------

export const TRANSCRIPT_LIMIT = 2_000_000; // characters, about 350,000 words
/** About 5,000 tokens a part: small enough for any model, big enough that a session is a handful of parts. */
export const PART_SIZE = 20_000;

export const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;

const FILLER = /^(?:u+m+|u+h+|h+m+|o+k(?:ay)?|ya?e?a?h+|yep|nope|lol|lmao|haha+|ha|mhm+|right|sure|\.{2,}|…)[\s.!?,]*$/i;
const STAMP = /^\s*(?:\[\s*\d{1,2}(?::\d{2}){1,2}(?:\s*[ap]m)?\s*\]|\(\s*\d{1,2}(?::\d{2}){1,2}\s*\)|\d{1,2}(?::\d{2}){1,2}(?:\s*[ap]m)?\s*[-–—|]?)\s*/i;
const SPEAKER = /^([^:\n]{1,60}):\s+(.*)$/;

/**
 * A shorter transcript that says the same thing: timestamps go, lines that are only filler ("um", "ok", "lol")
 * go, and lines in a row from the same speaker join into one. Nothing anyone actually said is reworded,
 * so quotes still check against it.
 */
export function compactTranscript(text: string) {
  const out: { who: string | null; says: string }[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(STAMP, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const m = SPEAKER.exec(line), who = m ? m[1].trim() : null, says = (m ? m[2] : line).trim();
    if (!says || FILLER.test(says)) continue;
    const last = out.at(-1);
    if (last && who !== null && last.who === who) last.says += ` ${says}`;
    else out.push({ who, says });
  }
  return out.map(l => l.who === null ? l.says : `${l.who}: ${l.says}`).join("\n");
}

/** Splits text into parts of about `size` characters, only at line ends (or spaces in a very long line). */
export function transcriptParts(text: string, size = PART_SIZE) {
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    let rest = line;
    while (rest.length > size) { // One enormous line: cut it at a space.
      const cut = rest.lastIndexOf(" ", size) > size / 2 ? rest.lastIndexOf(" ", size) : size;
      if (current) { parts.push(current); current = ""; }
      parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart();
    }
    if (current && current.length + rest.length + 1 > size) { parts.push(current); current = ""; }
    current = current ? `${current}\n${rest}` : rest;
  }
  if (current) parts.push(current);
  return parts.length ? parts : [""];
}

const plain = (s: string) => s.toLowerCase().replace(/[“”"‘’'`.,!?;:()\-–—…*_]/g, " ").replace(/\s+/g, " ").trim();
/** True when the quote's words appear in the transcript in that order (punctuation and case aside). */
export const quoteInTranscript = (quote: string, transcript: string) => !!plain(quote) && plain(transcript).includes(plain(quote));

// ---- Names and links --------------------------------------------------------------------------

type Scope = { worldId: string; campaignId: string };
const inScope = (e: Entry, c: Scope) => e.worldId === c.worldId && (e.campaignId === null || e.campaignId === c.campaignId);
const findPage = (entries: Entry[], name: string, c: Scope, kinds?: Entry["kind"][]) => {
  const q = name.trim().toLowerCase(), pool = entries.filter(e => e.kind !== "folder" && inScope(e, c) && (!kinds || kinds.includes(e.kind)));
  const exact = pool.filter(e => e.title.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const starts = pool.filter(e => e.title.toLowerCase().startsWith(q) || q.startsWith(e.title.toLowerCase()) && e.title.length >= 4);
  return exact.length === 0 && starts.length === 1 ? starts[0] : undefined;
};

/** Turns [[Name]] into a link to the page of that name. Names without a page stay as they are. */
export function linkNames(text: string, entries: Entry[], c: Scope) {
  return text.replace(/\[\[([^\]|\n]{1,160})\]\]/g, (all, name: string) => {
    if (/^(?:table:|maptable:|\d*d\d)/i.test(name)) return all; // Tables, battle maps and rolls aren't names.
    const page = findPage(entries, name, c);
    return page ? `[[${page.id}|${name.trim()}]]` : all;
  });
}
const linkOne = (text: string, name: string, id: string) => text.replace(new RegExp(`\\[\\[${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\]`, "gi"), m => `[[${id}|${m.slice(2, -2).trim()}]]`);

// ---- A draft from the AI ----------------------------------------------------------------------

export type AiRecap = {
  title: string; playedOn?: string; source?: string; recap: string; gmNotes?: string;
  timeline: { title: string; big?: boolean; steps?: string[] }[];
  quotes?: { text: string; who?: string }[];
  found?: { name: string; kind?: string; text: string; playersSee?: boolean }[];
  quests?: { quest: string; log?: string; tick?: string; playersSee?: boolean }[];
  codex?: { page: string; label?: string }[];
};

/**
 * Builds the recap page from what the AI sent: links names that have pages, matches what it found to
 * existing pages (an update) or not (a new page), and matches quests. Nothing outside the page changes:
 * every match waits in the review list. `existing` is a draft page to fill (from the New session recap dialog).
 */
export function draftRecap(ws: Workspace, campaign: Campaign, input: AiRecap, opts: { by: string; now: Date; existing?: Entry; transcript?: string | null; folderId?: string | null }) {
  const c = { worldId: campaign.worldId, campaignId: campaign.id }, entries = ws.entries;
  const review: RecapItem[] = [];
  for (const f of input.found ?? []) {
    const page = findPage(entries, f.name, c, ["character", "place", "faction", "lore", "note", "quest"]);
    const pageKind = (recapPageKinds as readonly string[]).includes(f.kind ?? "") ? f.kind as RecapItem["pageKind"] : "note";
    review.push(page
      ? { id: newId(), kind: "update", name: page.title, pageId: page.id, text: f.text, state: "open" }
      : { id: newId(), kind: "newPage", name: f.name.trim(), pageKind, text: f.text, ...(f.playersSee ? { playersSee: true } : {}), state: "open" });
  }
  const quests = questsIn(ws, campaign.worldId, campaign.id);
  for (const q of input.quests ?? []) {
    const low = q.quest.trim().toLowerCase(), match = quests.find(x => x.entry.title.toLowerCase() === low) ?? (quests.filter(x => x.entry.title.toLowerCase().startsWith(low)).length === 1 ? quests.find(x => x.entry.title.toLowerCase().startsWith(low)) : undefined);
    review.push(match
      ? { id: newId(), kind: "questLog", name: match.entry.title, pageId: match.entry.id, text: q.log ?? "", ...(q.tick ? { tick: q.tick } : {}), ...(q.playersSee ? { playersSee: true } : {}), state: "open" }
      : { id: newId(), kind: "newQuest", name: q.quest.trim(), text: q.log ?? "", ...(q.playersSee ? { playersSee: true } : {}), state: "open" });
  }
  for (const k of input.codex ?? []) {
    const page = findPage(entries, k.page, c);
    if (page?.codex) review.push({ id: newId(), kind: "codex", name: page.title, pageId: page.id, text: k.label ?? "", state: "open" });
  }
  const timeline: Beat[] = input.timeline.map(b => ({ id: newId(), title: b.title.trim(), big: !!b.big, steps: (b.steps ?? []).map(s => s.trim()).filter(Boolean) }));
  const quotes: Quote[] = (input.quotes ?? []).map(q => ({ id: newId(), text: q.text.trim(), who: (q.who ?? "").trim(), ...(opts.transcript ? { checked: quoteInTranscript(q.text, opts.transcript) } : {}) }));
  const before = opts.existing?.recap ?? emptyRecap();
  const recap: Recap = {
    ...before, status: "draft", by: opts.by.slice(0, 80), timeline, quotes, gmNotes: input.gmNotes ?? "", review: [...before.review.filter(r => r.state !== "open"), ...review].slice(-80),
    ...(input.source ? { source: input.source.slice(0, 200) } : {}), ...(input.playedOn ? { playedOn: input.playedOn } : {}),
  };
  const body = linkNames(input.recap, entries, c), at = opts.now.toISOString();
  if (opts.existing) return { ...opts.existing, title: input.title, body, recap, overviewVisibility: undefined, updatedAt: at } satisfies Entry;
  return { id: newId(), worldId: campaign.worldId, campaignId: campaign.id, parentId: opts.folderId ?? null, title: input.title, kind: "session", body, recap, updatedAt: at } satisfies Entry;
}

/** The campaign's session notes folder, if it has one. */
export const sessionFolder = (ws: Workspace, campaignId: string) => ws.entries.find(e => e.kind === "folder" && e.campaignId === campaignId && /session/i.test(e.title)) ?? null;

// ---- Check before publishing ------------------------------------------------------------------

const patch = (ws: Workspace, id: string, f: (e: Entry) => Entry): Workspace => ({ ...ws, entries: ws.entries.map(e => e.id === id ? f(e) : e) });
const setItem = (e: Entry, itemId: string, p: Partial<RecapItem>): Entry => ({ ...e, recap: { ...e.recap!, review: e.recap!.review.map(r => r.id === itemId ? { ...r, ...p } : r) } });

/**
 * Does one item from the list: makes the page, adds the line, writes the quest log, and marks it done.
 * Returns the new workspace and a sentence for the GM, or throws a message when it can't.
 */
export function applyItem(ws: Workspace, recapId: string, itemId: string, now = new Date()): { next: Workspace; message: string } {
  const page = ws.entries.find(e => e.id === recapId), item = page?.recap?.review.find(r => r.id === itemId);
  if (!page?.recap || !item) throw Error("That item is gone. Reload the page.");
  if (item.state !== "open") return { next: ws, message: "Already done." };
  const at = now.toISOString(), campaignId = page.campaignId, scope = { worldId: page.worldId, campaignId: campaignId ?? "" };
  if (!campaignId) throw Error("This recap isn't in a campaign.");
  const label = page.title.slice(0, 80), from = `*From [[${page.id}|${page.title.replace(/[\]|]/g, "")}]]:* `;
  const target = item.pageId ? ws.entries.find(e => e.id === item.pageId) : undefined;
  if (item.pageId && (!target || !inScope(target, scope))) throw Error(`“${item.name}” is gone or isn't in this campaign any more.`);
  let next = ws, message: string, done: Partial<RecapItem> = { state: "done" };
  if (item.kind === "newPage" || item.kind === "newQuest") {
    const campaign = ws.campaigns.find(x => x.id === campaignId)!, id = newId(), quest = item.kind === "newQuest";
    const kind: Entry["kind"] = quest ? "quest" : item.pageKind ?? "note";
    const entry: Entry = {
      id, worldId: page.worldId, campaignId, parentId: null, title: item.name, kind, body: `${item.text ? `${item.text}\n\n` : ""}*From [[${page.id}|${page.title.replace(/[\]|]/g, "")}]].*`, updatedAt: at,
      ...(item.playersSee ? { overviewVisibility: "players" as const } : {}),
      ...(kind === "character" ? { character: defaultCharacter() } : {}),
      ...(quest ? { quest: newQuest("rumour", defaultCategory(questCategories(campaign))) } : {}),
    };
    next = { ...ws, entries: [...ws.entries, entry] };
    next = patch(next, page.id, e => ({ ...e, body: linkOne(e.body, item.name, id) }));
    message = `Made the ${quest ? "quest" : `${kind} page`} “${item.name}”${item.playersSee ? "" : ", GM only"}.`;
    done = { state: "done", pageId: id };
  } else if (item.kind === "update") {
    const body = `${target!.body.trimEnd()}${target!.body.trim() ? "\n\n" : ""}${from}${item.text}`;
    if (body.length > 100000) throw Error(`“${target!.title}” is at its length limit.`);
    next = patch(ws, target!.id, e => ({ ...e, body, updatedAt: at }));
    message = `Added to “${target!.title}”.`;
  } else if (item.kind === "questLog") {
    const quest = target!.quest ?? newQuest();
    let objectives = quest.objectives, ticked = "";
    if (item.tick) {
      const low = item.tick.toLowerCase(), o = objectives.find(x => x.text.toLowerCase() === low) ?? objectives.find(x => x.text.toLowerCase().startsWith(low));
      if (o) { objectives = objectives.map(x => x === o ? { ...x, done: true } : x); ticked = ` and ticked “${o.text}”`; }
    }
    const log = item.text ? [...quest.log, { id: newId(), at, label, text: item.text, players: !!item.playersSee }].slice(-500) : quest.log;
    next = patch(ws, target!.id, e => ({ ...e, quest: { ...quest, objectives, log }, updatedAt: at }));
    message = `${item.text ? "Wrote in" : "Updated"} the log of “${target!.title}”${ticked}.`;
  } else {
    if (!target!.codex) throw Error(`“${target!.title}” isn't in the codex.`);
    next = patch(ws, target!.id, e => ({ ...e, codex: setFound(e.codex!, campaignId, true, item.text || label, at), updatedAt: at }));
    message = `Marked “${target!.title}” found in the codex.`;
  }
  return { next: patch(next, page.id, e => setItem(e, item.id, done)), message };
}

export const skipItem = (ws: Workspace, recapId: string, itemId: string) => patch(ws, recapId, e => e.recap ? setItem(e, itemId, { state: "skipped" }) : e);

/** Publishing shows the Recap tab to players; unpublishing hides the page again. */
export const publishRecap = (ws: Workspace, recapId: string, publish: boolean, now = new Date()) => patch(ws, recapId, e => e.recap
  ? { ...e, recap: { ...e.recap, status: publish ? "published" : "draft" }, overviewVisibility: publish ? "players" : "gm", updatedAt: now.toISOString() }
  : e);

/** The recap text for a Discord post: secrets out, links turned into their names, up to 4,000 characters. */
export const discordText = (body: string) => {
  const text = playerText(body).replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1").trim();
  return text.length > 4000 ? `${text.slice(0, 3990).trimEnd()}…` : text;
};

export const openItems = (r: Recap | undefined) => (r?.review ?? []).filter(x => x.state === "open");
