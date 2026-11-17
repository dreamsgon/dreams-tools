import { modKey, renameStatRefs, statNumber, statRolls, MAX_STAT_ROLLS, type StatRoll } from './stat-rolls.ts';
import type { StatField, Workspace } from './world-model.ts';

/*
 * Score boxes: a number stat with look "score" shows like a D&D ability, the modifier big and the score under it.
 * Sheets imported or built before score boxes often keep a score and its modifier as two stats, like "Strength score"
 * and "Strength modifier". combineScorePairs turns each such pair into one box. Everything here is pure.
 */

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export type ScorePair = { name: string; score: StatField; mod: StatField };

/**
 * Pairs in the same group named "<Name> score" (or just "<Name>") and "<Name> modifier" (or "mod"), the score a number.
 * A pair is skipped when another stat is already called <Name>, or the score is already a box.
 */
export function scorePairs(fields: readonly StatField[]): ScorePair[] {
  const live = fields.filter(f => !f.archived), out: ScorePair[] = [];
  for (const score of live) {
    // "Strength score" or plain "Strength", with "Strength modifier" (or "mod") in the same group.
    const name = score.label.match(/^(.*\S)\s+score$/i)?.[1] ?? score.label.trim();
    if (!name || score.type !== 'number' || score.look === 'score' || /\s(?:modifier|mod)$/i.test(name)) continue;
    const re = new RegExp(`^${escape(name)}\\s+(?:modifier|mod)$`, 'i');
    const mod = live.find(f => f !== score && f.section === score.section && re.test(f.label.trim()) && (f.type === 'number' || f.type === 'text'));
    const twin = (l: string) => l === name.toLowerCase() || l === `${name.toLowerCase()} score`;
    if (!mod || live.some(f => f !== score && twin(f.label.trim().toLowerCase()))) continue;
    out.push({ name, score, mod });
  }
  return out;
}

/** `{value}` inside braces read as another name, so a modifier's roll keeps rolling the modifier once it moves. */
const valueAs = (text: string, name: string) => text.replace(/\{([^{}]*)\}/g, (_, inner: string) => `{${inner.replace(/(?<![\p{L}\p{N}_])value(?![\p{L}\p{N}_])/giu, name)}}`);

/**
 * The campaign's form and every character's values with each pair made one score box: the score stat takes the plain
 * name and the modifier's rolls, the modifier stat is archived (Stat form can bring it back, its values are kept), each
 * character's modifier is copied beside their score, and rolls that named either stat read {Name} and {Name mod}.
 */
export function combineScorePairs(s: Workspace, campaignId: string): { data: Workspace; combined: string[] } {
  const c = s.campaigns.find(x => x.id === campaignId);
  const pairs = scorePairs(c?.statFields ?? []);
  if (!c || !pairs.length) return { data: s, combined: [] };
  let fields = c.statFields!.map(f => {
    const p = pairs.find(x => x.score.id === f.id);
    if (p) {
      const moved = statRolls(p.mod).map(r => ({ ...r, formula: valueAs(r.formula, `${p.name} mod`), ...(r.success ? { success: { ...r.success, against: valueAs(r.success.against, `${p.name} mod`) } } : {}) }));
      const own = statRolls(f), rolls: StatRoll[] = [...own, ...moved.filter(r => !own.some(o => o.name.toLowerCase() === r.name.toLowerCase()))].slice(0, MAX_STAT_ROLLS);
      const { roll: _r, rollFormula: _rf, ...rest } = f; void _r; void _rf;
      return { ...rest, look: 'score' as const, rolls };
    }
    return pairs.some(x => x.mod.id === f.id) ? { ...f, archived: true } : f;
  });
  for (const p of pairs) {
    fields = renameStatRefs(fields, p.mod.label, `${p.name} mod`);
    fields = renameStatRefs(fields, p.score.label, p.name).map(f => f.id === p.score.id ? { ...f, label: p.name } : f);
  }
  const entries = s.entries.map(e => {
    const values = e.character?.statsByCampaign[campaignId];
    if (!values) return e;
    const next = { ...values };
    for (const p of pairs) { const n = statNumber(values[p.mod.id]); if (n !== null && next[modKey(p.score.id)] == null) next[modKey(p.score.id)] = n; }
    return { ...e, character: { ...e.character!, statsByCampaign: { ...e.character!.statsByCampaign, [campaignId]: next } } };
  });
  return { data: { ...s, campaigns: s.campaigns.map(x => x.id === campaignId ? { ...x, statFields: fields } : x), entries }, combined: pairs.map(p => p.name) };
}

/** A stat that looks like Dexterity: a score box called Dexterity or Dex, which Initiative rolls from in D&D-like games. */
const dexterity = (fields: readonly StatField[]) => fields.find(f => !f.archived && f.look === 'score' && f.type === 'number' && /^dex(?:terity)?$/i.test(f.label.trim()));

/**
 * Initiative for the Quick strip: with a Dexterity score box it rolls 1d20 + its modifier and has no value of its own;
 * without one it is a number each character types (their bonus) and rolls 1d20 + it. Null when Initiative already exists.
 */
export function initiativeStat(fields: readonly StatField[], id: string): StatField | null {
  if (fields.some(f => !f.archived && f.label.trim().toLowerCase() === 'initiative')) return null;
  const dex = dexterity(fields);
  return { id, label: 'Initiative', section: '', type: dex ? 'none' : 'number', options: [], visibility: 'players', archived: false, quick: true,
    rolls: [{ name: 'Roll', formula: dex ? `1d20+{${dex.label.trim()} mod}` : '1d20+{value}' }], ...(dex ? { note: `${dex.label.trim()} modifier` } : {}) };
}
