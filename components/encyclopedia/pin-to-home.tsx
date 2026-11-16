"use client";
import { useEffect, useState } from "react";
import { Pin, PinOff } from "lucide-react";

/** Pin to home / Unpin from home: puts the page in the Pinned pages section of the home page. Saved with POST /api/home. */
export function PinToHome({ entryId, onNotice }: { entryId: string; onNotice: (text: string) => void }) {
  const [pinned, setPinned] = useState<boolean | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setPinned(null);
    fetch("/api/home?layout=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(body => { if (live && body) setPinned(!!body.layout?.pinnedPages?.includes(entryId)); }).catch(() => {});
    return () => { live = false; };
  }, [entryId]);
  if (pinned === null) return null;
  async function toggle() {
    setBusy(true);
    try {
      const r = await fetch("/api/home", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pinPage", id: entryId, on: !pinned }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "That didn't save.");
      setPinned(!pinned);
      onNotice(pinned ? "Unpinned from your home page." : "Pinned to your home page.");
    } catch (e) { onNotice(e instanceof Error ? e.message : "That didn't save."); }
    finally { setBusy(false); }
  }
  const label = pinned ? "Unpin from home" : "Pin to home";
  return <button aria-label={label} title={label} aria-pressed={pinned} disabled={busy} onClick={() => void toggle()}>{pinned ? <PinOff size={16}/> : <Pin size={16}/>}</button>;
}
