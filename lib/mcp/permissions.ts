/*
 * What an AI connection may do, action by action: "do" acts and logs it, "ask" waits in the AI panel for
 * the GM's OK, "off" hides the tools and refuses them. Three ready-made sets: Help me run the game (the AI
 * is the GM's helper), Run the game (the AI is the GM) and Read only. Changing one action makes it Custom.
 *
 * Connections made before these settings only have a level (read, assist or run). Their actions are read
 * from the level, so they keep doing exactly what they did.
 */
import type { Level } from "./tools.ts";

export type Choice = "do" | "ask" | "off";
export const actions = [
  "seePicture", "seeSecrets",
  "rollOpen", "rollSecret", "postDiscord",
  "writePages", "quests", "notes",
  "moveTokens", "health", "reveal", "initiative",
] as const;
export type Action = (typeof actions)[number];
export type Perms = Record<Action, Choice>;
export type Mode = "helper" | "gm" | "read";

export const actionGroups: { id: string; name: string; actions: { id: Action; name: string; hint?: string; noAsk?: true }[] }[] = [
  { id: "look", name: "Look", actions: [
    { id: "seePicture", name: "See the map as a picture", noAsk: true },
    { id: "seeSecrets", name: "See GM-only things: secrets, hidden tokens, GM notes", hint: "Turn off if it talks to players directly", noAsk: true },
  ] },
  { id: "dice", name: "Dice", actions: [
    { id: "rollOpen", name: "Roll dice in the open", hint: "Monster attacks, checks, random tables" },
    { id: "rollSecret", name: "Secret rolls only you see" },
    { id: "postDiscord", name: "Post to Discord", hint: "Its rolls, narration and recaps" },
  ] },
  { id: "encyclopedia", name: "Encyclopedia", actions: [
    { id: "writePages", name: "Write and add to pages", hint: "NPCs, places, read-aloud text" },
    { id: "quests", name: "Quest logs, objectives and codex finds" },
    { id: "notes", name: "Session notes and recaps" },
  ] },
  { id: "table", name: "The table", actions: [
    { id: "moveTokens", name: "Move tokens", hint: "Players move their own" },
    { id: "health", name: "Damage, heal and conditions" },
    { id: "reveal", name: "Reveal fog and show hidden tokens" },
    { id: "initiative", name: "Run initiative: start, next turn, end" },
  ] },
];
export const actionName = (a: Action) => actionGroups.flatMap(g => g.actions).find(x => x.id === a)!.name;

const all = (c: Choice): Perms => Object.fromEntries(actions.map(a => [a, c])) as Perms;
export const presets: Record<Mode, Perms> = {
  // You stay the GM: prep and notes straight away, anything at the table or in the open waits for your OK.
  helper: { ...all("do"), rollOpen: "ask", quests: "ask", moveTokens: "off", health: "ask", reveal: "ask", initiative: "ask" },
  gm: all("do"),
  read: { ...all("off"), seePicture: "do", seeSecrets: "do" },
};
export const modeNames: Record<Mode | "custom", string> = { helper: "Help me run the game", gm: "Run the game", read: "Read only", custom: "Custom" };

const table: Action[] = ["moveTokens", "health", "reveal", "initiative"];
const writing: Action[] = ["rollOpen", "rollSecret", "postDiscord", "writePages", "quests", "notes"];

/** The actions of a connection that only has a level. */
export function fromLevel(level: Level): Perms {
  if (level === "read") return presets.read;
  if (level === "assist") return { ...all("do"), ...Object.fromEntries(table.map(a => [a, "off"])) } as Perms;
  return presets.gm;
}
/** The level that holds every action that isn't off, so the older level checks still fit. */
export function levelFor(p: Perms): Level {
  if (table.some(a => p[a] !== "off")) return "run";
  if (writing.some(a => p[a] !== "off")) return "assist";
  return "read";
}
export const modeOf = (p: Perms): Mode | "custom" => (Object.keys(presets) as Mode[]).find(m => actions.every(a => presets[m][a] === p[a])) ?? "custom";
export const isMode = (v: unknown): v is Mode => v === "helper" || v === "gm" || v === "read";

/** Checks a set of actions from the browser. Looking can't wait for an OK, so "ask" there is refused. */
export function cleanPerms(v: unknown): Perms {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Choose what the AI may do.");
  const out = {} as Perms;
  for (const a of actions) {
    const c = (v as Record<string, unknown>)[a];
    if (c !== "do" && c !== "ask" && c !== "off") throw Error("Choose Do it, Ask me or Off for each action.");
    if (c === "ask" && (a === "seePicture" || a === "seeSecrets")) throw Error("Looking can be on or off, not Ask me.");
    out[a] = c;
  }
  return out;
}

/** Which action a tool call is. Reading is always allowed (null). */
export function toolAction(tool: string, args: Record<string, unknown> = {}): Action | null {
  switch (tool) {
    case "view_scene": return "seePicture";
    case "roll": return args.discord === false ? "rollSecret" : "rollOpen";
    case "post_to_discord": return "postDiscord";
    case "create_page": case "append_to_page": return "writePages";
    case "add_quest_log": case "set_objective": case "set_quest_state": case "add_codex_find": return "quests";
    case "write_session_notes": return "notes";
    case "move_token": return "moveTokens";
    case "damage": case "heal": case "set_condition": return "health";
    case "reveal_fog": case "show_token": return "reveal";
    case "start_combat": case "next_turn": case "end_combat": return "initiative";
    default: return null;
  }
}
