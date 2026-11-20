"use client";
/*
 * The AI panel's Connection tab: each AI connected to this campaign, whether its app has reached RPG Tools, and the
 * fixes, from any page: Check it, Edit (the name and what it may do), and New link (a fresh key, with the steps for
 * each app again). Edit and New link open Connect an AI on that connection.
 */
import { useCallback, useEffect, useState } from "react";
import { Lock, Pencil, Plus, RefreshCw, Stethoscope } from "lucide-react";
import { AiConnectionDialog, ago, CheckResult, checkConnection, newLink, type Checked, type Connection, type Made } from "./ai-connection";
import { modeNames } from "@/lib/mcp/permissions";
import { providerOf } from "@/lib/ai/providers";
import { deviceKey, keepMoved } from "@/lib/ai/device-keys";

const LIVE_MS = 15 * 60_000;
const status = (c: Connection, now: number) => c.lastUsedAt ? ago(c.lastUsedAt, now).replace(/^used/, "Your AI app connected") : "Your AI app hasn’t connected yet";

/** `addKey`: open Connect an AI on "With an API key" at once. `onChanged`: after the dialog closes, for the panel to reload. */
export default function ConnectionTab({ campaignId, addKey, onChanged }: { campaignId: string; addKey?: boolean; onChanged?: () => void }) {
  const [list, setList] = useState<Connection[] | null>(null), [name, setName] = useState(""), [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now()), [busy, setBusy] = useState(""), [checks, setChecks] = useState<Record<string, Checked>>({});
  const [dialog, setDialog] = useState<{ edit?: string; made?: Made; way?: "key" } | null>(addKey ? { way: "key" } : null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/encyclopedia/ai-connections?${new URLSearchParams({ campaignId, named: "1" })}`, { cache: "no-store" });
      const body = await r.json().catch(() => ({})) as { connections?: Connection[]; campaignName?: string; moved?: { id: string; key: string }[]; error?: string };
      if (!r.ok) throw Error(body.error ?? "Could not load the AI connections.");
      keepMoved(body.moved);
      setList(body.connections ?? []); setName(body.campaignName ?? "this campaign"); setNow(Date.now()); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the AI connections."); }
  }, [campaignId]);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  async function run(what: string, f: () => Promise<void>) {
    setBusy(what); setError("");
    try { await f(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Try again."); }
    finally { setBusy(""); }
  }
  const check = (c: Connection) => run(`check:${c.id}`, async () => {
    const r = await checkConnection(campaignId, c.id);
    setChecks(x => ({ ...x, [c.id]: r })); setNow(Date.now());
  });
  const relink = (c: Connection) => run(`link:${c.id}`, async () => {
    const made = await newLink(c, campaignId);
    if (made) { setChecks(x => { const { [c.id]: _gone, ...rest } = x; return rest; }); setDialog({ made }); }
  });

  return <div className="ai-conn">
    {error && <p className="ai-panel-note" role="alert">{error}</p>}
    {list === null ? <p className="ai-panel-empty">{error ? "" : "Loading…"}</p> : <>
      <ul className="ai-conn-list">{list.map(c => {
        const live = !!c.lastUsedAt && now - Date.parse(c.lastUsedAt) < LIVE_MS;
        return <li key={c.id}>
          <div className="ai-conn-top"><span className={`ai-dot${live ? " live" : ""}`} aria-hidden/><strong>{c.name}</strong><span className="ai-badge">{c.api ? `${providerOf(c.api.provider).name} key` : modeNames[c.mode]}</span></div>
          <small>{c.api ? <>{c.api.model} · {deviceKey(c.id) ? <><Lock size={11}/> key on this device</> : "no key on this device yet: paste it under Edit"}</> : status(c, now)}</small>
          <div className="ai-conn-actions">
            {!c.api && <button type="button" className="button small" disabled={!!busy} onClick={() => void check(c)}><Stethoscope size={13}/> {busy === `check:${c.id}` ? "Checking…" : "Check it"}</button>}
            <button type="button" className="button small" disabled={!!busy} onClick={() => setDialog({ edit: c.id })}><Pencil size={13}/> Edit</button>
            {!c.api && <button type="button" className="button small" disabled={!!busy} onClick={() => void relink(c)}><RefreshCw size={13}/> {busy === `link:${c.id}` ? "Making…" : "New link"}</button>}
          </div>
          {checks[c.id] && <CheckResult r={checks[c.id]} now={now}/>}
        </li>;
      })}</ul>
    </>}
    <div className="ai-panel-foot">
      <button type="button" className="button small" onClick={() => setDialog({})}><Plus size={14}/> {list?.length ? "Connect another AI" : "Connect an AI"}</button>
      <p><b>Edit</b> renames a connection and changes what it may do. <b>New link</b> replaces its key: use it when a link was lost, shared by mistake, or set up wrong in the app.</p>
    </div>
    {dialog && list && <AiConnectionDialog campaignId={campaignId} campaignName={name} start={dialog} onClose={() => { setDialog(null); void load(); onChanged?.(); }}/>}
  </div>;
}
