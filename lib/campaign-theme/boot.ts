/*
 * Holding a campaign's page back while its theme goes on, so the app's own look never shows first. A page is drawn on
 * the server before the browser knows whose campaign it is or what theme it wears, so on the parts of a campaign (the
 * Encyclopedia, Maptable, the forum and a campaign's dashboard) this script, run in the page's head before anything is
 * drawn, hides the page when that part last wore a theme in this browser. components/campaign-skin.tsx shows it again as
 * soon as the theme is on (from the browser's copy, before the page is drawn) or known to be none, and SKIN_BOOT_MS later
 * at most, whatever happens.
 */
import type { ThemeArea } from "./model.ts";

/** Set (to "1") once a part has worn a theme in this browser: `campaign-skin:boot:<area>`. */
export const SKIN_BOOT_FLAG = "campaign-skin:boot:";
/** While held back, the page's root carries `data-skin-boot` (the root's class belongs to React, which may write it over). */
export const SKIN_BOOT_DATA = "skinBoot";
export const SKIN_BOOT_MS = 2000;

/** The parts of a campaign by path, in order. */
const PARTS: [ThemeArea, RegExp][] = [
  ["encyclopedia", /^\/encyclopedia(\/|$)/], ["maptable", /^\/maptable(\/|$)/], ["forum", /^\/forum(\/|$)/], ["dashboard", /^\/campaigns\/[^/]+\/?$/],
];
/** Which part of a campaign a path is, or null. */
export function bootArea(path: string): ThemeArea | null {
  return PARTS.find(([, test]) => test.test(path))?.[0] ?? null;
}

/** For the root layout's head: bootArea, written out, and the hiding. */
export const skinBootScript = `(function(){try{var p=location.pathname,t=[${PARTS.map(([a, r]) => `[${JSON.stringify(a)},${r.toString()}]`).join(",")}],a=null;for(var i=0;i<t.length;i++)if(t[i][1].test(p)){a=t[i][0];break}if(!a||localStorage.getItem(${JSON.stringify(SKIN_BOOT_FLAG)}+a)!=="1")return;var d=document.documentElement.dataset;d.${SKIN_BOOT_DATA}="1";setTimeout(function(){delete d.${SKIN_BOOT_DATA}},${SKIN_BOOT_MS})}catch(e){}})();`;
