import { z } from "zod";
import { oid, text, unique, visibility } from "./org-profile.ts";
import { parseDice } from "../rolls.ts";

/*
 * Vehicles: ships, airships, carriages, cars and anything else a party rides in. A vehicle page belongs to a vehicle type,
 * which sets its stats, gauges (Hull, Fuel…), the "Right now" fields and what its commander is called. Five types come
 * ready to use (Starship, Sailing ship, Airship, Carriage, Car); a world will later keep its own edited copies.
 *
 * A vehicle stores only values: each stat, gauge and Right now field by the type's field id, each with its own eye
 * (`gm`). A field the vehicle has no value for yet takes the type's default (empty, a full gauge, the type's eye).
 * Everything here is pure. Players get an explicit allowlist (playerVehicle), never the GM object.
 */

export const vehicleArts = ["starship", "sail", "airship", "carriage", "car", "mech"] as const;
export type VehicleArt = typeof vehicleArts[number];
export const gaugeColours = ["hull", "shield", "fuel", "other"] as const;
export type GaugeColour = typeof gaugeColours[number];
export const maxSpecs = 20, maxGauges = 8, maxNow = 6, maxPips = 20, maxStations = 16, maxHands = 4, maxCrew = 60;

const label = (max: number) => z.string().trim().min(1).max(max);
export const typeSpecSchema = z.object({ id: oid, label: label(40), kind: z.enum(["text", "number"]), gm: z.boolean().optional() });
export const typeGaugeSchema = z.object({
  id: oid, label: label(40), shape: z.enum(["bar", "pips"]), colour: z.enum(gaugeColours), max: z.number().int().min(1).max(100000),
  unit: text(16).optional(), gm: z.boolean().optional(),
});
export const typeNowSchema = z.object({ id: oid, label: label(40), gm: z.boolean().optional() });
/** A seat a character can take. `pic`: shown on the Overview (on the picture); otherwise only in the Crew tab. */
export const typeStationSchema = z.object({ id: oid, label: label(40), pic: z.boolean() });
/** An unnamed crew count, such as Marines or Outriders. */
export const typeHandSchema = z.object({ id: oid, label: label(30) });
export const vehicleTypeSchema = z.object({
  id: oid, name: label(40), one: label(30), art: z.enum(vehicleArts), commander: label(30),
  /** What the Crew tab is called: Crew, Retinue, Passengers… */
  crew: label(30),
  /** Optional (added later): what the Hold and Systems tabs are called, and the unit cargo is counted in. */
  hold: label(30).optional(), holdUnit: text(16).optional(), systems: label(30).optional(),
  specs: z.array(typeSpecSchema).max(maxSpecs), gauges: z.array(typeGaugeSchema).max(maxGauges), now: z.array(typeNowSchema).max(maxNow),
  stations: z.array(typeStationSchema).max(maxStations), hands: z.array(typeHandSchema).max(maxHands),
}).superRefine((t, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!unique(t.specs.map(f => f.id)) || !unique(t.gauges.map(f => f.id)) || !unique(t.now.map(f => f.id)) || !unique(t.stations.map(f => f.id)) || !unique(t.hands.map(f => f.id))) bad("Vehicle type field ids must be unique");
  if (t.gauges.some(g => g.shape === "pips" && g.max > maxPips)) bad(`A gauge drawn as pips can go up to ${maxPips}`);
});
export type VehicleType = z.infer<typeof vehicleTypeSchema>;
export type TypeSpec = z.infer<typeof typeSpecSchema>;
export type TypeGauge = z.infer<typeof typeGaugeSchema>;

const valueSchema = z.object({ id: oid, value: text(200), gm: z.boolean().optional() });
const gaugeValueSchema = z.object({ id: oid, value: z.number().int().min(0).max(100000), gm: z.boolean().optional() });
/** Who is in a seat or on the manifest: a character page, or just a name. */
const whoFields = { characterId: oid.optional(), name: text(80).optional() };
const stationSchema = z.object({ id: oid, label: label(40), pic: z.boolean(), ...whoFields, gm: z.boolean().optional() });
const crewSchema = z.object({ id: oid, ...whoFields, role: text(80).optional(), gm: z.boolean().optional() })
  .refine(c => !!c.characterId || !!c.name, { message: "A crew member needs a page or a name" });
/** A system’s roll must be dice the roller can read (lib/rolls.ts), like 2d6+1 or 1d20+5. */
export const validRoll = (f: string) => { try { parseDice(f); return true; } catch { return false; } };
export const maxCargo = 60, maxSystems = 30, maxLog = 300;
export const logKinds = ["note", "voyage", "battle", "repair", "trade"] as const;
export type LogKind = typeof logKinds[number];
export const logKindNames: Record<LogKind, string> = { note: "Note", voyage: "Voyage", battle: "Battle", repair: "Repairs", trade: "Trade" };
const logSchema = z.object({ id: oid, at: z.string().datetime(), day: text(40).optional(), kind: z.enum(logKinds), text: z.string().trim().min(1).max(2000), gm: z.boolean().optional() });
export type LogEntry = z.infer<typeof logSchema>;
export const systemStates = ["ok", "damaged", "offline"] as const;
export type SystemState = typeof systemStates[number];
export const systemStateNames: Record<SystemState, string> = { ok: "Working", damaged: "Damaged", offline: "Offline" };
const cargoSchema = z.object({ id: oid, name: z.string().trim().min(1).max(80), note: text(160).optional(), qty: z.number().min(0).max(10_000_000), gm: z.boolean().optional() });
const systemSchema = z.object({ id: oid, name: z.string().trim().min(1).max(60), state: z.enum(systemStates), note: text(160).optional(), roll: text(100).refine(f => !f || validRoll(f), { message: "That roll isn’t dice the roller understands, like 2d6+1" }).optional(), gm: z.boolean().optional() });
export type Cargo = z.infer<typeof cargoSchema>;
export type VehicleSystem = z.infer<typeof systemSchema>;
export const vehicleSchema = z.object({
  /** Whether players get the vehicle's Overview tab. */
  visibility,
  typeId: oid,
  subtitle: text(120).optional(),
  /** A character or organization page. */
  ownerId: oid.optional(), ownerGm: z.boolean().optional(),
  /** A character page: the captain, coachman, driver… */
  commanderId: oid.optional(), commanderGm: z.boolean().optional(),
  /** A place or map page, or just words. */
  locationId: oid.optional(), locationText: text(160).optional(), locationGm: z.boolean().optional(),
  specs: z.array(valueSchema).max(40),
  gauges: z.array(gaugeValueSchema).max(16),
  now: z.array(valueSchema).max(12),
  /** This vehicle's own seats. Left out, the vehicle has its type's seats, all open. */
  stations: z.array(stationSchema).max(24).optional(),
  /** Named people aboard who don't hold a seat. */
  crew: z.array(crewSchema).max(maxCrew).optional(),
  /** Unnamed counts by the type's hand id. */
  hands: z.array(gaugeValueSchema).max(8).optional(),
  /** Whether players get the Crew tab (only when they get the vehicle at all). */
  crewVisibility: visibility.optional(),
  /** The Hold tab: what it can carry (in the type's unit) and what it carries. */
  capacity: z.number().min(0).max(10_000_000).optional(),
  cargo: z.array(cargoSchema).max(maxCargo).optional(),
  holdVisibility: visibility.optional(),
  /** The Systems tab: guns, engines, sails, spells… each with a state and an optional roll. */
  systems: z.array(systemSchema).max(maxSystems).optional(),
  systemsVisibility: visibility.optional(),
  /** The Log tab: what happened to the vehicle, newest first. */
  log: z.array(logSchema).max(maxLog).optional(),
  logVisibility: visibility.optional(),
}).superRefine((v, ctx) => {
  if (!unique(v.specs.map(x => x.id)) || !unique(v.gauges.map(x => x.id)) || !unique(v.now.map(x => x.id)) || !unique((v.stations ?? []).map(x => x.id)) || !unique((v.crew ?? []).map(x => x.id)) || !unique((v.hands ?? []).map(x => x.id)) || !unique((v.cargo ?? []).map(x => x.id)) || !unique((v.systems ?? []).map(x => x.id)) || !unique((v.log ?? []).map(x => x.id))) ctx.addIssue({ code: "custom", message: "Vehicle value ids must be unique" });
});
export type Vehicle = z.infer<typeof vehicleSchema>;

const spec = (id: string, l: string, kind: "text" | "number" = "text", gm?: boolean): TypeSpec => ({ id, label: l, kind, ...(gm ? { gm } : {}) });
const gauge = (id: string, l: string, shape: "bar" | "pips", colour: GaugeColour, max: number, unit?: string): TypeGauge => ({ id, label: l, shape, colour, max, ...(unit ? { unit } : {}) });
const now = (id: string, l: string, gm?: boolean) => ({ id, label: l, ...(gm ? { gm } : {}) });
const slug = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const st = (pic: string[], off: string[]) => [...pic.map(l => ({ id: slug(l), label: l, pic: true })), ...off.map(l => ({ id: slug(l), label: l, pic: false }))];
const hands = (...ls: string[]) => ls.map(l => ({ id: slug(l), label: l }));

/** The ready-made types. Their ids are fixed, so a vehicle made from one keeps finding it. */
export function starterVehicleTypes(): VehicleType[] {
  return [
    { id: "starship", name: "Starship", one: "Ship", art: "starship", commander: "Captain", crew: "Crew", hold: "Cargo hold", holdUnit: "t", systems: "Systems",
      stations: st(["Pilot", "Gunner", "Engineer", "Sensors"], ["Medic", "Quartermaster"]), hands: hands("Crew", "Marines"),
      specs: [spec("model", "Model"), spec("class", "Class"), spec("role", "Role"), spec("drive", "Drive"), spec("registry", "Registry")],
      gauges: [gauge("hull", "Hull", "bar", "hull", 40), gauge("shields", "Shields", "pips", "shield", 3), gauge("fuel", "Fuel", "bar", "fuel", 100)],
      now: [now("activity", "Activity"), now("situation", "Situation"), now("objective", "Objective", true)] },
    { id: "sailing-ship", name: "Sailing ship", one: "Ship", art: "sail", commander: "Captain", crew: "Crew", hold: "Hold", holdUnit: "casks", systems: "Guns and rigging",
      stations: st(["Helm", "Bosun", "Navigator", "Quartermaster"], ["Surgeon", "Cook"]), hands: hands("Sailors", "Marines"),
      specs: [spec("class", "Class"), spec("masts", "Masts", "number"), spec("guns", "Guns", "number"), spec("home-port", "Home port"), spec("flag", "Flag")],
      gauges: [gauge("hull", "Hull", "bar", "hull", 60), gauge("sails", "Sails", "pips", "shield", 4), gauge("supplies", "Supplies", "bar", "fuel", 30, "days")],
      now: [now("heading", "Heading"), now("weather", "Weather"), now("orders", "Orders", true)] },
    { id: "airship", name: "Airship", one: "Airship", art: "airship", commander: "Captain", crew: "Crew", hold: "Gondola hold", holdUnit: "crates", systems: "Envelope and engines",
      stations: st(["Helm", "Engineer", "Lookout"], ["Rigger"]), hands: hands("Crew", "Riggers"),
      specs: [spec("class", "Class"), spec("lift", "Lift gas"), spec("ceiling", "Ceiling"), spec("home-dock", "Home dock")],
      gauges: [gauge("envelope", "Envelope", "bar", "hull", 30), gauge("ballast", "Ballast", "pips", "shield", 5), gauge("fuel", "Fuel", "bar", "fuel", 50)],
      now: [now("heading", "Heading"), now("weather", "Weather"), now("orders", "Orders", true)] },
    { id: "carriage", name: "Carriage", one: "Coach", art: "carriage", commander: "Coachman", crew: "Retinue", hold: "Luggage", holdUnit: "trunks", systems: "Fittings",
      stations: st(["Box seat", "Footman", "Guard"], ["Outrider"]), hands: hands("Outriders", "Servants"),
      specs: [spec("make", "Make"), spec("team", "Team"), spec("seats", "Seats", "number"), spec("livery", "Livery")],
      gauges: [gauge("frame", "Frame", "bar", "hull", 20), gauge("team", "Team", "pips", "shield", 4, "horses"), gauge("fodder", "Fodder", "bar", "fuel", 10, "days")],
      now: [now("bound-for", "Bound for"), now("passengers", "Passengers"), now("hurry", "Hurry", true)] },
    { id: "car", name: "Car", one: "Car", art: "car", commander: "Driver", crew: "Passengers", hold: "Boot", holdUnit: "kg", systems: "Mods",
      stations: st(["Navigator", "Gunner"], ["Mechanic"]), hands: hands("Riders"),
      specs: [spec("make", "Make"), spec("model", "Model"), spec("year", "Year", "number"), spec("plate", "Plate"), spec("engine", "Engine")],
      gauges: [gauge("body", "Body", "bar", "hull", 30), gauge("tyres", "Tyres", "pips", "shield", 4), gauge("fuel", "Fuel", "bar", "fuel", 16, "gal")],
      now: [now("heading", "Heading"), now("tail", "On our tail"), now("plan", "Plan", true)] },
  ];
}

export const maxVehicleTypes = 30;
export const vehicleTypesSchema = z.array(vehicleTypeSchema).min(1).max(maxVehicleTypes).refine(l => unique(l.map(t => t.id)), { message: "Vehicle type ids must be unique" });
/** The vehicle types a world offers: its own once it has edited them, otherwise the five ready-made ones. */
export const vehicleTypesOf = (world?: { vehicleTypes?: VehicleType[] } | null): VehicleType[] => world?.vehicleTypes?.length ? world.vehicleTypes : starterVehicleTypes();
/** A vehicle's type; a type that is gone falls back to the first, so the page always opens. */
export function vehicleTypeOf(v: Pick<Vehicle, "typeId">, world?: { vehicleTypes?: VehicleType[] } | null): VehicleType {
  const types = vehicleTypesOf(world);
  return types.find(t => t.id === v.typeId) ?? types[0];
}

/** A new vehicle of this type: empty stats, full gauges, every eye as the type sets it, GM only until shared. */
export function newVehicle(type: VehicleType): Vehicle {
  return {
    visibility: "gm", typeId: type.id,
    specs: type.specs.map(f => ({ id: f.id, value: "", ...(f.gm ? { gm: true } : {}) })),
    gauges: type.gauges.map(g => ({ id: g.id, value: g.max, ...(g.gm ? { gm: true } : {}) })),
    now: type.now.map(f => ({ id: f.id, value: "", ...(f.gm ? { gm: true } : {}) })),
  };
}

export type SpecRow = { id: string; label: string; kind: "text" | "number"; value: string; gm: boolean };
export type GaugeRow = { id: string; label: string; shape: "bar" | "pips"; colour: GaugeColour; max: number; unit?: string; value: number; gm: boolean };
export type NowRow = { id: string; label: string; value: string; gm: boolean };

/** The type's stats with this vehicle's values. */
export const specRows = (v: Vehicle, t: VehicleType): SpecRow[] => t.specs.map(f => { const x = v.specs.find(s => s.id === f.id); return { id: f.id, label: f.label, kind: f.kind, value: x?.value ?? "", gm: x ? !!x.gm : !!f.gm }; });
/** The type's gauges with this vehicle's values, kept between 0 and the gauge's maximum. */
export const gaugeRows = (v: Vehicle, t: VehicleType): GaugeRow[] => t.gauges.map(g => { const x = v.gauges.find(s => s.id === g.id); return { id: g.id, label: g.label, shape: g.shape, colour: g.colour, max: g.max, ...(g.unit ? { unit: g.unit } : {}), value: clampGauge(x?.value ?? g.max, g.max), gm: x ? !!x.gm : !!g.gm }; });
export const nowRows = (v: Vehicle, t: VehicleType): NowRow[] => t.now.map(f => { const x = v.now.find(s => s.id === f.id); return { id: f.id, label: f.label, value: x?.value ?? "", gm: x ? !!x.gm : !!f.gm }; });
export const clampGauge = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(Number.isFinite(value) ? value : 0)));

type Part = "specs" | "now";
/** Sets one stat or Right now value (keeping its eye). */
export function setValue(v: Vehicle, t: VehicleType, part: Part, id: string, value: string): Vehicle {
  const def = (part === "specs" ? t.specs : t.now).find(f => f.id === id);
  const list = v[part], x = list.find(s => s.id === id), clean = value.trim().slice(0, 200);
  const next = x ? list.map(s => s.id === id ? { ...s, value: clean } : s) : [...list, { id, value: clean, ...(def?.gm ? { gm: true } : {}) }];
  return { ...v, [part]: next };
}
/** Shows or hides one stat, gauge or Right now value. */
export function setGm(v: Vehicle, t: VehicleType, part: Part | "gauges", id: string, gm: boolean): Vehicle {
  if (part === "gauges") {
    const g = t.gauges.find(f => f.id === id), x = v.gauges.find(s => s.id === id);
    const row = { id, value: x?.value ?? g?.max ?? 0, ...(gm ? { gm: true } : {}) };
    return { ...v, gauges: x ? v.gauges.map(s => s.id === id ? row : s) : [...v.gauges, row] };
  }
  const x = v[part].find(s => s.id === id), row = { id, value: x?.value ?? "", ...(gm ? { gm: true } : {}) };
  return { ...v, [part]: x ? v[part].map(s => s.id === id ? row : s) : [...v[part], row] };
}
/** Moves a gauge to a new value, between 0 and its maximum. */
export function setGauge(v: Vehicle, t: VehicleType, id: string, value: number): Vehicle {
  const g = t.gauges.find(f => f.id === id);
  if (!g) return v;
  const x = v.gauges.find(s => s.id === id), row = { id, value: clampGauge(value, g.max), ...((x ? x.gm : g.gm) ? { gm: true } : {}) };
  return { ...v, gauges: x ? v.gauges.map(s => s.id === id ? row : s) : [...v.gauges, row] };
}
/** How far + and − move a gauge: one pip, or a twentieth of a bar (at least 1). */
export const gaugeStep = (g: Pick<TypeGauge, "shape" | "max">) => g.shape === "pips" ? 1 : Math.max(1, Math.round(g.max / 20));

export type Who = { characterId?: string; name?: string };
export type Station = { id: string; label: string; pic: boolean; characterId?: string; name?: string; gm?: boolean };
export type CrewMember = { id: string; characterId?: string; name?: string; role?: string; gm?: boolean };
const freshId = () => crypto.randomUUID();
/** Just the who of a seat or crew row (a page, or a name). */
const seatOf = (x: Who): Who => x.characterId ? { characterId: x.characterId } : x.name ? { name: x.name } : {};

/** The vehicle's seats: its own list once it has one, otherwise its type's, all open. */
export const stationList = (v: Vehicle, t: VehicleType): Station[] => v.stations ?? t.stations.map(s => ({ id: s.id, label: s.label, pic: s.pic }));
const withStations = (v: Vehicle, t: VehicleType, f: (list: Station[]) => Station[]): Vehicle => ({ ...v, stations: f(stationList(v, t)).slice(0, 24) });
/** Adds a seat to this vehicle only (in the Crew tab until it is pinned). */
export const addStation = (v: Vehicle, t: VehicleType, label = "New station"): Vehicle => withStations(v, t, l => [...l, { id: freshId(), label: label.trim().slice(0, 40) || "Station", pic: false }]);
export const removeStation = (v: Vehicle, t: VehicleType, id: string): Vehicle => withStations(v, t, l => l.filter(s => s.id !== id));
/** Renames, pins or hides one seat. A blank name keeps the old one. */
export function editStation(v: Vehicle, t: VehicleType, id: string, patch: { label?: string; pic?: boolean; gm?: boolean }): Vehicle {
  return withStations(v, t, l => l.map(s => {
    if (s.id !== id) return s;
    const next: Station = { ...s };
    if (patch.label !== undefined) next.label = patch.label.trim().slice(0, 40) || s.label;
    if (patch.pic !== undefined) next.pic = patch.pic;
    if (patch.gm !== undefined) { if (patch.gm) next.gm = true; else delete next.gm; }
    return next;
  }));
}
/** Puts a character page or a name in a seat, or empties it. A character holds one seat at a time. */
export function seat(v: Vehicle, t: VehicleType, id: string, who: Who): Vehicle {
  const clean = who.characterId ? { characterId: who.characterId } : who.name?.trim() ? { name: who.name.trim().slice(0, 80) } : {};
  const empty = (s: Station): Station => { const { characterId: _c, name: _n, ...r } = s; void _c; void _n; return r; };
  return withStations(v, t, l => l.map(s => s.id === id ? { ...empty(s), ...clean } : clean.characterId && s.characterId === clean.characterId ? empty(s) : s));
}
/** Adds someone to the manifest (a character already there is not added twice). */
export function addCrew(v: Vehicle, who: Who, role = ""): Vehicle {
  const list = v.crew ?? [];
  if (who.characterId && list.some(c => c.characterId === who.characterId)) return v;
  const row: CrewMember = { id: freshId(), ...seatOf({ characterId: who.characterId, name: who.name?.trim().slice(0, 80) }), ...(role.trim() ? { role: role.trim().slice(0, 80) } : {}) };
  if (!row.characterId && !row.name) return v;
  return { ...v, crew: [...list, row].slice(0, maxCrew) };
}
export function editCrew(v: Vehicle, id: string, patch: { role?: string; gm?: boolean }): Vehicle {
  return { ...v, crew: (v.crew ?? []).map(c => {
    if (c.id !== id) return c;
    const next: CrewMember = { ...c };
    if (patch.role !== undefined) { const r = patch.role.trim().slice(0, 80); if (r) next.role = r; else delete next.role; }
    if (patch.gm !== undefined) { if (patch.gm) next.gm = true; else delete next.gm; }
    return next;
  }) };
}
export function removeCrew(v: Vehicle, id: string): Vehicle {
  const crew = (v.crew ?? []).filter(c => c.id !== id), out: Vehicle = { ...v, crew };
  if (!crew.length) delete out.crew;
  return out;
}
export type HandRow = { id: string; label: string; value: number; gm: boolean };
/** The type's unnamed counts with this vehicle's numbers (0 until set). */
export const handRows = (v: Vehicle, t: VehicleType): HandRow[] => t.hands.map(h => { const x = (v.hands ?? []).find(s => s.id === h.id); return { id: h.id, label: h.label, value: x?.value ?? 0, gm: !!x?.gm }; });
export function setHands(v: Vehicle, t: VehicleType, id: string, patch: { value?: number; gm?: boolean }): Vehicle {
  if (!t.hands.some(h => h.id === id)) return v;
  const list = v.hands ?? [], x = list.find(s => s.id === id);
  const value = patch.value !== undefined ? clampGauge(patch.value, 100000) : x?.value ?? 0, gm = patch.gm ?? !!x?.gm;
  const row = { id, value, ...(gm ? { gm: true } : {}) };
  return { ...v, hands: x ? list.map(s => s.id === id ? row : s) : [...list, row] };
}

export const holdTitle = (t: VehicleType) => t.hold ?? "Hold";
export const systemsTitle = (t: VehicleType) => t.systems ?? "Systems";
/** The cargo carried, all of it (GM) or only the shown lines (players get theirs from playerVehicle). */
export const cargoUsed = (v: Vehicle) => (v.cargo ?? []).reduce((n, c) => n + c.qty, 0);
const listOps = <K extends "cargo" | "systems" | "log">(key: K, max: number) => ({
  add: (v: Vehicle, row: Omit<NonNullable<Vehicle[K]>[number], "id">): Vehicle => ({ ...v, [key]: [...(v[key] ?? []), { ...row, id: freshId() }].slice(0, max) }),
  edit: (v: Vehicle, id: string, patch: Partial<NonNullable<Vehicle[K]>[number]>): Vehicle => ({ ...v, [key]: (v[key] ?? []).map(x => {
    if (x.id !== id) return x;
    const next: Record<string, unknown> = { ...x, ...patch, id };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "" || (k === "gm" && next[k] === false)) delete next[k];
    return next;
  }) }),
  remove: (v: Vehicle, id: string): Vehicle => { const rest = (v[key] ?? []).filter(x => x.id !== id), out: Vehicle = { ...v, [key]: rest }; if (!rest.length) delete out[key]; return out; },
});
export const cargoOps = listOps("cargo", maxCargo), systemOps = listOps("systems", maxSystems);
/** Log entries, newest first: a new one goes on top, and the oldest drop off past the limit. */
export const addLog = (v: Vehicle, row: { kind: LogKind; text: string; day?: string; gm?: boolean }, now = new Date()): Vehicle => {
  const text = row.text.trim().slice(0, 2000), day = row.day?.trim().slice(0, 40);
  if (!text) return v;
  return { ...v, log: [{ id: freshId(), at: now.toISOString(), kind: row.kind, text, ...(day ? { day } : {}), ...(row.gm ? { gm: true } : {}) }, ...(v.log ?? [])].slice(0, maxLog) };
};
export const logOps = listOps("log", maxLog);

/** How a character page is tied to a vehicle, for the links back from that page. */
export function vehicleRolesOf(v: Vehicle, t: VehicleType, pageId: string): string[] {
  const roles: string[] = [];
  if (v.ownerId === pageId) roles.push("Owner");
  if (v.commanderId === pageId) roles.push(t.commander);
  for (const s of stationList(v, t)) if (s.characterId === pageId) roles.push(s.label);
  for (const c of v.crew ?? []) if (c.characterId === pageId) roles.push(c.role ? `${t.crew} · ${c.role}` : t.crew);
  return roles;
}

/** The same roles from the player copy, so they name only what players can see of the vehicle. */
export function playerVehicleRoles(v: PlayerVehicle, pageId: string): string[] {
  const roles: string[] = [];
  if (v.ownerId === pageId) roles.push("Owner");
  if (v.commanderId === pageId) roles.push(v.type.commander);
  for (const s of v.stations) if (s.characterId === pageId) roles.push(s.label);
  for (const c of v.crewTab?.crew ?? []) if (c.characterId === pageId) roles.push(c.role ? `${v.crewTab!.title} · ${c.role}` : v.crewTab!.title);
  return roles;
}

/**
 * Changes a vehicle's type. Values move across by field id, then by label (so Hull stays Hull from a starship to a
 * sailing ship); values the new type has no place for are dropped.
 */
export function changeType(v: Vehicle, from: VehicleType, to: VehicleType): Vehicle {
  const carry = <F extends { id: string; label: string }, X extends { id: string }>(oldDefs: F[], newDefs: F[], values: X[]) => newDefs.flatMap(d => {
    const old = values.find(x => x.id === d.id) ?? (() => { const o = oldDefs.find(f => f.label.toLowerCase() === d.label.toLowerCase()); return o ? values.find(x => x.id === o.id) : undefined; })();
    return old ? [{ ...old, id: d.id }] : [];
  });
  const fresh = newVehicle(to);
  const gauges = carry(from.gauges, to.gauges, v.gauges).map(x => ({ ...x, value: clampGauge(x.value, to.gauges.find(g => g.id === x.id)!.max) }));
  const merge = <X extends { id: string }>(base: X[], kept: X[]) => base.map(b => kept.find(k => k.id === b.id) ?? b);
  const out: Vehicle = { ...v, typeId: to.id, specs: merge(fresh.specs, carry(from.specs, to.specs, v.specs)), gauges: merge(fresh.gauges, gauges), now: merge(fresh.now, carry(from.now, to.now, v.now)) };
  // Seats: the new type's seats, keeping whoever sat in one with the same name; seats the vehicle added, or anyone
  // whose seat has no match, stay on (in the Crew tab) so nobody is dropped.
  if (v.stations) {
    const old = v.stations, used = new Set<string>();
    const match = (d: { id: string; label: string }) => old.find(o => !used.has(o.id) && (o.id === d.id || o.label.toLowerCase() === d.label.toLowerCase()));
    const seats = to.stations.map(d => { const o = match(d); if (o) used.add(o.id); return { id: d.id, label: d.label, pic: d.pic, ...(o ? seatOf(o) : {}) }; });
    const left = old.filter(o => !used.has(o.id) && (!from.stations.some(d => d.id === o.id) || o.characterId || o.name)).map(o => ({ ...o, pic: false }));
    const ids = new Set(seats.map(x => x.id));
    out.stations = [...seats, ...left.map(o => ids.has(o.id) ? { ...o, id: freshId() } : o)].slice(0, 24);
  }
  const hands = carry(from.hands, to.hands, v.hands ?? []);
  if (hands.length) out.hands = hands; else delete out.hands;
  return out;
}

/** The pages a vehicle points at (for scope checks and renaming). */
export const vehicleRefs = (v: Vehicle) => [v.ownerId, v.commanderId, v.locationId, ...peopleRefs(v)].filter((x): x is string => !!x);
/** The character pages in a vehicle's seats and manifest (they must be characters). */
export const peopleRefs = (v: Vehicle) => [...(v.stations ?? []), ...(v.crew ?? [])].map(x => x.characterId).filter((x): x is string => !!x);
/** A copy with page ids replaced (imports), dropping any that didn't come across. */
export function remapVehicle(v: Vehicle, map: (id: string) => string | undefined): Vehicle {
  const owner = v.ownerId ? map(v.ownerId) : undefined, commander = v.commanderId ? map(v.commanderId) : undefined, location = v.locationId ? map(v.locationId) : undefined;
  const { ownerId: _o, commanderId: _c, locationId: _l, ...rest } = v;
  void _o; void _c; void _l;
  const who = <X extends { characterId?: string }>(x: X): X => { if (!x.characterId) return x; const id = map(x.characterId); const { characterId: _id, ...r } = x; void _id; return (id ? { ...r, characterId: id } : r) as X; };
  const out: Vehicle = { ...rest, ...(owner ? { ownerId: owner } : {}), ...(commander ? { commanderId: commander } : {}), ...(location ? { locationId: location } : {}) };
  if (v.stations) out.stations = v.stations.map(who);
  if (v.crew) { const crew = v.crew.map(who).filter(c => c.characterId || c.name); if (crew.length) out.crew = crew; else delete out.crew; }
  return out;
}
export const vehicleSearchText = (v?: Vehicle) => v ? [v.subtitle, v.locationText, ...v.specs.map(s => s.value), ...v.now.map(s => s.value), ...(v.stations ?? []).map(s => s.name), ...(v.crew ?? []).flatMap(c => [c.name, c.role]), ...(v.cargo ?? []).flatMap(c => [c.name, c.note]), ...(v.systems ?? []).flatMap(x => [x.name, x.note]), ...(v.log ?? []).map(l => l.text)].filter(Boolean).join(" ") : "";

export type PlayerVehicle = {
  type: { name: string; one: string; art: VehicleArt; commander: string };
  subtitle: string;
  ownerId?: string; commanderId?: string; locationId?: string; locationText?: string;
  specs: { id: string; label: string; value: string }[];
  gauges: { id: string; label: string; shape: "bar" | "pips"; colour: GaugeColour; max: number; unit?: string; value: number }[];
  now: { id: string; label: string; value: string }[];
  /** Shown seats. Without the Crew tab, only the ones on the picture. `unknown`: someone players can't read about. */
  stations: { id: string; label: string; pic: boolean; characterId?: string; name?: string; unknown?: true }[];
  /** The Crew tab, when it is shared. */
  holdTab?: { title: string; unit: string; capacity?: number; used: number; cargo: { id: string; name: string; note?: string; qty: number }[] };
  logTab?: { entries: { id: string; at: string; day?: string; kind: LogKind; text: string }[] };
  systemsTab?: { title: string; systems: { id: string; name: string; state: SystemState; note?: string; roll?: string }[] };
  crewTab?: { title: string; crew: { id: string; characterId?: string; name?: string; role?: string }[]; hands: { id: string; label: string; value: number }[] };
};
/** What players see of a shared vehicle: nothing marked GM only, links only to pages they can read, and no empty rows. */
export function playerVehicle(v: Vehicle, t: VehicleType, readable: (id: string) => boolean, clean: (text: string) => string): PlayerVehicle {
  const link = (id: string | undefined, gm: boolean | undefined) => id && !gm && readable(id) ? id : undefined;
  const ownerId = link(v.ownerId, v.ownerGm), commanderId = link(v.commanderId, v.commanderGm), locationId = link(v.locationId, v.locationGm);
  const locationText = v.locationGm ? "" : clean(v.locationText ?? "");
  const crewShared = v.crewVisibility === "players";
  // A page players can read is linked; a typed name is shown; a page they can't read becomes "unknown" in a seat.
  const who = (x: Who): { characterId?: string; name?: string; unknown?: true } => x.characterId ? (readable(x.characterId) ? { characterId: x.characterId } : { unknown: true as const }) : x.name && clean(x.name) ? { name: clean(x.name) } : {};
  return {
    type: { name: t.name, one: t.one, art: t.art, commander: t.commander },
    subtitle: clean(v.subtitle ?? ""),
    ...(ownerId ? { ownerId } : {}), ...(commanderId ? { commanderId } : {}), ...(locationId ? { locationId } : {}), ...(locationText ? { locationText } : {}),
    specs: specRows(v, t).filter(r => !r.gm).map(r => ({ id: r.id, label: r.label, value: clean(r.value) })).filter(r => r.value),
    gauges: gaugeRows(v, t).filter(r => !r.gm).map(r => ({ id: r.id, label: r.label, shape: r.shape, colour: r.colour, max: r.max, ...(r.unit ? { unit: r.unit } : {}), value: r.value })),
    now: nowRows(v, t).filter(r => !r.gm).map(r => ({ id: r.id, label: r.label, value: clean(r.value) })).filter(r => r.value),
    stations: stationList(v, t).filter(st => !st.gm && (crewShared || st.pic)).map(st => ({ id: st.id, label: clean(st.label) || "Station", pic: st.pic, ...who(st) })),
    ...(v.holdVisibility === "players" ? { holdTab: (() => {
      const cargo = (v.cargo ?? []).filter(c => !c.gm).map(c => ({ id: c.id, name: clean(c.name) || "Cargo", ...(c.note && clean(c.note) ? { note: clean(c.note) } : {}), qty: c.qty }));
      return { title: holdTitle(t), unit: t.holdUnit ?? "", ...(v.capacity !== undefined ? { capacity: v.capacity } : {}), used: cargo.reduce((n, c) => n + c.qty, 0), cargo };
    })() } : {}),
    ...(v.systemsVisibility === "players" ? { systemsTab: { title: systemsTitle(t), systems: (v.systems ?? []).filter(x => !x.gm).map(x => ({ id: x.id, name: clean(x.name) || "System", state: x.state, ...(x.note && clean(x.note) ? { note: clean(x.note) } : {}), ...(x.roll ? { roll: x.roll } : {}) })) } } : {}),
    ...(v.logVisibility === "players" ? { logTab: { entries: (v.log ?? []).filter(l => !l.gm).flatMap(l => { const t = clean(l.text); return t ? [{ id: l.id, at: l.at, ...(l.day && clean(l.day) ? { day: clean(l.day) } : {}), kind: l.kind, text: t }] : []; }) } } : {}),
    ...(crewShared ? { crewTab: {
      title: t.crew,
      crew: (v.crew ?? []).filter(c => !c.gm).flatMap(c => { const w = who(c); return w.characterId || w.name ? [{ id: c.id, ...w, ...(c.role && clean(c.role) ? { role: clean(c.role) } : {}) }] : []; }),
      hands: handRows(v, t).filter(h => !h.gm && h.value > 0).map(h => ({ id: h.id, label: h.label, value: h.value })),
    } } : {}),
  };
}

/**
 * The vehicle with everything GM-only taken out, still in the GM shape: for an AI connection that may only see what
 * players see (lib/mcp/players-only.ts). Null when the vehicle's Overview isn't shared. `clean` strips GM secrets.
 */
export function playerSafeVehicle(v: Vehicle, clean: (text: string) => string): Vehicle | null {
  if (v.visibility !== "players") return null;
  const shown = <X extends { gm?: boolean }>(l: X[] | undefined) => (l ?? []).filter(x => !x.gm);
  const crewShared = v.crewVisibility === "players";
  const out: Vehicle = {
    visibility: "players", typeId: v.typeId,
    specs: shown(v.specs).map(x => ({ ...x, value: clean(x.value) })), gauges: shown(v.gauges), now: shown(v.now).map(x => ({ ...x, value: clean(x.value) })),
    ...(v.subtitle ? { subtitle: clean(v.subtitle) } : {}),
    ...(v.ownerId && !v.ownerGm ? { ownerId: v.ownerId } : {}), ...(v.commanderId && !v.commanderGm ? { commanderId: v.commanderId } : {}),
    ...(!v.locationGm ? { ...(v.locationId ? { locationId: v.locationId } : {}), ...(v.locationText ? { locationText: clean(v.locationText) } : {}) } : {}),
  };
  if (v.stations) out.stations = shown(v.stations).filter(x => crewShared || x.pic);
  if (crewShared) { out.crewVisibility = "players"; if (v.crew) out.crew = shown(v.crew); if (v.hands) out.hands = shown(v.hands); }
  if (v.holdVisibility === "players") { out.holdVisibility = "players"; if (v.capacity !== undefined) out.capacity = v.capacity; if (v.cargo) out.cargo = shown(v.cargo); }
  if (v.systemsVisibility === "players") { out.systemsVisibility = "players"; if (v.systems) out.systems = shown(v.systems); }
  if (v.logVisibility === "players") { out.logVisibility = "players"; if (v.log) out.log = shown(v.log).map(l => ({ ...l, text: clean(l.text) || "…" })); }
  return out;
}

/** The vehicle in words and short lists, for an AI reading the page (read_page). `title` names linked pages. */
export function vehicleText(v: Vehicle, t: VehicleType, title: (id: string) => string) {
  const name = (id?: string) => id ? title(id) || undefined : undefined;
  const hidden = (gm?: boolean) => gm ? " (GM only)" : "";
  const people = (x: Who) => x.characterId ? name(x.characterId) ?? "someone" : x.name;
  return {
    type: t.name, model: v.subtitle || undefined, playersSeeOverview: v.visibility === "players",
    owner: name(v.ownerId) ? `${name(v.ownerId)}${hidden(v.ownerGm)}` : undefined,
    [t.commander.toLowerCase()]: name(v.commanderId) ? `${name(v.commanderId)}${hidden(v.commanderGm)}` : undefined,
    location: (name(v.locationId) ?? v.locationText) ? `${name(v.locationId) ?? v.locationText}${hidden(v.locationGm)}` : undefined,
    stats: specRows(v, t).filter(r => r.value).map(r => `${r.label}: ${r.value}${hidden(r.gm)}`),
    gauges: gaugeRows(v, t).map(r => `${r.label}: ${r.value}/${r.max}${r.unit ? ` ${r.unit}` : ""}${hidden(r.gm)}`),
    rightNow: nowRows(v, t).filter(r => r.value).map(r => `${r.label}: ${r.value}${hidden(r.gm)}`),
    stations: stationList(v, t).map(s => `${s.label}: ${people(s) ?? "open"}${hidden(s.gm)}`),
    crew: (v.crew ?? []).map(c => `${people(c) ?? "someone"}${c.role ? ` (${c.role})` : ""}${hidden(c.gm)}`),
    crewPlayersSee: v.crewVisibility === "players",
    counts: handRows(v, t).filter(h => h.value).map(h => `${h.label}: ${h.value}${hidden(h.gm)}`),
    hold: { title: holdTitle(t), unit: t.holdUnit, capacity: v.capacity, carrying: cargoUsed(v), playersSee: v.holdVisibility === "players", cargo: (v.cargo ?? []).map(c => `${c.qty} ${c.name}${c.note ? ` (${c.note})` : ""}${hidden(c.gm)}`) },
    systems: { title: systemsTitle(t), playersSee: v.systemsVisibility === "players", list: (v.systems ?? []).map(x => `${x.name}: ${systemStateNames[x.state]}${x.roll ? `, roll ${x.roll}` : ""}${x.note ? ` (${x.note})` : ""}${hidden(x.gm)}`) },
    log: { playersSee: v.logVisibility === "players", latest: (v.log ?? []).slice(0, 10).map(l => `${l.day ? `${l.day}: ` : ""}${logKindNames[l.kind]}: ${l.text}${hidden(l.gm)}`), entries: v.log?.length || undefined },
  };
}

/** A short id for a new type or field: its name, made safe, plus a few random letters so two with one name differ. */
export const typeFieldId = (label: string, taken: Iterable<string> = []) => {
  const used = new Set(taken), base = (slug(label) || "field").slice(0, 40);
  if (!used.has(base)) return base;
  for (;;) { const id = `${base}-${Math.random().toString(36).slice(2, 6)}`; if (!used.has(id)) return id; }
};
/** A blank type to start from. */
export const blankVehicleType = (taken: string[]): VehicleType => ({ id: typeFieldId("new-type", taken), name: "New type", one: "Vehicle", art: "car", commander: "Captain", crew: "Crew", hold: "Hold", systems: "Systems", specs: [], gauges: [], now: [], stations: [], hands: [] });
/** A copy of a type under a new id and name. */
export const copyVehicleType = (t: VehicleType, taken: string[]): VehicleType => ({ ...structuredClone(t), id: typeFieldId(`${t.id}-copy`, taken), name: `${t.name} (copy)`.slice(0, 40) });

/** The vehicles of a world, by the type they use (for "in use" counts and to keep a used type from being deleted). */
export function typeUse(entries: { kind: string; worldId: string; vehicle?: Vehicle }[], worldId: string, types: VehicleType[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) if (e.kind === "vehicle" && e.vehicle && e.worldId === worldId) { const id = (types.find(t => t.id === e.vehicle!.typeId) ?? types[0])?.id; if (id) out[id] = (out[id] ?? 0) + 1; }
  return out;
}

/**
 * A world's new list of vehicle types, with every vehicle in it tidied: values for fields its type no longer has are
 * dropped, so they don't pile up. A vehicle whose type was removed is moved to the first type, keeping matching values.
 */
export function saveVehicleTypes<W extends { id: string; vehicleTypes?: VehicleType[] }, E extends { kind: string; worldId: string; vehicle?: Vehicle }>(worlds: W[], entries: E[], worldId: string, types: VehicleType[]): { worlds: W[]; entries: E[] } {
  const parsed = vehicleTypesSchema.safeParse(types);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Those vehicle types can’t be saved.");
  const world = worlds.find(w => w.id === worldId);
  if (!world) throw new Error("That world is gone.");
  const before = vehicleTypesOf(world), next = parsed.data;
  const tidy = (v: Vehicle): Vehicle => {
    const t = next.find(x => x.id === v.typeId);
    if (!t) { const old = before.find(x => x.id === v.typeId) ?? before[0]!; return changeType(v, old, next[0]!); }
    const keep = <X extends { id: string }>(list: X[], defs: { id: string }[]) => list.filter(x => defs.some(d => d.id === x.id));
    const out: Vehicle = { ...v, specs: keep(v.specs, t.specs), gauges: keep(v.gauges, t.gauges).map(g => ({ ...g, value: clampGauge(g.value, t.gauges.find(d => d.id === g.id)!.max) })), now: keep(v.now, t.now) };
    if (v.hands) { const hands = keep(v.hands, t.hands); if (hands.length) out.hands = hands; else delete out.hands; }
    return out;
  };
  return {
    worlds: worlds.map(w => w.id === worldId ? { ...w, vehicleTypes: next } : w),
    entries: entries.map(e => e.kind === "vehicle" && e.vehicle && e.worldId === worldId ? { ...e, vehicle: tidy(e.vehicle) } : e),
  };
}
