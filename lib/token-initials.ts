/** Token initials shown on picture-less tokens. Pure logic, no UI. */

const MAX_LETTERS = 4;

type Parts = { first: string[]; second: string | null; number: string };

function parts(name: string): Parts {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let number = "";
  if (words.length && /^\p{Nd}+$/u.test(words[words.length - 1])) number = words.pop()!;
  // Letters only, whole characters; words with no letters (punctuation, symbols) are skipped.
  const lettered = words.map(w => Array.from(w).filter(ch => /^\p{L}$/u.test(ch))).filter(l => l.length);
  return { first: lettered[0] ?? [], second: lettered[1]?.[0] ?? null, number };
}

/** Initials for a name using `extra` additional letters of the first word (0 = the base form). */
function build(p: Parts, extra: number): string {
  const base = p.second === null ? 2 : 1;
  const take = Math.min(base + extra, p.first.length);
  return (p.first.slice(0, take).join("") + (p.second ?? "")).toUpperCase() + p.number;
}

function maxExtra(p: Parts): number {
  const base = p.second === null ? 2 : 1;
  const cap = Math.min(p.first.length, MAX_LETTERS - (p.second === null ? 0 : 1));
  return Math.max(0, cap - base);
}

/** "Gorim Saelac" GS, "Goblin 2" GO2, "Goblin Archer 1" GA1, "Bram" BR, "12" 12, blank "". */
export function tokenInitials(name: string): string {
  return build(parts(name), 0);
}

/**
 * Initials for every token such that tokens with different names never share initials where this can be avoided.
 * Identical names share initials. On a clash, every clashing name gains the next letter of its first word
 * (GS/GS becomes GOS/GRS), up to four letters before the number; past that the clash is kept.
 * The result depends only on the set of names, never on token order.
 */
export function sceneInitials(tokens: { id: string; name: string }[]): Map<string, string> {
  const names = [...new Set(tokens.map(t => t.name.trim()))].sort();
  const info = new Map(names.map(n => [n, { p: parts(n), extra: 0 }]));
  for (;;) {
    const groups = new Map<string, string[]>();
    for (const n of names) {
      const i = info.get(n)!;
      const key = build(i.p, i.extra);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(n);
    }
    let changed = false;
    for (const [key, group] of groups) {
      if (!key || group.length < 2) continue;
      for (const n of group) {
        const i = info.get(n)!;
        if (i.extra < maxExtra(i.p)) { i.extra++; changed = true; }
      }
    }
    if (!changed) break;
  }
  const result = new Map<string, string>();
  for (const t of tokens) {
    const i = info.get(t.name.trim())!;
    result.set(t.id, build(i.p, i.extra));
  }
  return result;
}
