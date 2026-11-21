"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { BANNER_CHANGED } from "./campaign-theme-entry";
import { useBoxSize } from "./banner-frame";
import { bannerBackground } from "@/lib/banner-frame";

type Hero = { url: string; y: number; x?: number; zoom?: number; width: number; height: number };

/** The shade over a banner picture, so the white heading on it reads on any picture. Matches the Wiki's and the dashboard's. */
const SHADE = "linear-gradient(to top, rgb(8 8 10 / .82) 0%, rgb(8 8 10 / .45) 45%, rgb(8 8 10 / .08) 100%)";

/**
 * The campaign's banner picture for a page header outside the Wiki (Maptable's Scene Picker), by the campaign's forum key
 * (`c-`, `m-` or `mt-`). It asks again when the tab is back in view or the banner changed in this tab, so a new picture
 * set in the Wiki or the Admin CP shows without a reload. Off (no class, no style) while there is no picture.
 */
export function useCampaignHero(key: string | null | undefined): { on: boolean; className: string; style?: CSSProperties; ref: (el: HTMLElement | null) => void } {
  const [hero, setHero] = useState<Hero | null>(null), [asks, setAsks] = useState(0), [ref, box] = useBoxSize();
  useEffect(() => {
    if (!key) return;
    const again = () => { if (!document.hidden) setAsks(n => n + 1); };
    window.addEventListener(BANNER_CHANGED, again); document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener(BANNER_CHANGED, again); document.removeEventListener("visibilitychange", again); };
  }, [key]);
  useEffect(() => {
    if (!key) return;
    let live = true;
    fetch("/api/forum", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "heroBanner", campaign: key }) })
      .then(r => r.ok ? r.json() as Promise<{ banner: Hero | null }> : null)
      .then(out => { if (live && out) setHero(out.banner); })
      .catch(() => { /* keep what shows, until the next ask */ });
    return () => { live = false; };
  }, [key, asks]);
  if (!key || !hero) return { on: false, className: "", ref };
  const bg = bannerBackground(hero, box);
  return {
    on: true, className: "has-picture", ref,
    style: { backgroundImage: `${SHADE}, url("${hero.url}")`, backgroundPosition: `center, ${bg.position}`, backgroundSize: `cover, ${bg.size}`, backgroundRepeat: "no-repeat" },
  };
}
