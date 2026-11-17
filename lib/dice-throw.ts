/*
 * 3D dice across the screen for a roll already made: each die lands on the number that came up. The page's thrower
 * (components/dice-thrower.tsx, mounted once on every page) draws them. With no thrower, reduced motion or no dice that
 * can be thrown, nothing shows and the promise resolves straight away.
 */
export type ThrowDie = { sides: number; value: number };
export const THROWABLE = [4, 6, 8, 10, 12, 20, 100];
export const MAX_THROWN = 24;
const ownKey = "rpg-roll-3d";

let thrower: ((dice: ThrowDie[], done: () => void) => void) | null = null;
export function setDiceThrower(t: (dice: ThrowDie[], done: () => void) => void) { thrower = t; return () => { if (thrower === t) thrower = null; }; }

export const reducedMotion = () => typeof window !== "undefined" && (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced");

/** Throws the dice and resolves when they have landed (at most a few seconds). */
export function throwDice(dice: ThrowDie[]): Promise<void> {
  const shown = dice.filter(d => THROWABLE.includes(d.sides) && d.value >= 1 && d.value <= d.sides).slice(0, MAX_THROWN);
  if (!thrower || !shown.length || reducedMotion()) return Promise.resolve();
  const t = thrower;
  return new Promise(resolve => {
    let over = false;
    const done = () => { if (!over) { over = true; resolve(); } };
    setTimeout(done, 6000);
    try { t(shown, done); } catch { done(); }
  });
}

/** Whether your own rolls throw 3D dice (on unless turned off in the roll dialog). Kept per browser. */
export function ownDice3D() { try { return localStorage.getItem(ownKey) !== "0"; } catch { return true; } }
export function setOwnDice3D(on: boolean) { try { localStorage.setItem(ownKey, on ? "1" : "0"); } catch { /* optional */ } }

/** Throws your own roll's dice when 3D dice are on. */
export const throwOwnDice = (dice: ThrowDie[] | undefined) => dice?.length && ownDice3D() ? throwDice(dice) : Promise.resolve();
