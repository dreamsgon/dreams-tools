/*
 * Session recaps: turning an AI's draft into a recap page, the "Check before publishing" list, and the
 * transcript helpers that keep long sessions cheap to read. Everything here is pure; routes and the MCP
 * tools load and save.
 */
import { defaultCharacter, newId, playerText, type Campaign, type Entry, type Workspace } from "./world-model.ts";
import { defaultCategory, newQuest, questCategories, questsIn } from "./quests.ts";
import { setFound } from "./codex.ts";
import { honourSkips, keepNotes } from "./recap-request.ts";
import { honourExtract, isOn, readGameDate } from "./recap-extract.ts";
import { emptyInventory, putItem } from "./items.ts";
import { canHoldTie, putTie } from "./tie-edit.ts";
import { tieFits, tieTypeById, tieTypesOf, type TieType } from "./ties.ts";
import { formatDate, sameDate } from "./calendar-model.ts";
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
  moments?: string[]; spotlights?: { who: string; text: string }[]; encounters?: { name: string; outcome?: string }[];
  partyStatus?: string; next?: string[]; threads?: string[];
  loot?: { item: string; who?: string; qty?: number; note?: string }[];
  ties?: { from: string; to: string; kind?: string; note?: string; playersSee?: boolean }[];
  gameDate?: { day?: number; month?: string; year?: number };
};

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\b(?:of|with|to|by|the|a|is|are)\b/g, " ").replace(/\s+/g, " ").trim();
/** The kind of tie the AI named (Ally of, Rival of, serves), read from where it starts: a kind's own name, or its other name (reversed). Unknown: Connected to. */
export function matchTieKind(types: TieType[], kind: string | undefined): { typeId: string; reversed: boolean; known: boolean } {
  const k = words(kind ?? "");
  if (k) for (const t of types) {
    if (t.id === k || words(t.name) === k) return { typeId: t.id, reversed: false, known: true };
    if (t.reverse && words(t.reverse) === k) return { typeId: t.id, reversed: true, known: true };
  }
  if (k) for (const t of types) if (words(t.name).split(" ")[0] === k.split(" ")[0] && k.split(" ")[0].length >= 4) return { typeId: t.id, reversed: false, known: true };
  return { typeId: "linked", reversed: false, known: false };
}

/**
 * Builds the recap page from what the AI sent: links names that have pages, matches what it found to
 * existing pages (an update) or not (a new page), and matches quests. Nothing outside the page changes:
 * every match waits in the review list. `existing` is a draft page to fill (from the New session recap dialog).
 */
export function draftRecap(ws: Workspace, campaign: Campaign, input: AiRecap, opts: { by: string; now: Date; existing?: Entry; transcript?: string | null; folderId?: string | null }) {
  input = honourExtract(honourSkips(input, opts.existing?.recap?.request), campaign.aiWriting?.extract);
  const c = { worldId: campaign.worldId, campaignId: campaign.id }, entries = ws.entries;
  const review = findItems(ws, campaign, input);
  const timeline: Beat[] = input.timeline.map(b => ({ id: newId(), title: b.title.trim(), big: !!b.big, steps: (b.steps ?? []).map(s => s.trim()).filter(Boolean) }));
  const quotes: Quote[] = (input.quotes ?? []).map(q => ({ id: newId(), text: q.text.trim(), who: (q.who ?? "").trim(), ...(opts.transcript ? { checked: quoteInTranscript(q.text, opts.transcript) } : {}) }));
  const before = opts.existing?.recap ?? emptyRecap();
  const lines = (l?: string[]) => (l ?? []).map(x => x.trim()).filter(Boolean);
  const recap: Recap = {
    ...before, status: "draft", by: opts.by.slice(0, 80), mine: undefined, timeline, quotes, gmNotes: input.gmNotes ?? "",
    moments: lines(input.moments), spotlights: (input.spotlights ?? []).filter(x => x.who.trim() && x.text.trim()), encounters: (input.encounters ?? []).filter(x => x.name.trim()).map(x => ({ name: x.name.trim(), outcome: (x.outcome ?? "").trim() })),
    partyStatus: (input.partyStatus ?? "").trim() || undefined, next: lines(input.next), threads: lines(input.threads), review: [...before.review.filter(r => r.state !== "open"), ...review].slice(-80),
    ...(input.source ? { source: input.source.slice(0, 200) } : {}), ...(input.playedOn ? { playedOn: input.playedOn } : {}),
  };
  const body = linkNames(input.recap, entries, c), at = opts.now.toISOString();
  if (opts.existing) return { ...opts.existing, ...keepNotes(opts.existing), title: input.title, body, recap, overviewVisibility: undefined, updatedAt: at } satisfies Entry;
  return { id: newId(), worldId: campaign.worldId, campaignId: campaign.id, parentId: opts.folderId ?? null, title: input.title, kind: "session", body, recap, updatedAt: at } satisfies Entry;
}

/** What the AI found: people, places and things, quest moves and codex finds, matched to pages. Each waits in the check list. */
export type AiFinds = Pick<AiRecap, "found" | "quests" | "codex" | "loot" | "ties" | "gameDate">;

/** Turns what the AI found into check list items: a match to an existing page is an update, anything else is new. */
export function findItems(ws: Workspace, campaign: Campaign, input: AiFinds) {
  const c = { worldId: campaign.worldId, campaignId: campaign.id }, entries = ws.entries, x = campaign.aiWriting?.extract;
  input = honourExtract(input, x);
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
    if (!isOn(x, match ? "quests" : "rumours")) continue;
    review.push(match
      ? { id: newId(), kind: "questLog", name: match.entry.title, pageId: match.entry.id, text: q.log ?? "", ...(q.tick ? { tick: q.tick } : {}), ...(q.playersSee ? { playersSee: true } : {}), state: "open" }
      : { id: newId(), kind: "newQuest", name: q.quest.trim(), text: q.log ?? "", ...(q.playersSee ? { playersSee: true } : {}), state: "open" });
  }
  for (const k of input.codex ?? []) {
    const page = findPage(entries, k.page, c);
    if (page?.codex) review.push({ id: newId(), kind: "codex", name: page.title, pageId: page.id, text: k.label ?? "", state: "open" });
  }
  for (const l of input.loot ?? []) {
    const name = l.item.trim().slice(0, 160), who = l.who?.trim() && !/^(?:the )?(?:party|group|everyone|all)$/i.test(l.who.trim()) ? findPage(entries, l.who, c, ["character"]) : undefined;
    const qty = Number.isInteger(l.qty) && l.qty! > 1 ? Math.min(l.qty!, 1_000_000) : undefined;
    if (name) review.push({ id: newId(), kind: "loot", name, ...(who ? { pageId: who.id } : {}), ...(qty ? { qty } : {}), text: (l.note ?? "").trim().slice(0, 4000), state: "open" });
  }
  const types = tieTypesOf(ws.worlds.find(w => w.id === campaign.worldId));
  for (const t of input.ties ?? []) {
    const a = findPage(entries, t.from, c), b = findPage(entries, t.to, c), kind = matchTieKind(types, t.kind);
    if (!t.from.trim() || !t.to.trim() || (a && b && a.id === b.id)) continue;
    const note = [kind.known ? "" : (t.kind ?? "").trim(), (t.note ?? "").trim()].filter(Boolean).join(": ").slice(0, 300);
    review.push({ id: newId(), kind: "tie", name: a?.title ?? t.from.trim().slice(0, 160), ...(a ? { pageId: a.id } : {}), to: b?.title ?? t.to.trim().slice(0, 160), ...(b ? { toId: b.id } : {}),
      typeId: kind.typeId, ...(kind.reversed ? { reversed: true } : {}), text: note, ...(t.playersSee ? { playersSee: true } : {}), state: "open" });
  }
  const calendar = campaign.calendars?.[0], date = readGameDate(calendar, input.gameDate);
  if (calendar && date && !sameDate(calendar.current, date)) review.push({ id: newId(), kind: "date", name: formatDate(calendar, date), calendarId: calendar.id, date, text: "", state: "open" });
  return review;
}

/**
 * Check it with AI: adds what the AI found in a recap to its check list, leaving the recap text, timeline and
 * quotes as they are. Something already waiting in the list (the same kind and name) isn't added twice.
 */
export function addFinds(ws: Workspace, campaign: Campaign, page: Entry, input: AiFinds) {
  if (!page.recap) throw Error(`“${page.title}” has no recap.`);
  const waiting = new Set(openItems(page.recap).map(r => `${r.kind}:${r.name.toLowerCase()}`));
  const added = findItems(ws, campaign, input).filter(r => { const k = `${r.kind}:${r.name.toLowerCase()}`; if (waiting.has(k)) return false; waiting.add(k); return true; });
  return { added, entry: { ...page, recap: { ...page.recap, review: [...page.recap.review, ...added].slice(-80) } } satisfies Entry };
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
    const pk = item.pageKind ?? "note", creature = pk === "creature", kind: Entry["kind"] = quest ? "quest" : pk === "creature" ? "character" : pk;
    const entry: Entry = {
      id, worldId: page.worldId, campaignId, parentId: null, title: item.name, kind, body: `${item.text ? `${item.text}\n\n` : ""}*From [[${page.id}|${page.title.replace(/[\]|]/g, "")}]].*`, updatedAt: at,
      ...(item.playersSee ? { overviewVisibility: "players" as const } : {}),
      ...(kind === "character" ? { character: { ...defaultCharacter(), ...(creature ? { role: "creature" as const } : {}) } } : {}),
      ...(quest ? { quest: newQuest("rumour", defaultCategory(questCategories(campaign))) } : {}),
    };
    next = { ...ws, entries: [...ws.entries, entry] };
    next = patch(next, page.id, e => ({ ...e, body: linkOne(e.body, item.name, id) }));
    message = `Made the ${quest ? "quest" : `${creature ? "creature" : kind} page`} “${item.name}”${item.playersSee ? "" : ", GM only"}.`;
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
  } else if (item.kind === "loot") {
    if (!target) throw Error(`Choose who carries “${item.name}” first.`);
    if (target.kind !== "character" || !target.character) throw Error(`“${target.title}” isn't a character, so it has no inventory.`);
    const inv = target.character.inventory ?? emptyInventory(), qty = item.qty ?? 1;
    const items = putItem(inv.items, { name: item.name.slice(0, 80), ...(item.text ? { note: item.text.slice(0, 2000) } : {}) }, qty, newId);
    next = patch(ws, target.id, e => ({ ...e, character: { ...e.character!, inventory: { ...inv, items } }, updatedAt: at }));
    message = `Added ${qty > 1 ? `${qty} × ` : ""}“${item.name}” to ${target.title}’s inventory.`;
  } else if (item.kind === "tie") {
    const find = (id: string | undefined, name: string | undefined) => (id ? ws.entries.find(e => e.id === id) : undefined) ?? (name ? findPage(ws.entries, name, scope) : undefined);
    const a = find(item.pageId, item.name), b = find(item.toId, item.to);
    if (!a || !b) throw Error(`Make the page for “${!a ? item.name : item.to}” first, then add this tie.`);
    if (a.id === b.id) throw Error("A page can't have a tie to itself.");
    const types = tieTypesOf(ws.worlds.find(w => w.id === page.worldId));
    let type = tieTypeById(types, item.typeId ?? "linked"), [owner, other] = item.reversed ? [b, a] : [a, b];
    const fits = (t: TieType, o: Entry, x: Entry) => tieFits(t, o.kind, x.kind) && canHoldTie(o, x);
    if (!fits(type, owner, other) && type.both && fits(type, other, owner)) [owner, other] = [other, owner];
    if (!fits(type, owner, other)) { type = tieTypeById(types, "linked"); if (!fits(type, owner, other)) [owner, other] = [other, owner]; }
    if ((owner.ties ?? []).some(t => t.toId === other.id && t.typeId === type.id)) message = `${owner.title} already has that tie to ${other.title}.`;
    else {
      const put = putTie(ws, owner.id, { id: newId(), toId: other.id, typeId: type.id, ...(item.text ? { note: item.text.slice(0, 300) } : {}), ...(item.playersSee ? {} : { gm: true }) }, at);
      if (!put) throw Error(`“${owner.title}” has as many ties as it can hold.`);
      next = put;
      message = `Tied ${owner.title} to ${other.title}: ${type.name}${item.playersSee ? "" : ", GM only"}.`;
    }
    done = { state: "done", pageId: a.id, toId: b.id };
  } else if (item.kind === "date") {
    const campaign = ws.campaigns.find(x => x.id === campaignId), calendar = campaign?.calendars?.find(x => x.id === item.calendarId);
    if (!campaign || !calendar || !item.date) throw Error("That calendar is gone.");
    if (!calendar.periods.some(p => p.id === item.date!.periodId)) throw Error(`${calendar.name} doesn't have that month any more.`);
    const title = page.title.slice(0, 100), has = calendar.events.some(ev => ev.title === title && sameDate(ev.date, item.date!));
    const events = has || calendar.events.length >= 1000 ? calendar.events : [...calendar.events, { id: newId(), title, notes: "Session recap.", date: item.date, annual: false, visibility: "gm" as const }];
    next = { ...ws, campaigns: ws.campaigns.map(x => x.id === campaignId ? { ...x, calendars: x.calendars!.map(k => k.id === calendar.id ? { ...k, current: item.date!, events } : k) } : x) };
    message = `Moved ${calendar.name} on to ${formatDate(calendar, item.date)}${has ? "" : `, with “${title}” on that day`}.`;
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
