"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Check, Download, FileArchive, Info, TriangleAlert, X } from "lucide-react";
import { importCopy, workspaceSchema, type Workspace } from "@/lib/encyclopedia/world-model";
import { librarySchema, emptyLibrary, type TableLibrary } from "@/lib/encyclopedia/tables";
import { rpExportFiles } from "@/lib/encyclopedia/rp-export";
import { rpExportZip, readRestoreCopy } from "@/lib/encyclopedia/rp-zip";
import { readZip, ZipError, ZIP_MAX_BYTES } from "@/lib/zip-read";
import { classifyZip, exportedAt, folderRows, lastExportKey, shortDate, zipName } from "@/lib/encyclopedia/rp-sheet";
import { memberRef } from "./encyclopedia/member-view";
import "./rp-backups.css";

const WORKSPACE_LIMIT = 2_000_000;
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const WORKSPACE_URL = "/api/encyclopedia/workspace";

/** The date of the last Download ZIP on this device, kept per campaign. Only a convenience: it can be missing. */
export function readLastExport(campaignId: string): string | null {
  try { return window.localStorage.getItem(lastExportKey(campaignId)); } catch { return null; }
}
function saveLastExport(campaignId: string, iso: string) { try { window.localStorage.setItem(lastExportKey(campaignId), iso); } catch { /* Not remembered. */ } }

/** The "GitHub & backups" button (with the last export under it) and the sheet it opens. */
export function BackupsButton({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [open, setOpen] = useState(false), [last, setLast] = useState<string | null>(() => readLastExport(campaignId));
  const button = useRef<HTMLButtonElement>(null);
  const when = last ? shortDate(last) : "";
  return <div className="rpb-entry">
    <button type="button" ref={button} className="hub-button rpb-open" onClick={() => setOpen(true)} aria-haspopup="dialog"><ArrowDownUp size={15} aria-hidden="true" />GitHub &amp; backups</button>
    {when && <small className="rpb-last">Last exported {when}</small>}
    {open && <BackupsSheet campaignId={campaignId} campaignName={campaignName} close={() => setOpen(false)} returnFocus={button} onExported={iso => setLast(iso)} />}
  </div>;
}

type Loaded = { workspace: Workspace; tables: TableLibrary };
type Imported =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "error"; title: string; message: string }
  | { step: "note"; title: string; message: string }
  | { step: "found"; incoming: Workspace; name: string; world: string; date: string | null; files: number }
  | { step: "restoring"; incoming: Workspace; name: string; world: string; date: string | null; files: number }
  | { step: "done"; name: string; href: string };

const errorText = (e: unknown, fallback: string) => e instanceof Error && e.message ? e.message : fallback;

/** Saves bytes as a file through a temporary link. */
function saveFile(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A bottom sheet on phones and a centred dialog elsewhere, with two tabs. Export lists the folders of the RP repository and
 * downloads them as a ZIP. Import reads a ZIP and restores an RPG Tools export as a new campaign.
 * `workspace` is the Encyclopedia's own copy when this opens inside it (it holds unsaved edits); otherwise the owner's saved
 * workspace is loaded. `onRestored` runs after a restore is saved, so the caller can take in the new copy.
 */
export function BackupsSheet({ campaignId, campaignName, close, returnFocus, workspace, canRestore = true, onExported, onRestored }: {
  campaignId: string; campaignName: string; close: () => void; returnFocus?: React.RefObject<HTMLElement | null>;
  workspace?: Workspace; canRestore?: boolean; onExported?: (iso: string) => void; onRestored?: () => void;
}) {
  const [tab, setTab] = useState<"export" | "import">("export"), [includeGm, setIncludeGm] = useState(true);
  const [loaded, setLoaded] = useState<Loaded | null>(null), [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(""), [exportError, setExportError] = useState("");
  const [imp, setImp] = useState<Imported>({ step: "idle" });
  const sheet = useRef<HTMLDivElement>(null), picker = useRef<HTMLInputElement>(null), closeRef = useRef(close);
  const [opener] = useState(() => typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const [openedAt] = useState(() => new Date().toISOString());
  const latest = useRef(workspace);
  useEffect(() => { closeRef.current = close; latest.current = workspace; });
  // The page behind the sheet stays put while it is open.
  useEffect(() => { const old = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = old; }; }, []);

  // Escape closes, Tab stays inside, and focus goes back to the opener.
  useEffect(() => {
    sheet.current?.focus();
    const back = returnFocus?.current ?? null;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab" || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)")].filter(x => x.offsetParent !== null || x === document.activeElement);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (e.shiftKey && (at === first || at === sheet.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      setTimeout(() => { const target = back ?? opener; const now = document.activeElement; if ((!now || now === document.body) && target?.isConnected) target.focus(); }, 0);
    };
  }, [opener, returnFocus]);

  // Load what the export needs: the notes (unless the caller has them) and the random tables library.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let ws = latest.current;
        if (!ws) {
          const res = await fetch(WORKSPACE_URL, { cache: "no-store" }), body = await res.json() as { data?: unknown; error?: string };
          if (res.status === 401) throw new Error("Sign in again to export this campaign.");
          if (!res.ok) throw new Error(body.error || "Could not load this campaign's notes.");
          ws = workspaceSchema.parse(body.data);
        }
        // A co-GM's tables call would return their own library, not the GM's, so it is left out.
        let tables = emptyLibrary();
        if (!memberRef()) {
          const res = await fetch("/api/encyclopedia/tables", { cache: "no-store" }), body = await res.json() as { data?: unknown; error?: string };
          if (!res.ok) throw new Error(body.error || "Could not load your random tables.");
          const parsed = librarySchema.safeParse(body.data);
          if (parsed.success) tables = parsed.data;
        }
        if (live) setLoaded({ workspace: ws, tables });
      } catch (e) { if (live) setLoadError(errorText(e, "Could not load this campaign.")); }
    })();
    return () => { live = false; };
  }, []);

  const source = workspace ?? loaded?.workspace;
  const plan = useMemo(() => {
    if (!loaded || !source) return null;
    try {
      const files = rpExportFiles(source, campaignId, { includeGm, exportedAt: openedAt, tables: loaded.tables });
      return { rows: folderRows(files.map(f => f.path)), total: files.length, error: "" };
    } catch (e) { return { rows: [], total: 0, error: errorText(e, "This campaign could not be exported.") }; }
  }, [loaded, source, campaignId, includeGm, openedAt]);

  function download() {
    if (!loaded || !source) return;
    setExportError(""); setSaved("");
    try {
      const at = new Date().toISOString();
      const bytes = rpExportZip(rpExportFiles(source, campaignId, { includeGm, exportedAt: at, tables: loaded.tables }));
      const name = zipName(campaignName);
      saveFile(bytes, name); saveLastExport(campaignId, at); onExported?.(at); setSaved(`Saved ${name}`);
    } catch (e) { setExportError(errorText(e, "Could not build the ZIP.")); }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    if (picker.current) picker.current.value = "";
    if (file.size > ZIP_MAX_BYTES) { setImp({ step: "error", title: "That file is too big", message: `A ZIP over ${ZIP_MAX_BYTES / 1024 / 1024} MB cannot be imported. An RPG Tools export is much smaller.` }); return; }
    setImp({ step: "reading" });
    try {
      let entries;
      try { entries = await readZip(new Uint8Array(await file.arrayBuffer())); }
      catch (e) {
        const message = e instanceof ZipError ? e.message : "This file could not be read.";
        setImp({ step: "error", title: /unsafe file name/.test(message) ? "Unsafe file names" : /not a ZIP/.test(message) ? "Not a ZIP file" : /larger than 50 MB|more than/.test(message) ? "That ZIP is too big" : "Could not read the ZIP", message });
        return;
      }
      const kind = classifyZip(entries.map(f => f.name));
      if (kind === "player-safe") { setImp({ step: "note", title: "Player-safe export", message: "A player-safe export cannot be restored. It leaves out the GM-only folder and the restore copy, so a campaign made from it would be missing the GM's content. Use the ZIP you made with the GM-only switch on." }); return; }
      if (kind === "numbered") { setImp({ step: "note", title: "RP repository found", message: "This looks like an RP repository in the numbered layout (it has 1-Now/ or 3-People/ folders), but it was not made by RPG Tools and has no .rpg-tools/campaign.json. Importing RP repositories is coming. Nothing was changed." }); return; }
      if (kind === "unknown") { setImp({ step: "error", title: "Nothing to restore", message: "This ZIP is not an RPG Tools export or an RP repository. It has no .rpg-tools/campaign.json and no 1-Now/ or 3-People/ folders." }); return; }
      const restore = readRestoreCopy(entries);
      if (!restore.ok) { setImp({ step: "error", title: "No restore copy", message: restore.error }); return; }
      const log = entries.find(f => f.name === "8-Archive/Export-Log.md");
      setImp({ step: "found", incoming: restore.workspace, name: restore.workspace.campaigns[0].name, world: `${restore.workspace.worlds[0]?.name ?? "World"} (imported)`.slice(0, 160), date: exportedAt(log ? new TextDecoder().decode(log.data) : undefined), files: entries.length });
    } catch (e) { setImp({ step: "error", title: "Could not read the ZIP", message: errorText(e, "This file could not be read.") }); }
  }

  /** Adds the copy to the newest saved notes. It is saved with the revision just read, so a newer workspace is never overwritten. */
  async function restore() {
    if (imp.step !== "found") return;
    const found = imp;
    setImp({ ...found, step: "restoring" });
    const fail = (message: string) => setImp({ step: "error", title: "Not restored", message });
    try {
      const res = await fetch(WORKSPACE_URL, { cache: "no-store" }), body = await res.json() as { data?: unknown; revision?: number; error?: string };
      if (res.status === 401) return fail("Sign in again to restore this campaign.");
      if (!res.ok || typeof body.revision !== "number") return fail(body.error || "Could not read your notes. Nothing was changed.");
      const current = workspaceSchema.parse(body.data);
      const copy = { ...found.incoming, campaigns: found.incoming.campaigns.map(c => ({ ...c, name: `${c.name.slice(0, 150)} (copy)` })) };
      const next = importCopy(current, copy);
      if (byteLength(next) > WORKSPACE_LIMIT) return fail("Your notes plus this copy are over the 2 MB workspace limit. Nothing was changed.");
      const added = next.campaigns[next.campaigns.length - 1];
      const put = await fetch(WORKSPACE_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next, revision: body.revision }) });
      const out = await put.json().catch(() => ({})) as { error?: string };
      if (put.status === 409) return fail("Your notes changed somewhere else while this was restoring. Nothing was overwritten. Choose the file and try again.");
      if (!put.ok) return fail(out.error || "Could not save the restored campaign. Nothing was changed.");
      setImp({ step: "done", name: added.name, href: `/campaigns/${encodeURIComponent(`e:${added.id}`)}` });
      onRestored?.();
    } catch (e) { fail(errorText(e, "Could not restore this campaign.")); }
  }

  const tabs: ["export" | "import", string][] = [["export", "Export"], ["import", "Import"]];
  const showTab = canRestore ? tabs : tabs.slice(0, 1);
  return <div className="rpb-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="rpb-sheet" ref={sheet} role="dialog" aria-modal="true" aria-label="GitHub and backups" tabIndex={-1}>
      <span className="rpb-grab" aria-hidden="true" />
      <div className="rpb-head">
        <div><h2>GitHub &amp; backups</h2><p>{campaignName}</p></div>
        <button type="button" className="rpb-close" onClick={close} aria-label="Close"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="rpb-tabs" role="tablist" aria-label="Export or import" onKeyDown={e => { if (showTab.length > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { setTab(t => t === "export" ? "import" : "export"); e.preventDefault(); } }}>
        {showTab.map(([id, label]) => <button key={id} type="button" role="tab" id={`rpb-tab-${id}`} aria-selected={tab === id} aria-controls={`rpb-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="rpb-body">
        {tab === "export" ? <div role="tabpanel" id="rpb-panel-export" aria-labelledby="rpb-tab-export" className="rpb-panel">
          {loadError ? <p className="rpb-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" />{loadError}</p>
            : !plan ? <p className="rpb-muted" role="status">Loading this campaign…</p>
            : <>
              {plan.error && <p className="rpb-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" />{plan.error}</p>}
              <ul className="rpb-tree" aria-label={`Files in the export, ${plan.total} in all`}>
                {plan.rows.map(r => <li key={r.name}><span>{r.name}</span><span>{r.detail}</span></li>)}
              </ul>
              <div className="rpb-row">
                <div><b id="rpb-gm-label">Include GM-only folder</b><small>Secrets, GM tabs, Director notes</small></div>
                <button type="button" role="switch" aria-checked={includeGm} aria-labelledby="rpb-gm-label" className="rpb-switch" onClick={() => setIncludeGm(v => !v)}><span /></button>
              </div>
              <button type="button" className="rpb-primary" onClick={download} disabled={!!plan.error}><Download size={16} aria-hidden="true" />Download ZIP</button>
              {exportError && <p className="rpb-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" />{exportError}</p>}
              {saved && <p className="rpb-ok" role="status"><Check size={15} aria-hidden="true" />{saved}</p>}
              <p className="rpb-muted">The ZIP opens as a folder an AI GM can read. {includeGm ? "It includes GM-only content, so keep it to yourself." : "With the GM-only folder off, it is safe to share with players."}</p>
            </>}
        </div> : <div role="tabpanel" id="rpb-panel-import" aria-labelledby="rpb-tab-import" className="rpb-panel">
          <div className="rpb-source" aria-label="Import source"><span aria-current="true">ZIP file</span></div>
          <input ref={picker} type="file" accept=".zip,application/zip" className="rpb-file" tabIndex={-1} aria-hidden="true" onChange={e => void pick(e.target.files?.[0])} />
          {imp.step !== "done" && <button type="button" className={imp.step === "idle" || imp.step === "reading" ? "rpb-primary" : "rpb-secondary"} disabled={imp.step === "reading" || imp.step === "restoring"} onClick={() => picker.current?.click()}><FileArchive size={16} aria-hidden="true" />{imp.step === "idle" ? "Choose a ZIP file" : imp.step === "reading" ? "Reading…" : "Choose another ZIP"}</button>}
          {imp.step === "idle" && <p className="rpb-muted">Pick a ZIP you downloaded from here, or the ZIP of an RP repository. The app checks what it holds and offers only what fits. Nothing is changed until you restore.</p>}
          {imp.step === "error" && <div className="rpb-card rpb-card-error" role="alert"><b><TriangleAlert size={16} aria-hidden="true" />{imp.title}</b><span>{imp.message}</span></div>}
          {imp.step === "note" && <div className="rpb-card" role="status"><b><Info size={16} aria-hidden="true" />{imp.title}</b><span>{imp.message}</span></div>}
          {(imp.step === "found" || imp.step === "restoring") && <>
            <div className="rpb-card" role="status"><b><Check size={16} aria-hidden="true" />RPG Tools export found</b><span>{imp.name}{imp.date ? ` · exported ${shortDate(imp.date)}` : ""} · {imp.files} files</span></div>
            <div className="rpb-row rpb-choice"><div><b>Restore as a new campaign</b><small>A separate copy, with its own world named “{imp.world}”. This campaign isn&apos;t touched.</small></div><span className="rpb-dot" aria-hidden="true" /></div>
            <button type="button" className="rpb-primary" onClick={() => void restore()} disabled={imp.step === "restoring"}>{imp.step === "restoring" ? "Restoring…" : `Restore as “${imp.name.slice(0, 40)} (copy)”`}</button>
          </>}
          {imp.step === "done" && <div className="rpb-card rpb-card-ok" role="status"><b><Check size={16} aria-hidden="true" />Restored as {imp.name}</b><span>Your other campaigns were not changed.</span><a className="rpb-primary" href={imp.href}>Open campaign</a></div>}
        </div>}
      </div>
    </div>
  </div>;
}
