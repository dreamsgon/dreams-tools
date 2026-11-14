/** Pure helpers for the dice tray's dice buttons and Discord roll names. */
export type DieCounts=Record<number,number>;
export const maxDicePerType=20,rollNameMax=120;
/** Left-click: one more of this die, up to the per-type limit. */
export function addDie(counts:DieCounts,sides:number):DieCounts{return {...counts,[sides]:Math.min(maxDicePerType,(counts[sides]||0)+1)};}
/** Right-click or long-press: one fewer of this die; the die drops out of the formula at zero. */
export function removeDie(counts:DieCounts,sides:number):DieCounts{
 const next={...counts},left=(counts[sides]||0)-1;
 if(left>0)next[sides]=left;else delete next[sides];
 return next;
}
/** What the roll is for ("Attack on goblin"), tidied for the Discord card. Empty means keep the default label. */
export function cleanRollName(name:string):string{return name.replace(/\s+/g,' ').trim().slice(0,rollNameMax);}
