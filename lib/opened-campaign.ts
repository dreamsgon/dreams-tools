"use client";
import { useEffect } from "react";
import { OPENED_REFRESH_MS } from "./home-layout.ts";

/*
 * Tells the home page which campaign you opened, so Continue where you left off (and Recent lists) show the campaign
 * you were last in, not the one last edited (an agent or a player can edit a campaign you have not opened).
 * The note is saved in the home layout (lib/home-layout.ts `opened`). This browser remembers the last note so a
 * reload or another page in the same campaign sends nothing; the server also skips a repeat within OPENED_REFRESH_MS.
 */

const LAST = "rpg-tools:opened-campaign";

/** Sends one "opened" note for a campaign key ("e:<Encyclopedia id>" or "m:<Maptable id>"), unless this browser just sent it. */
export function noteCampaignOpened(key: string) {
  try {
    const last = JSON.parse(localStorage.getItem(LAST) ?? "null") as { key?: string; at?: number } | null;
    if (last?.key === key && typeof last.at === "number" && Date.now() - last.at < OPENED_REFRESH_MS) return;
    localStorage.setItem(LAST, JSON.stringify({ key, at: Date.now() }));
  } catch { /* no storage: the server still skips repeats */ }
  void fetch("/api/home", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "opened", key }), keepalive: true }).catch(() => {});
}

/** Notes `key` as opened while it is the campaign on screen, and again when you come back to this tab. Null notes nothing. */
export function useCampaignOpened(key: string | null) {
  useEffect(() => {
    if (!key) return;
    noteCampaignOpened(key);
    const back = () => { if (!document.hidden) noteCampaignOpened(key); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [key]);
}
