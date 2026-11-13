/*
 * How posts look in Discord: each is a card (an embed) with its own colour, so a busy channel is easy to
 * scan. Pure functions; the senders attach the pictures they name (attachment://avatar.png, map.webp…).
 */
import type { Embed, Post } from "./send.ts";

export const colors = { roll: 0x1f6f68, enemy: 0xc0392b, crit: 0xe0a030, fumble: 0x80848e, initiative: 0x1f6f68, map: 0x3d6fb6, narration: 0x8e6cc4, recap: 0x5f6870, test: 0x1f6f68, table: 0x3d6fb6, oracle: 0x8e6cc4 };
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

/** A random table result: what came up, the roll, and any tables or dice it rolled along the way. */
export type TableCard = { title: string; text: string; roll?: string; steps?: { table: string; roll?: string; text: string }[]; footer?: string };
export function tablePost(r: TableCard): Post {
  const steps = (r.steps ?? []).slice(0, 8).map(s => `› ${literal(line(s.table, 80))}${s.roll ? ` (${literal(line(s.roll, 40))})` : ""}: ${literal(line(s.text, 200))}`);
  const roll = r.roll ? `\n\n\`${line(r.roll, 100).replace(/`/g, "'")}\`` : "";
  return { embeds: [{
    color: colors.table, title: `🎲 ${line(r.title, 200)}`,
    description: (r.text.trim().slice(0, 3000) || "Nothing came up.") + roll + (steps.length ? `\n${steps.join("\n")}` : ""),
    ...(r.footer ? { footer: { text: line(r.footer, 200) } } : {}),
  }] };
}

/** A yes or no oracle answer, with its odds, the d100 and any twist. */
export type OracleCard = { question?: string; answer: string; odds: string; chance: number; d100: number; twist?: string; tension: number; footer?: string };
export function oraclePost(r: OracleCard): Post {
  return { embeds: [{
    color: colors.oracle, title: `🔮 ${line(r.question?.trim() || "The oracle", 200)}`,
    description: `## ${literal(line(r.answer, 40))}\n${literal(line(r.odds, 60))} (${r.chance}%), d100 = ${r.d100}${r.twist ? `\n\n**Twist:** ${literal(line(r.twist, 600))}` : ""}`,
    footer: { text: line([`Tension ${r.tension}`, r.footer].filter(Boolean).join(" · "), 200) },
  }] };
}
