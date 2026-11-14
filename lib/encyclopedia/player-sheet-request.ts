/*
 * The handlers behind POST /api/encyclopedia/player-sheet and /player-roll, with who is asking, the stored workspace
 * and the network passed in so they can be tested. A signed-in member only (an `m-<ref>` campaign, never a share
 * link), same-origin only, small bodies, a per-person throttle, and the member's rights read again on every request.
 * A roll is made here from the formula stored on the sheet; a total from the browser is never read.
 */
import { z } from 'zod';
import { discordTarget } from './discord-roll.ts';
import { sheetSchema } from './sheet-link.ts';
import { readPublishedSheet, SheetReadError } from './sheet-published.ts';
import { PlayerSheetError, cleanTabs, linkSheet, linkerKey, publishedLinkOf, refreshOwnSheet, rollOf, tabsSchema, unlinkSheet } from './player-sheet.ts';
import { rollWithMode } from './roll-mode.ts';
import { checkProof, proveRoll } from './player-dice.ts';
import { createThrottle } from './throttle.ts';
import type { Rights } from './player-edit.ts';
import type { Workspace } from './world-model.ts';

export type Member = { owner: string; campaignId: string; userId: string; name: string; rights: Rights };
export type Deps = {
  /** The signed-in member for this campaign ref, "signedOut", or null (not a member, or may not open the player pages). */
  member: (ref: string) => Promise<Member | 'signedOut' | null>;
  sameOrigin: (r: Request) => boolean;
  store: { read: (owner: string) => Promise<{ data: Workspace; revision: number }>; save: (owner: string, data: Workspace, revision: number, who: { name: string; as: 'player' }) => Promise<unknown> };
  read?: typeof readPublishedSheet;
  post?: (m: Member, post: { kind: 'roll'; title: string; formula: string; total: number; detail: string; who: string; avatarOf: string }) => Promise<{ skipped: boolean }>;
  random?: () => number;
  now?: number;
};

export const SHEET_BODY = 1_000_000, ROLL_BODY = 2000, DICE_BODY = 4000;
const readThrottle = createThrottle(5, 10_000), writeThrottle = createThrottle(20, 10_000), rollThrottle = createThrottle(10, 10_000);
export const resetThrottles = () => { readThrottle.reset(); writeThrottle.reset(); rollThrottle.reset(); };

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const ref = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const sheetAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), ref, link: z.string().max(1000) }),
  z.object({ action: z.literal('link'), ref, entryId: id, sheet: z.unknown() }),
  z.object({ action: z.literal('refresh'), ref, entryId: id, tabs: tabsSchema.optional() }),
  z.object({ action: z.literal('unlink'), ref, entryId: id }),
]);
const rollAction = z.object({ ref, entryId: id, itemId: id, mode: z.enum(['normal', 'high', 'low']) });
const noLongerMember = 'You can no longer open this campaign. You may have left it, or the GM changed what your group can see.';

async function start(request: Request, deps: Deps, cap: number) {
  if (!deps.sameOrigin(request)) return { fail: json({ error: 'A same-origin request is required.' }, 403) };
  if (Number(request.headers.get('content-length') ?? 0) > cap) return { fail: json({ error: 'That request is too large.' }, 413) };
  const text = await request.text();
  if (text.length > cap) return { fail: json({ error: 'That request is too large.' }, 413) };
  return { text };
}
async function memberOf(deps: Deps, r: string) {
  const m = await deps.member(r);
  if (m === 'signedOut') return { fail: json({ error: 'Sign in to use your character sheet.' }, 401) };
  return m ? { m } : { fail: json({ error: noLongerMember }, 404) };
}
const failure = (e: unknown, fallback: string) =>
  e instanceof PlayerSheetError ? json({ error: e.message }, e.status)
  : e instanceof SheetReadError ? json({ error: e.message }, 400)
  : e instanceof z.ZodError || e instanceof SyntaxError ? json({ error: 'That request isn’t valid.' }, 400)
  : json({ error: fallback }, 500);

export async function handlePlayerSheet(request: Request, deps: Deps) {
  try {
    const got = await start(request, deps, SHEET_BODY);
    if (got.fail) return got.fail;
    const body = sheetAction.parse(JSON.parse(got.text)), found = await memberOf(deps, body.ref);
    if (found.fail) return found.fail;
    const m = found.m, linker = linkerKey(m.owner, m.campaignId, m.userId), who = { name: m.name, as: 'player' as const };
    // Reading a published link costs a trip to Google: that is the tight limit. Anything else is a save.
    const draft = body.action === 'link' ? sheetSchema.safeParse(body.sheet) : null, linkUrl = draft?.success && draft.data.source === 'published' ? draft.data.publishedUrl : undefined;
    const reads = body.action === 'read' || (body.action === 'refresh' && !body.tabs) || !!linkUrl;
    if ((reads ? readThrottle : writeThrottle).hit(m.userId, deps.now)) return json({ error: 'Too many changes too quickly. Wait a few seconds and try again.' }, 429);
    const read = deps.read ?? readPublishedSheet;

    if (body.action === 'read') {
      if (!m.rights.edit.size) return json({ error: 'You can’t change any character here. Ask your GM.' }, 403);
      return json(await read(body.link));
    }
    let tabs = body.action === 'refresh' && body.tabs ? cleanTabs(body.tabs) : undefined;
    if (body.action === 'refresh' && !tabs) {
      const link = publishedLinkOf((await deps.store.read(m.owner)).data, m.campaignId, m.rights, linker, body.entryId);
      if (!link) return json({ error: 'That sheet is read from your Google account. Press Refresh again after signing in.' }, 400);
      tabs = (await read(link)).tabs;
    }
    const linkTabs = linkUrl ? (await read(linkUrl)).tabs : undefined;
    let missing: string[] = [];
    // Changes only this page's sheet, on the newest copy, so a save that crossed someone else's tries again.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, revision } = await deps.store.read(m.owner);
      let next: Workspace;
      if (body.action === 'link') next = linkSheet(data, m.campaignId, m.rights, linker, m, { entryId: body.entryId, sheet: body.sheet, tabs: linkTabs });
      else if (body.action === 'unlink') next = unlinkSheet(data, m.campaignId, m.rights, linker, body.entryId);
      else { const r = refreshOwnSheet(data, m.campaignId, m.rights, linker, body.entryId, tabs ?? []); next = r.data; missing = r.missing; }
      if (await deps.store.save(m.owner, next, revision, who)) return json({ ok: true, ...(missing.length ? { missing } : {}) });
    }
    return json({ error: 'The campaign is busy. Try again in a moment.' }, 409);
  } catch (e) { return failure(e, 'Could not save your sheet. Keep this tab open and try again.'); }
}

export async function handlePlayerRoll(request: Request, deps: Deps) {
  try {
    const got = await start(request, deps, ROLL_BODY);
    if (got.fail) return got.fail;
    const body = rollAction.parse(JSON.parse(got.text)), found = await memberOf(deps, body.ref);
    if (found.fail) return found.fail;
    const m = found.m;
    if (rollThrottle.hit(m.userId, deps.now)) return json({ error: 'Rolling too quickly. Wait a few seconds and try again.' }, 429);
    const { data } = await deps.store.read(m.owner);
    const target = rollOf(data, m.campaignId, m.rights, linkerKey(m.owner, m.campaignId, m.userId), body.entryId, body.itemId);
    const rolled = rollWithMode(target.formula, body.mode, deps.random);
    const title = `${target.character} · ${target.name}`;
    // The server's roll is the one that counts. With no Discord channel set up it is still rolled and returned.
    let discord: 'sent' | 'skipped' | 'none' | 'failed' = 'none';
    let channel = true;
    try { discordTarget(data, m.campaignId); } catch { channel = false; }
    if (channel && deps.post) {
      try { discord = (await deps.post(m, { kind: 'roll', title, formula: rolled.formula, total: rolled.total, detail: rolled.detail, who: target.character, avatarOf: target.entryId })).skipped ? 'skipped' : 'sent'; }
      catch { discord = 'failed'; }
    }
    return json({ title, formula: rolled.formula, total: rolled.total, detail: rolled.detail, breakdown: rolled.breakdown, discord });
  } catch (e) { return failure(e, 'Could not roll. Try again.'); }
}

const diceAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('roll'), ref, formula: z.string().trim().min(1).max(200), label: z.string().max(120).optional() }),
  z.object({ action: z.literal('send'), ref, label: z.string().max(120).optional(),
    proof: z.object({ formula: z.string().max(200), total: z.number().finite(), detail: z.string().max(1200), at: z.number().int(), sig: z.string().regex(/^[a-f0-9]{64}$/) }) }),
]);
const sent = new Set<string>();
const oneLine = (text: string | undefined, max: number) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * POST /api/encyclopedia/player-dice: a signed-in member's own dice tray. `roll` rolls any formula here (the dice limits
 * of parseDice apply) and returns the result with a proof; nothing is posted. `send` posts a rolled result to the campaign's
 * Discord, titled "<member name> · <label or formula>", after checking the proof. A total from the browser is never read.
 */
export async function handlePlayerDice(request: Request, deps: Deps) {
  try {
    const got = await start(request, deps, DICE_BODY);
    if (got.fail) return got.fail;
    const body = diceAction.parse(JSON.parse(got.text)), found = await memberOf(deps, body.ref);
    if (found.fail) return found.fail;
    const m = found.m, who = { owner: m.owner, campaignId: m.campaignId, userId: m.userId }, now = deps.now ?? Date.now();
    if (rollThrottle.hit(m.userId, deps.now)) return json({ error: 'Rolling too quickly. Wait a few seconds and try again.' }, 429);
    const { data } = await deps.store.read(m.owner);
    let channel = true;
    try { discordTarget(data, m.campaignId); } catch { channel = false; }
    const title = (formula: string) => `${oneLine(m.name, 60) || 'A player'} · ${oneLine(body.label, 80) || formula}`;
    if (body.action === 'roll') {
      let rolled;
      try { rolled = rollWithMode(body.formula, 'normal', deps.random); } catch (e) { return json({ error: e instanceof Error ? e.message : 'That formula can’t be rolled.' }, 400); }
      const proof = proveRoll(who, { formula: rolled.formula, total: rolled.total, detail: rolled.detail.slice(0, 1200) }, now);
      return json({ title: title(rolled.formula), formula: rolled.formula, total: rolled.total, detail: proof.detail, proof, discord: channel ? 'available' : 'none' });
    }
    const p = body.proof;
    if (!checkProof(who, p, now)) return json({ error: 'This roll can no longer be sent. Roll again.' }, 400);
    if (sent.has(p.sig)) return json({ error: 'This roll was already sent.' }, 409);
    if (!channel || !deps.post) return json({ error: 'This campaign has no Discord channel set up.' }, 400);
    let result;
    try { result = await deps.post(m, { kind: 'roll', title: title(p.formula), formula: p.formula, total: p.total, detail: p.detail, who: oneLine(m.name, 60) || 'A player', avatarOf: '' }); }
    catch { return json({ error: 'Could not post to Discord. Try again.' }, 502); }
    if (sent.size > 500) sent.clear();
    sent.add(p.sig);
    return json({ discord: result.skipped ? 'skipped' : 'sent' });
  } catch (e) { return failure(e, 'Could not roll. Try again.'); }
}
