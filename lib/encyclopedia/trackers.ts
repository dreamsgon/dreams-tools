import { z } from "zod";

/*
 * Trackers on a character: small gauges anyone at the table understands at a glance, such as Shields, Stress, Ammo or
 * Hit dice. Each is a bar or a row of pips with a maximum, and its own eye. The GM makes and changes them on the Stats
 * tab; a player who may edit the character changes the shown ones, and adds their own, from the player pages
 * (player-trackers.ts). Pure; no workspace access here.
 */

export const trackerColours = ["green", "blue", "amber", "purple", "red"] as const;
export type TrackerColour = typeof trackerColours[number];
export const trackerColourNames: Record<TrackerColour, string> = { green: "Green", blue: "Blue", amber: "Amber", purple: "Purple", red: "Red" };
export const maxTrackers = 8, maxTrackerPips = 20, maxTrackerValue = 1000;

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const trackerSchema = z.object({
  id, label: z.string().trim().min(1).max(40), shape: z.enum(["bar", "pips"]), colour: z.enum(trackerColours),
  max: z.number().int().min(1).max(maxTrackerValue), value: z.number().int().min(0).max(maxTrackerValue),
  /** Hidden from players, even the character's own player. */
  gm: z.boolean().optional(),
}).superRefine((t, ctx) => {
  if (t.shape === "pips" && t.max > maxTrackerPips) ctx.addIssue({ code: "custom", message: `A tracker drawn as pips can go up to ${maxTrackerPips}` });
  if (t.value > t.max) ctx.addIssue({ code: "custom", message: "A tracker can’t be above its maximum" });
});
export const trackersSchema = z.array(trackerSchema).max(maxTrackers).refine(l => new Set(l.map(t => t.id)).size === l.length, { message: "Tracker ids must be unique" });
export type Tracker = z.infer<typeof trackerSchema>;
export type TrackerInput = { label: string; shape: "bar" | "pips"; colour: TrackerColour; max: number };
export type PlayerTracker = Omit<Tracker, "gm">;

/** Keeps a maximum in range for its shape, and a value between 0 and the maximum. */
export const clampMax = (max: number, shape: "bar" | "pips") => Math.max(1, Math.min(shape === "pips" ? maxTrackerPips : maxTrackerValue, Math.round(Number.isFinite(max) ? max : 1)));
export const clampValue = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(Number.isFinite(value) ? value : 0)));
/** How far + and − move: one pip, or a twentieth of a bar (at least 1). */
export const trackerStep = (t: Pick<Tracker, "shape" | "max">) => t.shape === "pips" ? 1 : Math.max(1, Math.round(t.max / 20));

/** Ready-made trackers to start from. */
export const trackerPresets: TrackerInput[] = [
  { label: "Shields", shape: "pips", colour: "blue", max: 3 },
  { label: "Stress", shape: "pips", colour: "purple", max: 6 },
  { label: "Ammo", shape: "bar", colour: "amber", max: 30 },
  { label: "Fuel", shape: "bar", colour: "amber", max: 100 },
  { label: "Hit dice", shape: "pips", colour: "green", max: 5 },
];

export class TrackerError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
const no = (message: string, status = 400): never => { throw new TrackerError(message, status); };

/** A new tracker, full. */
export function addTracker(list: Tracker[], input: TrackerInput, gm = false, newId: () => string = () => crypto.randomUUID()): Tracker[] {
  if (list.length >= maxTrackers) no(`A character can have up to ${maxTrackers} trackers.`);
  const label = input.label.trim().slice(0, 40);
  if (!label) no("Name the tracker.");
  const max = clampMax(input.max, input.shape);
  return [...list, { id: newId(), label, shape: input.shape, colour: input.colour, max, value: max, ...(gm ? { gm: true } : {}) }];
}
/** Renames or reshapes one tracker; its value stays, inside the new maximum. */
export function editTracker(list: Tracker[], id: string, patch: Partial<TrackerInput> & { gm?: boolean }): Tracker[] {
  if (!list.some(t => t.id === id)) no("That tracker is gone.", 404);
  return list.map(t => {
    if (t.id !== id) return t;
    const shape = patch.shape ?? t.shape, max = clampMax(patch.max ?? t.max, shape), label = patch.label?.trim().slice(0, 40) || t.label;
    const next: Tracker = { ...t, label, shape, colour: patch.colour ?? t.colour, max, value: clampValue(t.value, max) };
    if (patch.gm !== undefined) { if (patch.gm) next.gm = true; else delete next.gm; }
    return next;
  });
}
export function setTrackerValue(list: Tracker[], id: string, value: number): Tracker[] {
  if (!list.some(t => t.id === id)) no("That tracker is gone.", 404);
  return list.map(t => t.id === id ? { ...t, value: clampValue(value, t.max) } : t);
}
export function removeTracker(list: Tracker[], id: string): Tracker[] {
  if (!list.some(t => t.id === id)) no("That tracker is gone.", 404);
  return list.filter(t => t.id !== id);
}
/** What players get: the shown trackers, without the eye. */
export const playerTrackers = (list: Tracker[] | undefined): PlayerTracker[] => (list ?? []).filter(t => !t.gm).map(({ gm: _gm, ...t }) => { void _gm; return t; });
