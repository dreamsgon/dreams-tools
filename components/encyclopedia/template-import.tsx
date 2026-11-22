"use client";
/*
 * Import a character sheet template: a ready-made one (D&D 5E, Pathfinder, Daggerheart…, some as gestalt), a .json file someone shared, or one an AI app wrote
 * from the copied prompt. Shows what the file adds, then puts its template in the world and its stats on the open
 * campaign's stat form (lib/encyclopedia/sheet-template.ts, content-pack.ts importPack).
 */
import { useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Copy, ExternalLink, Upload } from "lucide-react";
import { newId, type Workspace } from "@/lib/encyclopedia/world-model";
import { emptyLibrary } from "@/lib/encyclopedia/tables";
import { importPack, importPreview, packGroups, PACK_KIND_NAMES, previewKey, type ContentPack } from "@/lib/encyclopedia/content-pack";
import { READY_TEMPLATES, readTemplateText, templatePrompt } from "@/lib/encyclopedia/sheet-template";
import { HIDEABLE_TABS, KIND_NAMES } from "@/lib/encyclopedia/templates";
import { ToolDialog } from "./tool-dialog";
import "./sheet-import.css";

type Change = (s: Workspace | ((latest: Workspace) => Workspace)) => boolean | void;
const SYSTEMS = ["D&D 5e (2024)", "D&D 5e (2014)", "Pathfinder 2e", "Starfinder 2e", "Call of Cthulhu 7e", "Blades in the Dark", "Mothership", "Cyberpunk RED", "Shadowdark", "Daggerheart", "Vampire: the Masquerade 5e", "Mörk Borg"];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function TemplateImport({ data, worldId, campaignId, change, onClose, onDone }: { data: Workspace; worldId: string; campaignId: string | null; change: Change; onClose: () => void; onDone: (templateId: string | null, message: string) => void }) {
  const world = data.worlds.find(w => w.id === worldId), campaign = campaignId ? data.campaigns.find(c => c.id === campaignId && c.worldId === worldId) : undefined;
  const [system, setSystem] = useState(""), [gestalt, setGestalt] = useState<Set<string>>(new Set()), [copied, setCopied] = useState(""), [reply, setReply] = useState(""), [error, setError] = useState("");
  const [file, setFile] = useState<{ name: string; pack: ContentPack } | null>(null), [scope, setScope] = useState<"campaign" | "world">(campaign ? "campaign" : "world");
  const prompt = useMemo(() => templatePrompt(system), [system]);

  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied("Copied. Paste it into your AI app, then paste its reply below."); }
    catch { setCopied("Your browser didn’t allow copying. Open See the prompt, select it and copy it."); }
  }
  function read(text: string, name?: string) {
    const r = readTemplateText(text);
    if (!r.ok) { setError(r.error); setFile(null); return; }
    setError(""); setFile({ name: name ?? r.pack.templates?.[0]?.name ?? "Imported stats", pack: r.pack });
  }
  function upload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 5_000_000) { setError("Choose a file smaller than 5 MB."); return; }
    void f.text().then(t => { setReply(t); read(t); });
  }

  // What the file adds here: names in use, stats already on the form, things this dialog leaves for Export & import.
  const notes = useMemo(() => file ? importPreview(data, emptyLibrary(), file.pack, { worldId, campaignId: campaign?.id ?? null }) : new Map<string, string>(), [file, data, worldId, campaign?.id]);
  const stats = file?.pack.stats ?? [], templates = file?.pack.templates ?? [];
  const sameStats = stats.filter(f => notes.has(previewKey("stats", f.id))).length;
  const sections = [...stats.reduce((m, f) => m.set(f.section || "Stats", (m.get(f.section || "Stats") ?? 0) + 1), new Map<string, number>())];
  const others = file ? packGroups(file.pack).filter(g => g.kind !== "templates" && g.kind !== "stats") : [];
  const noCampaign = !campaign && stats.length > 0;

  function run() {
    if (!file) return;
    setError("");
    const picked = { templates: templates.map(t => t.id), ...(campaign ? { stats: stats.map(f => f.id) } : {}) };
    let made: string | null = null, failed = "";
    const ok = change(latest => {
      try {
        const before = new Set((latest.worlds.find(w => w.id === worldId)?.templates ?? []).map(t => t.id));
        const r = importPack(latest, emptyLibrary(), file.pack, picked, { worldId, campaignId: campaign?.id ?? null, templates: scope, tables: "campaign" }, newId);
        made = r.data.worlds.find(w => w.id === worldId)?.templates?.find(t => !before.has(t.id))?.id ?? null;
        return r.data;
      } catch (e) { failed = e instanceof Error ? e.message : "Could not import that template."; return latest; }
    });
    if (ok === false || failed) { setError(failed || "Your Wiki could not be changed right now. Try again."); return; }
    const parts = [templates.length ? plural(templates.length, "template") : "", campaign && stats.length - sameStats ? `${plural(stats.length - sameStats, "stat")} on ${campaign.name}’s stat form` : ""].filter(Boolean);
    onDone(made, `Imported ${file.name}${parts.length ? `: ${parts.join(" and ")}` : ""}.`);
  }

  return <ToolDialog title="Import a sheet template" wide onClose={onClose}>
    {!file ? <div className="import-body">
      <p className="modal-intro">A sheet template gives new characters a game’s stats, skills, rolls and trackers. Its stats join {campaign ? <b>{campaign.name}</b> : "the open campaign"}’s stat form, and the template appears under Add character.</p>
      {!campaign && <p className="import-warn">Open a campaign first to bring in stats. Without one, only the template itself is added.</p>}

      <section><h3 className="import-h">Ready-made</h3>
        <div className="template-ready">{READY_TEMPLATES.map(t => { const g = !!t.gestalt && gestalt.has(t.id); return <div key={t.id} className="template-ready-card"><BookOpen size={18} aria-hidden="true"/><span><b>{t.name}</b><small>{t.detail}</small>
          {t.gestalt && <label className="template-ready-option"><input type="checkbox" checked={g} onChange={e => setGestalt(prev => { const next = new Set(prev); if (e.target.checked) next.add(t.id); else next.delete(t.id); return next; })}/> Gestalt <small>two classes side by side</small></label>}</span>
          <button type="button" className="button small" aria-label={`Use ${g ? t.name.replace(" character", " gestalt character") : t.name}`} onClick={() => read(JSON.stringify(t.file({ gestalt: g })))}>Use this <ArrowRight size={13}/></button></div>; })}</div>
      </section>

      <section><h3 className="import-h">Make one with an AI <span>any game</span></h3>
        <p className="import-note">Copy the prompt into ChatGPT, Claude or another AI app. It answers with a template file; paste that below. The <a href="/guide/character-sheet-templates" target="_blank" rel="noreferrer">guide</a> explains the format if you want to change one by hand.</p>
        <label className="import-label" htmlFor="template-system">Game</label>
        <input id="template-system" className="import-input" list="template-systems" maxLength={100} placeholder="Pathfinder 2e, Mothership, my own game…" value={system} onChange={e => setSystem(e.target.value)}/>
        <datalist id="template-systems">{SYSTEMS.map(s => <option key={s} value={s}/>)}</datalist>
        <div className="button-row"><button type="button" className="button primary" onClick={() => void copy()}><Copy size={14}/> Copy prompt</button><a className="button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> ChatGPT</a><a className="button" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Claude</a></div>
        {copied && <p className="import-note" role="status">{copied}</p>}
        <details className="import-prompt"><summary>See the prompt</summary><textarea readOnly aria-label="The prompt" value={prompt} onFocus={e => e.currentTarget.select()}/></details>
      </section>

      <section><h3 className="import-h">Paste the reply, or choose a file</h3>
        <textarea className="import-paste template-paste" aria-label="The AI’s reply or a template file" spellCheck={false} placeholder='{ "format": "rpg-tools-content", "version": 1, "stats": [ … ], "templates": [ … ] }' value={reply} onChange={e => setReply(e.target.value)}/>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="import-footer"><button type="button" className="button" onClick={onClose}>Cancel</button><label className="button"><Upload size={14}/> Choose a .json file<input type="file" accept=".json,application/json,text/plain" hidden onChange={upload}/></label><button type="button" className="button primary" disabled={!reply.trim()} onClick={() => read(reply)}>Read it <ArrowRight size={14}/></button></div>
      </section>
    </div> : <div className="import-body">
      <p className="modal-intro"><strong>{file.name}</strong>{file.pack.from?.world ? ` · ${file.pack.from.world}` : ""}</p>

      {templates.map(t => { const tabs = t.kind === "character" ? HIDEABLE_TABS.filter(([id]) => !t.hiddenTabs?.includes(id)).map(([, n]) => n) : []; const note = notes.get(previewKey("templates", t.id)); return <section key={t.id} className="import-sum">
        <h3 className="import-h">{t.name} <span>{KIND_NAMES[t.kind]} template{note ? ` · ${note}` : ""}</span></h3>
        <ul>
          {t.layout?.facts?.length ? <li>Profile: {t.layout.facts.map(f => f.label).join(", ")}</li> : null}
          {t.fields.length > 0 && <li>Info box: {t.fields.map(f => f.label).join(", ")}</li>}
          {t.trackers?.length ? <li>Trackers: {t.trackers.map(x => `${x.label} ${x.value}/${x.max}`).join(", ")}</li> : null}
          {[...tabs, ...t.tabs.map(x => x.title)].length > 0 && <li>Tabs: {[...tabs, ...t.tabs.map(x => x.title)].join(", ")}</li>}
        </ul>
      </section>; })}

      {stats.length > 0 && <section><h3 className="import-h">Stats <span>{plural(stats.length, "stat")}{sameStats ? ` · ${sameStats} already on the form, kept as they are` : ""}</span></h3>
        <div className="import-tiles">{sections.map(([name, n]) => <div key={name}><small>{name}</small><b>{n}</b></div>)}</div>
        {noCampaign ? <p className="import-warn">Open a campaign in {world?.name ?? "this world"} to add these stats. Only the template is imported here.</p>
          : <p className="import-note">They join {campaign!.name}’s stat form, so every character in it can use them. Characters made from this template show only these stats; the form’s other stats stay on other characters.</p>}
      </section>}

      {others.length > 0 && <p className="import-note">This file also has {others.map(g => `${PACK_KIND_NAMES[g.kind].toLocaleLowerCase()} (${g.items.length})`).join(", ")}. Use Export &amp; import to bring those in.</p>}

      {templates.length > 0 && campaign && <fieldset className="template-scope"><legend>Offer the template in</legend>
        <label><input type="radio" name="template-scope" checked={scope === "campaign"} onChange={() => setScope("campaign")}/> {campaign.name} only</label>
        <label><input type="radio" name="template-scope" checked={scope === "world"} onChange={() => setScope("world")}/> Every campaign in {world?.name}</label></fieldset>}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="import-footer"><button type="button" className="button" onClick={() => { setFile(null); setError(""); }}><ArrowLeft size={14}/> Back</button><button type="button" className="button primary" disabled={!templates.length && noCampaign} onClick={run}><Check size={14}/> Import</button></div>
    </div>}
  </ToolDialog>;
}
