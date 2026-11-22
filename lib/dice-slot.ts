/**
 * The place in the campaign bar where the dice, roll log and AI buttons sit. The bar registers it; GlobalDice puts
 * its buttons there, so they stay out of the page's content. With no bar on the page there is no slot.
 */
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export const diceSlotStore = {
  get: () => slot,
  getServer: (): HTMLElement | null => null,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

/** A ref callback for the bar's slot element (React 19 runs the cleanup it returns when the element goes). */
export function diceSlotRef(el: HTMLElement | null) {
  if (!el) return;
  slot = el;
  listeners.forEach(l => l());
  return () => {
    if (slot !== el) return;
    slot = null;
    listeners.forEach(l => l());
  };
}

/** Pages people play from: a campaign's Dashboard, the Wiki (and its player pages) and the Forum. Home, account, guide and join pages get no buttons. */
export function rollsHere(pathname: string | null) {
  return !!pathname && (/^\/campaigns\/[^/]+/.test(pathname) || pathname === "/encyclopedia" || pathname.startsWith("/encyclopedia/") || pathname === "/forum" || pathname.startsWith("/forum/"));
}
