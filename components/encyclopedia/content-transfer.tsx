"use client";
/*
 * Export & import: pick tables, templates, stats, calendars and other reusable things in this world or campaign,
 * download them as one JSON file, and upload that file in another world or campaign (lib/encyclopedia/content-pack.ts).
 */
import { useMemo, useRef, useState } from "react";
import { Download, FileJson, Upload } from "lucide-react";
import { newId, type Workspace } from "@/lib/encyclopedia/world-model";
import { emptyLibrary } from "@/lib/encyclopedia/tables";
import { buildPack, CAMPAIGN_KINDS, exportable, importPack, importPreview, packCount, packFileName, packGroups, PACK_KIND_NAMES, previewKey, readPack, tablesNeeded, type ContentPack, type PackGroup, type PackKind, type Picked } from "@/lib/encyclopedia/content-pack";
import { saveTables, useTables } from "./table-library";
import { ToolDialog } from "./tool-dialog";
import "./content-transfer.css";

type Change = (s: Workspace | ((latest: Workspace) => Workspace)) => boolean | void;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const allPicked = (groups: PackGroup[]): Picked => Object.fromEntries(groups.map(g => [g.kind, g.items.map(i => i.id)]));
const pickedCount = (p: Picked) => Object.values(p).reduce((n, ids) => n + (ids?.length ?? 0), 0);

/** The ticked list of groups and their things, shared by Export and Import. */
function PickList({ groups, picked, setPicked, notes, off }: { groups: PackGroup[]; picked: Picked; setPicked: (p: Picked) => void; notes?: Map<string, string>; off?: Set<PackKind> }) {
  const toggle = (kind: PackKind, id: string, on: boolean) => { const have = new Set(picked[kind] ?? []); if (on) have.add(id); else have.delete(id); setPicked({ ...picked, [kind]: [...have] }); };
  return <div className="transfer-groups">{groups.map(g => {
    const ids = picked[g.kind] ?? [], disabled = off?.has(g.kind), all = !disabled && ids.length === g.items.length, some = !disabled && ids.length > 0 && !all;
    return <fieldset key={g.kind} className="transfer-group" disabled={disabled}>
      <legend><label><input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = some; }} onChange={e => setPicked({ ...picked, [g.kind]: e.target.checked ? g.items.map(i => i.id) : [] })}/> <b>{PACK_KIND_NAMES[g.kind]}</b> <span className="transfer-count">{disabled ? "open a campaign to import" : `${ids.length} of ${g.items.length}`}</span></label></legend>
      <div className="transfer-items">{g.items.map(i => { const note = notes?.get(previewKey(g.kind, i.id)); return <label key={i.id}><input type="checkbox" checked={!disabled && ids.includes(i.id)} onChange={e => toggle(g.kind, i.id, e.target.checked)}/><span className="transfer-name">{i.name}</span>{i.detail && <span className="transfer-detail">{i.detail}</span>}{note && <span className={`transfer-note${note.startsWith("Already") ? " skip" : ""}`}>{note}</span>}</label>; })}</div>
    </fieldset>;
  })}</div>;
}

export function ContentTransfer({ data, worldId, campaignId, change, onClose, onDone, start = "export" }: { data: Workspace; worldId: string; campaignId: string | null; change: Change; onClose: () => void; onDone: (message: string) => void; start?: "export" | "import" }) {
  const tables = useTables(), lib = tables.lib ?? emptyLibrary();
  const world = data.worlds.find(w => w.id === worldId), campaign = campaignId ? data.campaigns.find(c => c.id === campaignId) : undefined;
  const where = useMemo(() => ({ worldId, campaignId: campaign?.id ?? null }), [worldId, campaign?.id]);
  const [tab, setTab] = useState<"export" | "import">(start);
  const here = campaign ? campaign.name : world ? `${world.name} lore` : "this world";

  // Export
  const groups = useMemo(() => packGroups(exportable(data, lib, where)), [data, lib, where]);
  const [picked, setPicked] = useState<Picked>({});
  const extra = useMemo(() => tablesNeeded(exportable(data, lib, where).tables ?? [], picked.tables ?? []), [data, lib, where, picked.tables]);
  const [error, setError] = useState("");
  function download() {
    try {
      const pack = buildPack(data, lib, where, picked);
      const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" })), a = document.createElement("a");
      a.href = url; a.download = packFileName(campaign?.name ?? world?.name ?? "content"); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      onDone(`Exported ${plural(packCount(pack), "item")} to ${a.download}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not make the file."); }
  }

  // Import
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; pack: ContentPack } | null>(null), [chosen, setChosen] = useState<Picked>({});
  const [templateScope, setTemplateScope] = useState<"campaign" | "world">("world"), [tableScope, setTableScope] = useState<"campaign" | "all">(campaign ? "campaign" : "all");
  const [busy, setBusy] = useState(false);
  const incoming = useMemo(() => file ? packGroups(file.pack) : [], [file]);
  const notes = useMemo(() => file ? importPreview(data, lib, file.pack, where) : new Map<string, string>(), [file, data, lib, where]);
  const off = useMemo(() => new Set<PackKind>(campaign ? [] : CAMPAIGN_KINDS), [campaign]);
  const usable = (p: Picked): Picked => Object.fromEntries(Object.entries(p).filter(([k]) => !off.has(k as PackKind)));
  async function choose(f: File) {
    setError(""); setFile(null);
    try {
      if (f.size > 5_000_000) throw Error("Choose a file smaller than 5 MB.");
      let raw: unknown; try { raw = JSON.parse(await f.text()); } catch { throw Error("That file isn’t JSON. Choose a .content.json file made with Export."); }
      const pack = readPack(raw), g = packGroups(pack);
      if (!g.length) throw Error("That file has nothing in it to import.");
      setFile({ name: f.name, pack }); setChosen(allPicked(g));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read that file."); }
    finally { if (input.current) input.current.value = ""; }
  }
  async function runImport() {
    if (!file) return;
    setError(""); setBusy(true);
    const p = usable(chosen), opts = { ...where, templates: templateScope, tables: tableScope };
    try {
      // A dry run first, so nothing is saved when any part can't go in.
      const dry = importPack(data, lib, file.pack, p, opts, newId);
      if (!dry.summary.length) throw Error("Nothing new to import: everything ticked is already here.");
      if ((p.tables ?? []).length) await saveTables(latest => importPack(data, latest, file.pack, { tables: p.tables }, opts, newId).library ?? latest);
      const rest = { ...p, tables: [] };
      if (pickedCount(rest)) { let failed = ""; if (change(latest => { try { return importPack(latest, emptyLibrary(), file.pack, rest, opts, newId).data; } catch (e) { failed = e instanceof Error ? e.message : "Could not import."; return latest; } }) === false || failed) throw Error(failed || "Your Wiki could not be changed right now. Try again."); }
      onDone(`Imported into ${here}. ${dry.summary.join(". ")}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not import that file."); }
    finally { setBusy(false); }
  }
  const tablesPicked = !!(usable(chosen).tables ?? []).length, templatesPicked = !!(chosen.templates ?? []).length;

  return <ToolDialog title="Export & import" onClose={onClose} wide className="transfer-dialog">
    <div className="segmented transfer-tabs" role="tablist" aria-label="Export or import">
      <button role="tab" aria-selected={tab === "export"} className={tab === "export" ? "on" : ""} onClick={() => { setTab("export"); setError(""); }}><Download size={14}/> Export</button>
      <button role="tab" aria-selected={tab === "import"} className={tab === "import" ? "on" : ""} onClick={() => { setTab("import"); setError(""); }}><Upload size={14}/> Import</button>
    </div>
    {tab === "export" ? <>
      <p className="modal-intro">Tick what to take from <b>{here}</b>. You get one .json file. Open another world or campaign, this account or someone else’s, and choose <b>Import</b> to add it there.</p>
      {tables.error && <p className="aside-hint">Random tables could not be loaded: {tables.error}</p>}
      {groups.length ? <PickList groups={groups} picked={picked} setPicked={setPicked}/> : <p className="aside-hint">There’s nothing here to export yet. Make some tables, templates or stats first.</p>}
      {extra.length > 0 && <p className="aside-hint">Also included, because a ticked table rolls on {extra.length === 1 ? "it" : "them"}: {extra.map(t => t.name).join(", ")}.</p>}
      <p className="aside-hint">Pages aren’t included. To move a whole campaign with its pages, use Download backup on the Campaigns page.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row transfer-actions"><button className="button" onClick={() => setPicked(allPicked(groups))} disabled={!groups.length}>Tick everything</button><button className="button primary" disabled={!pickedCount(picked)} onClick={download}><Download size={15}/> Export {pickedCount(picked) ? plural(pickedCount(picked), "item") : ""}</button></div>
    </> : <>
      <p className="modal-intro">Add things from an exported .json file to <b>{here}</b>. Everything comes in as a copy, so nothing already here changes{campaign?.items ? " (except Items and spells settings, which are replaced)" : ""}.</p>
      <input ref={input} hidden type="file" accept=".json,application/json" aria-label="Content file" onChange={e => e.target.files?.[0] && void choose(e.target.files[0])}/>
      {!file ? <button className="transfer-drop" onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void choose(f); }}><FileJson size={28}/><strong>Choose a .json file</strong><small>Made with Export here. Random table and calendar exports work too.</small></button>
        : <>
          <div className="transfer-file"><FileJson size={18}/><span><b>{file.name}</b>{(file.pack.from?.campaign || file.pack.from?.world) && <small>From {[file.pack.from.campaign, file.pack.from.world].filter(Boolean).join(" · ")}</small>}</span><button className="text-button" onClick={() => input.current?.click()}>Choose another</button></div>
          {!campaign && incoming.some(g => off.has(g.kind)) && <p className="aside-hint">Stats, calendars, quest categories and item settings belong to a campaign. Open a campaign in this world to import those.</p>}
          <PickList groups={incoming} picked={chosen} setPicked={setChosen} notes={notes} off={off}/>
          {(tablesPicked && campaign || templatesPicked && campaign) && <div className="transfer-scope">
            {tablesPicked && campaign && <fieldset className="tables-how"><legend>Random tables are used in</legend><label><input type="radio" name="tscope" checked={tableScope === "campaign"} onChange={() => setTableScope("campaign")}/> {campaign.name} only</label><label><input type="radio" name="tscope" checked={tableScope === "all"} onChange={() => setTableScope("all")}/> Every campaign</label></fieldset>}
            {templatesPicked && campaign && <fieldset className="tables-how"><legend>Templates are offered in</legend><label><input type="radio" name="pscope" checked={templateScope === "world"} onChange={() => setTemplateScope("world")}/> Every campaign in {world?.name}</label><label><input type="radio" name="pscope" checked={templateScope === "campaign"} onChange={() => setTemplateScope("campaign")}/> {campaign.name} only</label></fieldset>}
          </div>}
        </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row transfer-actions"><button className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={!file || busy || !pickedCount(usable(chosen))} onClick={() => void runImport()}><Upload size={15}/> {busy ? "Importing…" : `Import ${pickedCount(usable(chosen)) ? plural(pickedCount(usable(chosen)), "item") : ""}`}</button></div>
    </>}
  </ToolDialog>;
}
