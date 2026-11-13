/*
 * A Maptable campaign's Discord settings: named channels (one webhook each), which channel each kind of
 * post goes to, and the name posts are made under. Saved per campaign in campaign-settings/<id>.json.
 *
 * Older saves have one main `webhook` and `webhooks` for combat, exploration and world maps. Those are read
 * as channels with the ids "default", "combat", "exploration" and "world", and a kind with no choice of its
 * own still follows the map type the way it did, so nothing changes until the GM changes something.
 */
import { parseWebhook, savedWebhook } from "./webhook.ts";

export const postKinds = ["rolls", "aiRolls", "initiative", "combatMaps", "areaMaps", "worldMaps", "narration", "recaps"] as const;
export type PostKind = (typeof postKinds)[number];
export const postKindNames: Record<PostKind, { name: string; hint: string }> = {
  rolls: { name: "Your dice rolls", hint: "From the dice tray, statblocks and pages, when you post them" },
  aiRolls: { name: "The AI’s dice rolls", hint: "Secret rolls are never posted" },
  initiative: { name: "Initiative and turns", hint: "" },
  combatMaps: { name: "Combat maps", hint: "Shared from Maptable" },
  areaMaps: { name: "Exploration maps", hint: "Shared from Maptable" },
  worldMaps: { name: "World maps", hint: "Shared from Maptable" },
  narration: { name: "The AI’s narration", hint: "Read-aloud text and NPC lines it posts" },
  recaps: { name: "Session recaps", hint: "Recaps the AI writes and posts" },
};
export type MapRoute = "combat" | "exploration" | "world";
export const mapKind = (route: MapRoute): PostKind => route === "world" ? "worldMaps" : route === "exploration" ? "areaMaps" : "combatMaps";

export type Channel = { id: string; name: string; url: string; threadId?: string; hookName?: string };
export type DiscordSettings = {
  webhook?: string; webhooks?: Record<string, string>;
  channels?: Channel[]; main?: string;
  routes?: Partial<Record<PostKind, string>>;
  postAs?: string;
};
const legacyNames: Record<string, string> = { default: "Main channel", combat: "Combat maps", exploration: "Exploration maps", world: "World maps" };

/** Every channel, with the old single webhooks read as channels. */
export function channelsOf(s: DiscordSettings): { channels: Channel[]; main: string | null } {
  if (Array.isArray(s.channels)) {
    const channels = s.channels.filter(c => c && typeof c.id === "string" && savedWebhook(c.url));
    return { channels, main: channels.some(c => c.id === s.main) ? s.main! : channels[0]?.id ?? null };
  }
  const channels: Channel[] = [];
  if (savedWebhook(s.webhook)) channels.push({ id: "default", name: legacyNames.default, url: s.webhook });
  for (const route of ["combat", "exploration", "world"]) {
    const url = s.webhooks?.[route];
    if (savedWebhook(url)) channels.push({ id: route, name: legacyNames[route], url });
  }
  return { channels, main: channels[0]?.id ?? null };
}

/**
 * Where a post goes. "off" when the GM chose not to post this kind, null when no channel is set up.
 * `legacyRoute` is the map type a post came from, which older saves used to pick the channel.
 */
export function pickChannel(s: DiscordSettings, kind: PostKind, legacyRoute?: MapRoute): Channel | "off" | null {
  const { channels, main } = channelsOf(s), chosen = s.routes?.[kind];
  if (chosen === "off") return "off";
  const byId = (id: string | null | undefined) => id ? channels.find(c => c.id === id) ?? null : null;
  return byId(chosen) ?? byId(legacyRoute) ?? byId(main);
}

/** The settings in the channel form, with the old fields dropped. Used before the first change. */
export function upgraded(s: DiscordSettings): DiscordSettings {
  const { channels, main } = channelsOf(s);
  const routes = { ...s.routes };
  // Old saves sent maps of each type to that type's webhook: keep that as an explicit choice.
  for (const [route, kind] of [["combat", "combatMaps"], ["exploration", "areaMaps"], ["world", "worldMaps"]] as const)
    if (!routes[kind] && channels.some(c => c.id === route)) routes[kind] = route;
  return { channels, ...(main ? { main } : {}), routes, ...(s.postAs ? { postAs: s.postAs } : {}) };
}

/** What the browser sees: never the webhook URLs. */
export function publicSettings(saved: DiscordSettings) {
  const s = upgraded(saved), { channels, main } = channelsOf(s);
  const routes = Object.fromEntries(postKinds.map(kind => {
    const picked = pickChannel(s, kind);
    return [kind, picked === "off" ? "off" : picked?.id ?? null];
  })) as Record<PostKind, string | null>;
  return { channels: channels.map(c => ({ id: c.id, name: c.name, hookName: c.hookName ?? null, thread: !!c.threadId })), main, routes, postAs: s.postAs ?? "" };
}
export type PublicDiscord = ReturnType<typeof publicSettings>;

export type DiscordEdit =
  | { action: "addChannel"; url: string; name?: string }
  | { action: "renameChannel"; id: string; name: string }
  | { action: "removeChannel"; id: string }
  | { action: "setMain"; id: string }
  | { action: "setRoute"; kind: string; to: string }
  | { action: "postAs"; name: string };

const cleanName = (v: unknown, max = 80) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** One change to the settings. `hookName` is the webhook's own name in Discord, read when it's added. */
export function editSettings(s: DiscordSettings, edit: DiscordEdit, opts: { newId: () => string; hookName?: string }): DiscordSettings {
  const next = upgraded(s), channels = next.channels!;
  const find = (id: unknown) => {
    const c = channels.find(c => c.id === id);
    if (!c) throw new Error("That channel is no longer here. Reload and try again.");
    return c;
  };
  switch (edit.action) {
    case "addChannel": {
      const hook = parseWebhook(edit.url);
      if (!hook) throw new Error("That isn't a Discord webhook link. In Discord: Channel settings › Integrations › Webhooks › Copy Webhook URL.");
      if (channels.some(c => c.url === hook.url && c.threadId === hook.threadId)) throw new Error("That webhook is already added.");
      if (channels.length >= 12) throw new Error("A campaign can have up to 12 channels.");
      const name = cleanName(edit.name) || cleanName(opts.hookName) || `Channel ${channels.length + 1}`;
      const id = opts.newId();
      next.channels = [...channels, { id, name, url: hook.url, ...(hook.threadId ? { threadId: hook.threadId } : {}), ...(opts.hookName ? { hookName: cleanName(opts.hookName) } : {}) }];
      if (!next.main) next.main = id;
      return next;
    }
    case "renameChannel": {
      const c = find(edit.id), name = cleanName(edit.name);
      if (!name) throw new Error("Give the channel a name.");
      next.channels = channels.map(x => x === c ? { ...x, name } : x);
      return next;
    }
    case "removeChannel": {
      const c = find(edit.id);
      next.channels = channels.filter(x => x !== c);
      // Kinds that went to it go to the main channel again.
      next.routes = Object.fromEntries(Object.entries(next.routes ?? {}).filter(([, to]) => to !== c.id));
      if (next.main === c.id) { if (next.channels[0]) next.main = next.channels[0].id; else delete next.main; }
      return next;
    }
    case "setMain": find(edit.id); next.main = edit.id; return next;
    case "setRoute": {
      if (!(postKinds as readonly string[]).includes(edit.kind)) throw new Error("Choose a kind of post.");
      const routes = { ...next.routes };
      if (edit.to === "main") delete routes[edit.kind as PostKind];
      else if (edit.to === "off") routes[edit.kind as PostKind] = "off";
      else { find(edit.to); routes[edit.kind as PostKind] = edit.to; }
      next.routes = routes;
      return next;
    }
    case "postAs": { const name = cleanName(edit.name); if (name) next.postAs = name; else delete next.postAs; return next; }
    default: throw new Error("Unknown change.");
  }
}
