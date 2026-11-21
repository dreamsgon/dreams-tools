/*
 * A page's entry type: one of the built-in kinds, or one of the GM's own types (a page template with a name and an
 * icon, built on a kind). New entry starts a page as one; Change type turns a page into another. Changing keeps the
 * title, text, tabs, tags, links, picture and where it sits; what only the old kind had (a map, a quest's goals…)
 * is left out, and the caller asks first (typeChangeLoses).
 */
import type { Entry, PageTemplate, Workspace, World } from "./world-model.ts";
import { kindChangeLoses, stripForKind, KIND_LABELS, type EntryKind } from "./entry-kinds.ts";
import { applyTemplate, templateOf } from "./templates.ts";
import { newMap } from "./map-model.ts";
import { defaultOrg } from "./org-profile.ts";
import { defaultProfile } from "./character-profile.ts";
import { newVehicle, vehicleTypesOf } from "./vehicles.ts";
import { newStore } from "./stores.ts";
import { newGalaxy } from "./galaxies.ts";
import { newSector } from "./sectors.ts";
import { newStarSystem } from "./star-systems.ts";

/** A type to pick: a built-in kind, or one of the world's templates. */
export type EntryType = { kind: EntryKind; templateId?: undefined } | { templateId: string; kind?: undefined };

const defaultCharacter = (): NonNullable<Entry["character"]> => ({ role: "npc", group: "", tags: [], location: "", faction: "", status: "active", statsVisibility: "gm", statsByCampaign: {} });

/** What a new page of this kind starts with besides its text (a blank map, a profile…). Nothing for plain kinds. */
export function kindStarts(kind: EntryKind, world: World | undefined, title: string): Partial<Entry> {
  switch (kind) {
    case "character": return { character: defaultCharacter(), profile: defaultProfile(world) };
    case "map": return { mapData: newMap() };
    case "faction": return { org: defaultOrg(world) };
    case "vehicle": return { vehicle: newVehicle(vehicleTypesOf(world)[0]) };
    case "store": return { store: newStore("shop") };
    case "galaxy": return { galaxy: newGalaxy(title) };
    case "sector": return { sector: newSector(title) };
    case "system": return { starSystem: newStarSystem(title) };
    default: return {};
  }
}

/** The type a page is now: its template when it has one, otherwise its kind. */
export function typeOf(s: Workspace, e: Entry): EntryType {
  const t = templateOf(s, e);
  return t ? { templateId: t.id } : { kind: e.kind };
}

/** The name of a page's type: its template's name when it has one ("Tavern"), otherwise the kind's ("Place"). */
export function typeName(s: Workspace, e: Entry): string {
  return templateOf(s, e)?.name ?? KIND_LABELS[e.kind];
}

function targetOf(s: Workspace, e: Entry, to: EntryType): { kind: EntryKind; template?: PageTemplate } {
  if (to.templateId === undefined) return { kind: to.kind };
  const t = s.worlds.find(w => w.id === e.worldId)?.templates?.find(x => x.id === to.templateId);
  if (!t) throw new Error("That entry type is no longer in this world.");
  return { kind: t.kind, template: t };
}

/** What the page would lose by becoming `to`, for the confirm: "the map", "the Tavern info box"… Empty when nothing. */
export function typeChangeLoses(s: Workspace, e: Entry, to: EntryType): string[] {
  const { kind, template } = targetOf(s, e, to), old = templateOf(s, e);
  const lost = kindChangeLoses(e, kind);
  if (old && old.id !== template?.id && e.fields && Object.keys(e.fields).length) lost.push(`what's filled in on the ${old.name} info box`);
  return lost;
}

/**
 * Turns a page into another type. Its own parts that don't fit the new kind are left out, it gets what a new page of
 * that kind starts with, and a GM type's template is used on it (info box, tabs, layout). The icon follows the type
 * unless the page chose its own.
 */
export function changeEntryType(s: Workspace, entryId: string, to: EntryType, newId: () => string, now = new Date().toISOString()): Workspace {
  const e = s.entries.find(x => x.id === entryId);
  if (!e) throw new Error("That page is no longer here.");
  const world = s.worlds.find(w => w.id === e.worldId), { kind, template } = targetOf(s, e, to), old = templateOf(s, e);
  if (template?.campaignId && e.campaignId && template.campaignId !== e.campaignId) throw new Error(`${template.name} belongs to another campaign.`);
  if (kind === "map" && s.entries.some(x => x.parentId === e.id)) throw new Error("A map can't hold other pages. Move the pages inside it first.");
  const next: Entry = stripForKind(e, kind);
  const starts = kindStarts(kind, world, e.title);
  for (const [k, v] of Object.entries(starts)) if ((next as Record<string, unknown>)[k] === undefined) (next as Record<string, unknown>)[k] = v;
  if (kind === "tasks" && !e.body.trim()) next.body = "- [ ] First task\n";
  // Leaving the old GM type: its info box goes (unless the new one is the same template).
  if (old && old.id !== template?.id) { delete next.templateId; delete next.fields; }
  // The icon came with the old type: it goes with it, and the new type's comes in. An icon the GM chose stays.
  const iconFromType = !e.pageLook?.icon || e.pageLook.icon === old?.icon;
  const icon = iconFromType ? template?.icon : e.pageLook?.icon;
  const look = { ...(next.pageLook ?? {}) };
  if (icon) look.icon = icon; else delete look.icon;
  next.pageLook = Object.keys(look).length ? look : undefined;
  if (!next.pageLook) delete next.pageLook;
  next.updatedAt = now;
  let out: Workspace = { ...s, entries: s.entries.map(x => x.id === entryId ? next : x) };
  if (template) out = applyTemplate(out, entryId, template.id, newId, now);
  return out;
}
