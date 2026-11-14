import { z } from "zod";
import { oid, text, unique, visibility } from "./org-profile.ts";

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
export const maxSpecs = 20, maxGauges = 8, maxNow = 6, maxPips = 20;

const label = (max: number) => z.string().trim().min(1).max(max);
export const typeSpecSchema = z.object({ id: oid, label: label(40), kind: z.enum(["text", "number"]), gm: z.boolean().optional() });
export const typeGaugeSchema = z.object({
  id: oid, label: label(40), shape: z.enum(["bar", "pips"]), colour: z.enum(gaugeColours), max: z.number().int().min(1).max(100000),
  unit: text(16).optional(), gm: z.boolean().optional(),
});
export const typeNowSchema = z.object({ id: oid, label: label(40), gm: z.boolean().optional() });
export const vehicleTypeSchema = z.object({
  id: oid, name: label(40), one: label(30), art: z.enum(vehicleArts), commander: label(30),
  specs: z.array(typeSpecSchema).max(maxSpecs), gauges: z.array(typeGaugeSchema).max(maxGauges), now: z.array(typeNowSchema).max(maxNow),
}).superRefine((t, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!unique(t.specs.map(f => f.id)) || !unique(t.gauges.map(f => f.id)) || !unique(t.now.map(f => f.id))) bad("Vehicle type field ids must be unique");
  if (t.gauges.some(g => g.shape === "pips" && g.max > maxPips)) bad(`A gauge drawn as pips can go up to ${maxPips}`);
});
export type VehicleType = z.infer<typeof vehicleTypeSchema>;
export type TypeSpec = z.infer<typeof typeSpecSchema>;
export type TypeGauge = z.infer<typeof typeGaugeSchema>;

const valueSchema = z.object({ id: oid, value: text(200), gm: z.boolean().optional() });
const gaugeValueSchema = z.object({ id: oid, value: z.number().int().min(0).max(100000), gm: z.boolean().optional() });
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
}).superRefine((v, ctx) => {
  if (!unique(v.specs.map(x => x.id)) || !unique(v.gauges.map(x => x.id)) || !unique(v.now.map(x => x.id))) ctx.addIssue({ code: "custom", message: "Vehicle value ids must be unique" });
});
export type Vehicle = z.infer<typeof vehicleSchema>;

const spec = (id: string, l: string, kind: "text" | "number" = "text", gm?: boolean): TypeSpec => ({ id, label: l, kind, ...(gm ? { gm } : {}) });
const gauge = (id: string, l: string, shape: "bar" | "pips", colour: GaugeColour, max: number, unit?: string): TypeGauge => ({ id, label: l, shape, colour, max, ...(unit ? { unit } : {}) });
const now = (id: string, l: string, gm?: boolean) => ({ id, label: l, ...(gm ? { gm } : {}) });

/** The ready-made types. Their ids are fixed, so a vehicle made from one keeps finding it. */
export function starterVehicleTypes(): VehicleType[] {
  return [
    { id: "starship", name: "Starship", one: "Ship", art: "starship", commander: "Captain",
      specs: [spec("model", "Model"), spec("class", "Class"), spec("role", "Role"), spec("drive", "Drive"), spec("registry", "Registry")],
      gauges: [gauge("hull", "Hull", "bar", "hull", 40), gauge("shields", "Shields", "pips", "shield", 3), gauge("fuel", "Fuel", "bar", "fuel", 100)],
      now: [now("activity", "Activity"), now("situation", "Situation"), now("objective", "Objective", true)] },
    { id: "sailing-ship", name: "Sailing ship", one: "Ship", art: "sail", commander: "Captain",
      specs: [spec("class", "Class"), spec("masts", "Masts", "number"), spec("guns", "Guns", "number"), spec("home-port", "Home port"), spec("flag", "Flag")],
      gauges: [gauge("hull", "Hull", "bar", "hull", 60), gauge("sails", "Sails", "pips", "shield", 4), gauge("supplies", "Supplies", "bar", "fuel", 30, "days")],
      now: [now("heading", "Heading"), now("weather", "Weather"), now("orders", "Orders", true)] },
    { id: "airship", name: "Airship", one: "Airship", art: "airship", commander: "Captain",
      specs: [spec("class", "Class"), spec("lift", "Lift gas"), spec("ceiling", "Ceiling"), spec("home-dock", "Home dock")],
      gauges: [gauge("envelope", "Envelope", "bar", "hull", 30), gauge("ballast", "Ballast", "pips", "shield", 5), gauge("fuel", "Fuel", "bar", "fuel", 50)],
      now: [now("heading", "Heading"), now("weather", "Weather"), now("orders", "Orders", true)] },
    { id: "carriage", name: "Carriage", one: "Coach", art: "carriage", commander: "Coachman",
      specs: [spec("make", "Make"), spec("team", "Team"), spec("seats", "Seats", "number"), spec("livery", "Livery")],
      gauges: [gauge("frame", "Frame", "bar", "hull", 20), gauge("team", "Team", "pips", "shield", 4, "horses"), gauge("fodder", "Fodder", "bar", "fuel", 10, "days")],
      now: [now("bound-for", "Bound for"), now("passengers", "Passengers"), now("hurry", "Hurry", true)] },
    { id: "car", name: "Car", one: "Car", art: "car", commander: "Driver",
      specs: [spec("make", "Make"), spec("model", "Model"), spec("year", "Year", "number"), spec("plate", "Plate"), spec("engine", "Engine")],
      gauges: [gauge("body", "Body", "bar", "hull", 30), gauge("tyres", "Tyres", "pips", "shield", 4), gauge("fuel", "Fuel", "bar", "fuel", 16, "gal")],
      now: [now("heading", "Heading"), now("tail", "On our tail"), now("plan", "Plan", true)] },
  ];
}

/** The vehicle types a world offers. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a world's own types come in a later part
export const vehicleTypesOf = (_world?: unknown): VehicleType[] => starterVehicleTypes();
/** A vehicle's type; a type that is gone falls back to the first, so the page always opens. */
export function vehicleTypeOf(v: Pick<Vehicle, "typeId">, world?: unknown): VehicleType {
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
  return { ...v, typeId: to.id, specs: merge(fresh.specs, carry(from.specs, to.specs, v.specs)), gauges: merge(fresh.gauges, gauges), now: merge(fresh.now, carry(from.now, to.now, v.now)) };
}

/** The pages a vehicle points at (for scope checks and renaming). */
export const vehicleRefs = (v: Vehicle) => [v.ownerId, v.commanderId, v.locationId].filter((x): x is string => !!x);
/** A copy with page ids replaced (imports), dropping any that didn't come across. */
export function remapVehicle(v: Vehicle, map: (id: string) => string | undefined): Vehicle {
  const owner = v.ownerId ? map(v.ownerId) : undefined, commander = v.commanderId ? map(v.commanderId) : undefined, location = v.locationId ? map(v.locationId) : undefined;
  const { ownerId: _o, commanderId: _c, locationId: _l, ...rest } = v;
  void _o; void _c; void _l;
  return { ...rest, ...(owner ? { ownerId: owner } : {}), ...(commander ? { commanderId: commander } : {}), ...(location ? { locationId: location } : {}) };
}
export const vehicleSearchText = (v?: Vehicle) => v ? [v.subtitle, v.locationText, ...v.specs.map(s => s.value), ...v.now.map(s => s.value)].filter(Boolean).join(" ") : "";

export type PlayerVehicle = {
  type: { name: string; one: string; art: VehicleArt; commander: string };
  subtitle: string;
  ownerId?: string; commanderId?: string; locationId?: string; locationText?: string;
  specs: { id: string; label: string; value: string }[];
  gauges: { id: string; label: string; shape: "bar" | "pips"; colour: GaugeColour; max: number; unit?: string; value: number }[];
  now: { id: string; label: string; value: string }[];
};
/** What players see of a shared vehicle: nothing marked GM only, links only to pages they can read, and no empty rows. */
export function playerVehicle(v: Vehicle, t: VehicleType, readable: (id: string) => boolean, clean: (text: string) => string): PlayerVehicle {
  const link = (id: string | undefined, gm: boolean | undefined) => id && !gm && readable(id) ? id : undefined;
  const ownerId = link(v.ownerId, v.ownerGm), commanderId = link(v.commanderId, v.commanderGm), locationId = link(v.locationId, v.locationGm);
  const locationText = v.locationGm ? "" : clean(v.locationText ?? "");
  return {
    type: { name: t.name, one: t.one, art: t.art, commander: t.commander },
    subtitle: clean(v.subtitle ?? ""),
    ...(ownerId ? { ownerId } : {}), ...(commanderId ? { commanderId } : {}), ...(locationId ? { locationId } : {}), ...(locationText ? { locationText } : {}),
    specs: specRows(v, t).filter(r => !r.gm).map(r => ({ id: r.id, label: r.label, value: clean(r.value) })).filter(r => r.value),
    gauges: gaugeRows(v, t).filter(r => !r.gm).map(r => ({ id: r.id, label: r.label, shape: r.shape, colour: r.colour, max: r.max, ...(r.unit ? { unit: r.unit } : {}), value: r.value })),
    now: nowRows(v, t).filter(r => !r.gm).map(r => ({ id: r.id, label: r.label, value: clean(r.value) })).filter(r => r.value),
  };
}
