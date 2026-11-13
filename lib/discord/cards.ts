/*
 * How posts look in Discord: each is a card (an embed) with its own colour, so a busy channel is easy to
 * scan. Pure functions; the senders attach the pictures they name (attachment://avatar.png, map.webp…).
 */
import type { Embed, Post } from "./send.ts";

export const colors = { roll: 0x1f6f68, enemy: 0xc0392b, crit: 0xe0a030, fumble: 0x80848e, initiative: 0x1f6f68, map: 0x3d6fb6, narration: 0x8e6cc4, recap: 0x5f6870, test: 0x1f6f68 };
const line = (s: string, max: number) => s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** Discord markdown would turn * _ ~ ` | > into styling; dice details should read as written. */
const literal = (s: string) => s.replace(/([\\*_~`|>#[\]()-])/g, "\\$1");

/** The kept die of a single d20 roll, for "Natural 20!" and "Natural 1". */
export function naturalD20(formula: string, detail: string): number | null {
  if (!/^\s*1?d20(?!\d)/i.test(formula) || /d20.*d20/i.test(formula) || /k[hl]?\d|adv|dis/i.test(formula)) return null;
  const first = /^[\s([]*(\d{1,2})(?!\d)/.exec(detail);
  const n = first ? Number(first[1]) : NaN;
  return n >= 1 && n <= 20 ? n : null;
}

/** The name before " · " or " — " in a roll title: "Bog Hag · Claws" → "Bog Hag". */
export const rollerName = (title: string) => title.split(/\s+[·—–]\s+/)[0]?.trim() ?? "";

export type RollCard = {
  /** What the roll is for, e.g. "Claws against Bram". */
  title: string; formula: string; total: number; detail: string;
  /** Who rolled, shown with their picture when `avatar` is set. */
  who?: string; avatar?: boolean; enemy?: boolean;
  /** A small line under the card, e.g. "Greyfen marsh · rolled by the AI". */
  footer?: string; natural?: number | null;
};

export function rollPost(r: RollCard): Post {
  const natural = r.natural === undefined ? naturalD20(r.formula, r.detail) : r.natural;
  const crit = natural === 20, fumble = natural === 1;
  const title = line(r.title, 200) + (crit ? " · Natural 20!" : fumble ? " · Natural 1" : "");
  const embed: Embed = {
    color: crit ? colors.crit : fumble ? colors.fumble : r.enemy ? colors.enemy : colors.roll,
    title,
    description: `## ${r.total}\n\`${line(r.formula, 200).replace(/`/g, "'")}\`${r.detail ? ` · ${literal(line(r.detail, 900))}` : ""}`,
    ...(r.who ? { author: { name: line(r.who, 120), ...(r.avatar ? { icon_url: "attachment://avatar.png" } : {}) } } : {}),
    ...(r.footer ? { footer: { text: line(r.footer, 200) } } : {}),
  };
  return { embeds: [embed] };
}

export type InitiativeView = { round: number | null; current: string; next: string | null; rows: { initiative: string; name: string; active: boolean; skipped: boolean; stats: string[]; detail: string }[] };

export function initiativePost(sceneName: string, v: InitiativeView): Post {
  const rows = v.rows.map(r => {
    const info = [...r.stats, ...(r.detail ? [r.detail] : [])].join(" · ");
    const name = literal(r.name) + (r.skipped ? " (skipped)" : "");
    return `\`${r.initiative.padStart(3)}\` ${r.active ? `▶ **${name}**` : name}${info ? ` — ${literal(info)}` : ""}`;
  });
  let description = rows.join("\n");
  if (description.length > 3900) description = description.slice(0, 3900) + "\n…";
  const status = v.round === null ? "" : v.current === "Not started" ? "Not started yet" : `${v.current}’s turn${v.next ? ` · next: ${v.next}` : ""}`;
  return { embeds: [{
    color: colors.initiative,
    title: line(sceneName, 200) + (v.round === null ? " · Initiative" : ` · Round ${v.round}`),
    description: (status ? `*${literal(status)}*\n\n` : "") + description,
  }] };
}

export function mapPost(sceneName: string, caption: string, fileName: string): Post {
  const text = caption.trim().slice(0, 1900);
  return { embeds: [{ color: colors.map, title: line(sceneName, 200), ...(text ? { description: text } : {}), image: { url: `attachment://${fileName}` } }] };
}

export function textPost(kind: "narration" | "recap", text: string, title?: string): Post {
  return { embeds: [{ color: colors[kind], ...(title?.trim() ? { title: line(title, 200) } : {}), description: text.trim().slice(0, 4000) }] };
}

export function testPost(campaign: string, channel: string): Post {
  return { embeds: [{ color: colors.test, title: "RPG Tools is connected", description: `Posts for **${literal(line(campaign, 120))}** that you send to “${literal(line(channel, 80))}” will appear here.` }] };
}
