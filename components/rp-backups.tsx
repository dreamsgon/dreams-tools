"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Download, FileArchive, FolderOpen, GitBranch as Github, Info, TriangleAlert, Upload, X } from "lucide-react";
import { importCopy, workspaceSchema, type Workspace } from "@/lib/encyclopedia/world-model";
import { librarySchema, emptyLibrary, type TableLibrary } from "@/lib/encyclopedia/tables";
import { rpExportFiles } from "@/lib/encyclopedia/rp-export";
import { rpExportZip, readRestoreCopy } from "@/lib/encyclopedia/rp-zip";
import { addImported, buildCampaign, previewRepo, readSources, type ImportPreview, type Source } from "@/lib/encyclopedia/rp-import";
import { readZip, ZipError, ZIP_MAX_BYTES } from "@/lib/zip-read";
import { classifyZip, defaultCommitMessage, exportedAt, folderRows, lastExportKey, lastPushKey, restoreNotice, shortDate, zipName, type LastPush } from "@/lib/encyclopedia/rp-sheet";
import { readLastPush } from "@/lib/encyclopedia/rp-last";
import { readRepoChanges, readRepoFiles, readRepoRestore, type PushResult } from "@/lib/github-push";
import { isThisCampaign, planBringBack, readBringSources, saveBringBack, type BringBackPlan, type FilesMap, type PlanInput, type Selection } from "@/lib/encyclopedia/rp-bring-back";
import { forgetKey, readKey } from "@/lib/github-key";
import { ConnectView, PushView, githubFetch } from "./rp-github";
import { BringBackView } from "./rp-bring-back";
import { memberRef } from "./encyclopedia/member-view";
import "./rp-backups.css";

const WORKSPACE_LIMIT = 2_000_000;
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const WORKSPACE_URL = "/api/encyclopedia/workspace";

function saveLastExport(campaignId: string, iso: string) { try { window.localStorage.setItem(lastExportKey(campaignId), iso); } catch { /* Not remembered. */ } }
function saveLastPush(campaignId: string, push: LastPush) { try { window.localStorage.setItem(lastPushKey(campaignId), JSON.stringify(push)); } catch { /* Not remembered. */ } }
type Github = { repository: string; branch: string };

type Loaded = { workspace: Workspace; tables: TableLibrary };
/** The changes in a repository that came from this campaign, read and compared, ready to review. */
type Bring = { plan: BringBackPlan; input: PlanInput; label: string };
type Found = { incoming: Workspace; name: string; world: string; date: string | null; files: number; bring: Bring | null; mode: "restore" | "bring" };
type Notice = { tone: "warn" | "error"; text: string };
type Imported =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "error"; title: string; message: string }
  | { step: "note"; title: string; message: string }
  | ({ step: "found" | "restoring" } & Found)
  | { step: "bring" | "bringing"; found: Found; bring: Bring; notice: Notice | null; rev: number }
  | { step: "brought"; count: number }
  | { step: "preview" | "importing"; preview: ImportPreview; name: string; show: boolean }
  | { step: "done"; name: string; href: string; verb: "Restored" | "Imported" };

/** The "found" card for a restore copy, from a ZIP or a repository. */
function foundFrom(workspace: Workspace, date: string | null, files: number, bring: Bring | null = null): Imported {
  return { step: "found", incoming: workspace, name: workspace.campaigns[0].name, world: `${workspace.worlds[0]?.name ?? "World"} (imported)`.slice(0, 160), date, files, bring, mode: "restore" };
}
const changedFiles = (bring: Bring) => new Set(bring.plan.rows.map(r => r.path)).size;
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
export function BackupsSheet({ campaignId, campaignName, close, returnFocus, workspace, canRestore = true, onExported, onPushed, onRestored, onSaveGithub }: {
  campaignId: string; campaignName: string; close: () => void; returnFocus?: React.RefObject<HTMLElement | null>;
  workspace?: Workspace; canRestore?: boolean; onExported?: (iso: string) => void; onPushed?: (push: LastPush) => void; onRestored?: () => void;
  /** Saves the campaign's repository and branch. The Encyclopedia passes its own `change`; without it the sheet saves through the workspace API. Returns false when it could not save. */
  onSaveGithub?: (github: Github) => boolean;
}) {
  const [tab, setTab] = useState<"export" | "import">("export"), [includeGm, setIncludeGm] = useState(true);
  const [view, setView] = useState<"main" | "connect" | "push">("main"), [then, setThen] = useState<"export" | "push" | "import">("export");
  const [source, setSource] = useState<"zip" | "github" | "folder">("zip"), [savedGh, setSavedGh] = useState<Github | null>(null), [keyTick, setKeyTick] = useState(0);
  const [lastPush, setLastPush] = useState<LastPush | null>(() => readLastPush(campaignId));
  const [memKey, setMemKey] = useState<{ repo: string; token: string } | null>(null), busy = useRef(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null), [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(""), [exportError, setExportError] = useState("");
  const [imp, setImp] = useState<Imported>({ step: "idle" }), [canFolder] = useState(() => typeof document !== "undefined" && "webkitdirectory" in document.createElement("input"));
  const sheet = useRef<HTMLDivElement>(null), picker = useRef<HTMLInputElement>(null), folderPicker = useRef<HTMLInputElement>(null), closeRef = useRef(close);
  const [opener] = useState(() => typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const [openedAt] = useState(() => new Date().toISOString());
  const latest = useRef(workspace);
  useEffect(() => { closeRef.current = () => { if (!busy.current) close(); }; latest.current = workspace; });
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

  const notes = workspace ?? loaded?.workspace;
  const campaign = notes?.campaigns.find(c => c.id === campaignId);
  const github: Github = savedGh ?? campaign?.github ?? { repository: "", branch: "main" };
  const repo = github.repository, canPush = canRestore && !!repo;
  const tokenFor = (r: string) => (memKey?.repo.toLowerCase() === r.toLowerCase() ? memKey.token : null) ?? readKey(r);
  void keyTick;
  const plan = useMemo(() => {
    if (!loaded || !notes) return null;
    try {
      const files = rpExportFiles(notes, campaignId, { includeGm, exportedAt: openedAt, tables: loaded.tables });
      return { rows: folderRows(files.map(f => f.path)), total: files.length, error: "" };
    } catch (e) { return { rows: [], total: 0, error: errorText(e, "This campaign could not be exported.") }; }
  }, [loaded, notes, campaignId, includeGm, openedAt]);

  function download() {
    if (!loaded || !notes) return;
    setExportError(""); setSaved("");
    try {
      const at = new Date().toISOString();
      const bytes = rpExportZip(rpExportFiles(notes, campaignId, { includeGm, exportedAt: at, tables: loaded.tables }));
      const name = zipName(campaignName);
      saveFile(bytes, name); saveLastExport(campaignId, at); onExported?.(at); setSaved(`Saved ${name}`);
    } catch (e) { setExportError(errorText(e, "Could not build the ZIP.")); }
  }

  /** The saved notes (not unsaved edits), so what is reviewed is what the save will be made from. */
  async function loadSaved(): Promise<Workspace | null> {
    try {
      const res = await fetch(WORKSPACE_URL, { cache: "no-store" }), body = await res.json() as { data?: unknown };
      return res.ok ? workspaceSchema.parse(body.data) : null;
    } catch { return null; }
  }
  async function makeBring(map: FilesMap, files: PlanInput["files"], log: string | undefined, label: string): Promise<Bring | null> {
    if (!isThisCampaign(map, campaignId)) return null;
    const saved = await loadSaved();
    if (!saved || !saved.campaigns.some(c => c.id === campaignId)) return null;
    const input = { map, files, log };
    return { plan: planBringBack(saved, campaignId, input), input, label };
  }

  /** What a set of files is: a restore copy, an RP repository to import as a new campaign, or neither. */
  async function analyse(sources: Source[], where: "ZIP" | "folder", label: string) {
    const names = sources.map(f => f.name), kind = classifyZip(names);
    if (kind === "restore") {
      const wanted = sources.filter(f => f.name === ".rpg-tools/campaign.json" || f.name === ".rpg-tools/files.json" || /^world-manager\/[^/]+\/campaign\.json$/.test(f.name));
      const restore = readRestoreCopy(await Promise.all(wanted.map(async f => ({ name: f.name, data: await f.bytes() }))));
      if (!restore.ok) { setImp(restoreNotice(kind, where, restore.error)); return; }
      const log = sources.find(f => f.name === "8-Archive/Export-Log.md");
      let bring: Bring | null = null;
      // An export of this very campaign can also be brought back; a copy made elsewhere (or restored before) has other ids and only offers Restore.
      if (restore.workspace.campaigns[0].id === campaignId) { const read = await readBringSources(sources); if (read.ok) bring = await makeBring(read.map, read.files, read.log, label); }
      setImp(foundFrom(restore.workspace, exportedAt(log ? new TextDecoder().decode(await log.bytes()) : undefined), names.length, bring));
      return;
    }
    if (kind === "numbered" || kind === "player-safe") {
      const read = await readSources(sources);
      if (!read.ok) { setImp({ step: "error", title: "Cannot import this repository", message: read.error }); return; }
      const result = previewRepo(read.files, { name: label });
      if (!result.ok) { setImp(kind === "player-safe" ? restoreNotice(kind, where, "") : { step: "error", title: "Cannot import this repository", message: result.error }); return; }
      setImp({ step: "preview", preview: result, name: result.campaignName, show: false });
      return;
    }
    setImp(restoreNotice(kind, where, ""));
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
      await analyse(entries.map(e => ({ name: e.name, size: e.data.length, bytes: async () => e.data })), "ZIP", file.name.replace(/\.zip$/i, ""));
    } catch (e) { setImp({ step: "error", title: "Could not read the ZIP", message: errorText(e, "This file could not be read.") }); }
  }

  /** A folder picked on this device: the same reading as a ZIP, with the picked folder as the top of the repository. */
  async function pickFolder(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (folderPicker.current) folderPicker.current.value = "";
    if (!files.length) return;
    setImp({ step: "reading" });
    try {
      const rel = (f: File) => f.webkitRelativePath || f.name;
      const sources = files.map(f => ({ name: rel(f).split("/").slice(1).join("/") || f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()) }));
      await analyse(sources, "folder", rel(files[0]).split("/")[0]);
    } catch (e) { setImp({ step: "error", title: "Could not read the folder", message: errorText(e, "This folder could not be read.") }); }
  }

  /** Reads .rpg-tools/campaign.json (or the old world-manager copy) from the saved repository and branch with the key kept on this device. */
  async function readGithub() {
    const token = tokenFor(repo);
    if (!repo || !token) { setThen("import"); setView("connect"); return; }
    setImp({ step: "reading" });
    try {
      const got = await readRepoRestore(token, repo, github.branch, githubFetch);
      if (got.ok) {
        let bring: Bring | null = null;
        if (got.workspace.campaigns[0].id === campaignId) { const ch = await readRepoChanges(token, repo, github.branch, githubFetch); if (ch.ok) bring = await makeBring(ch.map, ch.files, ch.log, repo); }
        setImp(foundFrom(got.workspace, got.date, got.files, bring)); return;
      }
      if (got.kind !== "numbered" && got.kind !== "player-safe") { setImp(restoreNotice(got.kind, "repository", got.error)); return; }
      const read = await readRepoFiles(token, repo, github.branch, githubFetch);
      if (!read.ok) { setImp({ step: "error", title: "Cannot import this repository", message: read.error }); return; }
      const result = previewRepo(read.files, { name: repo.split("/")[1] ?? repo });
      if (!result.ok) { setImp(got.kind === "player-safe" ? restoreNotice(got.kind, "repository", got.error) : { step: "error", title: "Cannot import this repository", message: result.error }); return; }
      if (read.truncated) result.notices.push("GitHub cut the list of files short because the repository is very large, so some files may be missing from this import.");
      setImp({ step: "preview", preview: result, name: result.campaignName, show: false });
    } catch (e) { setImp({ step: "error", title: "Could not read the repository", message: errorText(e, "Could not read the repository.") }); }
  }

  /** Saves the campaign's repository and branch. Returns a message when it could not. */
  async function saveGithub(next: Github): Promise<string | null> {
    if (onSaveGithub) { if (!onSaveGithub(next)) return "Could not save the repository settings."; setSavedGh(next); setImp(i => i.step === "reading" || i.step === "restoring" || i.step === "importing" ? i : { step: "idle" }); return null; }
    try {
      const res = await fetch(WORKSPACE_URL, { cache: "no-store" }), body = await res.json() as { data?: unknown; revision?: number; error?: string };
      if (res.status === 401) return "Sign in again to save the repository.";
      if (!res.ok || typeof body.revision !== "number") return body.error || "Could not read your notes. The repository was not saved.";
      const current = workspaceSchema.parse(body.data);
      if (!current.campaigns.some(c => c.id === campaignId)) return "This campaign was not found in your notes.";
      const updated = { ...current, campaigns: current.campaigns.map(c => c.id === campaignId ? { ...c, github: next } : c) };
      const put = await fetch(WORKSPACE_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: updated, revision: body.revision }) });
      const out = await put.json().catch(() => ({})) as { error?: string };
      if (put.status === 409) return "Your notes changed somewhere else, so the repository was not saved. Try again.";
      if (!put.ok) return out.error || "Could not save the repository.";
      setSavedGh(next); setImp(i => i.step === "reading" || i.step === "restoring" || i.step === "importing" ? i : { step: "idle" });
      setLoaded(l => l && { ...l, workspace: updated });
      return null;
    } catch (e) { return errorText(e, "Could not save the repository."); }
  }

  function connect(next: "export" | "push" | "import") { setThen(next); setView("connect"); }
  function startPush() { if (!repo) return connect("push"); if (!tokenFor(repo)) return connect("push"); setView("push"); }
  function pushed(res: PushResult) {
    const note: LastPush = { at: new Date().toISOString(), repository: repo, branch: github.branch, url: res.url };
    saveLastPush(campaignId, note); setLastPush(note); onPushed?.(note);
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
      setImp({ step: "done", name: added.name, href: `/campaigns/${encodeURIComponent(`e:${added.id}`)}`, verb: "Restored" });
      onRestored?.();
    } catch (e) { fail(errorText(e, "Could not restore this campaign.")); }
  }

  /** Brings the picked rows back (see saveBringBack): page history first, then one save with the revision just read. */
  async function submitBring(sel: Selection) {
    if (imp.step !== "bring" || busy.current) return;
    const cur = imp;
    busy.current = true;
    setImp({ ...cur, step: "bringing", notice: null });
    try {
      const out = await saveBringBack({ fetch: (url, init) => fetch(url, init), campaignId, plan: cur.bring.plan, input: cur.bring.input, sel });
      if (out.status === "done") { setImp({ step: "brought", count: out.count }); onRestored?.(); }
      else if (out.status === "changed") setImp({ ...cur, step: "bring", bring: { ...cur.bring, plan: out.plan }, rev: cur.rev + 1, notice: { tone: "warn", text: "This campaign changed while you were reviewing. Review again." } });
      else setImp({ ...cur, step: "bring", notice: { tone: "error", text: out.message } });
    } catch (e) { setImp({ ...cur, step: "bring", notice: { tone: "error", text: errorText(e, "Could not bring back the changes. Nothing was changed.") } }); }
    finally { busy.current = false; }
  }

  /** Adds the new campaign to the newest saved notes, with the revision just read, so a newer workspace is never overwritten. Existing campaigns are not touched. */
  async function importNew() {
    if (imp.step !== "preview" || busy.current) return;
    busy.current = true;
    const found = imp;
    setImp({ ...found, step: "importing" });
    const fail = (message: string) => setImp({ step: "error", title: "Not imported", message });
    try {
      const res = await fetch(WORKSPACE_URL, { cache: "no-store" }), body = await res.json() as { data?: unknown; revision?: number; error?: string };
      if (res.status === 401) return fail("Sign in again to import this repository.");
      if (!res.ok || typeof body.revision !== "number") return fail(body.error || "Could not read your notes. Nothing was changed.");
      const current = workspaceSchema.parse(body.data);
      const built = buildCampaign(found.preview, { name: found.name, showPlayers: found.show });
      if (current.entries.length + built.workspace.entries.length > 5000 || current.campaigns.length >= 500 || current.worlds.length >= 100) return fail("Your notes have no room for another campaign of this size (the limit is 5,000 pages, 500 campaigns and 100 worlds). Nothing was changed.");
      const next = addImported(current, built);
      if (byteLength(next) > WORKSPACE_LIMIT) return fail("Your notes plus this campaign are over the 2 MB workspace limit. Nothing was changed.");
      const put = await fetch(WORKSPACE_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next, revision: body.revision }) });
      const out = await put.json().catch(() => ({})) as { error?: string };
      if (put.status === 409) return fail("Your notes changed somewhere else while this was importing. Nothing was overwritten. Choose the repository and try again.");
      if (!put.ok) return fail(out.error || "Could not save the imported campaign. Nothing was changed.");
      setImp({ step: "done", name: built.name, href: `/campaigns/${encodeURIComponent(`e:${built.campaignId}`)}`, verb: "Imported" });
      onRestored?.();
    } catch (e) { fail(errorText(e, "Could not import this repository.")); }
    finally { busy.current = false; }
  }

  const chips: ["zip" | "github" | "folder", string][] = [["zip", "ZIP file"], ["github", "GitHub"], ...(canFolder ? [["folder", "Folder"] as ["folder", string]] : [])];
  const working = imp.step === "reading" || imp.step === "restoring" || imp.step === "importing" || imp.step === "bringing";
  const inBring = imp.step === "bring" || imp.step === "bringing" || imp.step === "brought";
  const tabs: ["export" | "import", string][] = [["export", "Export"], ["import", "Import"]];
  const showTab = canRestore ? tabs : tabs.slice(0, 1);
  return <div className="rpb-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy.current) close(); }}>
    <div className="rpb-sheet" ref={sheet} role="dialog" aria-modal="true" aria-label="GitHub and backups" tabIndex={-1}>
      <span className="rpb-grab" aria-hidden="true" />
      <div className="rpb-head">
        <div><h2>GitHub &amp; backups</h2><p>{campaignName}</p></div>
        <button type="button" className="rpb-close" onClick={() => { if (!busy.current) close(); }} aria-label="Close"><X size={18} aria-hidden="true" /></button>
      </div>
      {view === "main" && <div className="rpb-tabs" role="tablist" aria-label="Export or import" onKeyDown={e => { if (showTab.length > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { setTab(t => t === "export" ? "import" : "export"); e.preventDefault(); } }}>
        {showTab.map(([id, label]) => <button key={id} type="button" role="tab" id={`rpb-tab-${id}`} aria-selected={tab === id} aria-controls={`rpb-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{label}</button>)}
      </div>}
      <div className="rpb-body">
        {view === "connect" ? <ConnectView initialRepo={repo} initialBranch={github.branch} tokenFor={tokenFor} saveConfig={saveGithub}
            onToken={(r, t) => { setMemKey({ repo: r, token: t }); setKeyTick(n => n + 1); }}
            onForget={r => { setMemKey(m => m?.repo.toLowerCase() === r.toLowerCase() ? null : m); forgetKey(r); setKeyTick(n => n + 1); }}
            onBack={() => setView("main")} continueLabel={then === "push" ? "Continue to push" : then === "import" ? "Continue to import" : "Back to export"}
            onContinue={() => { if (then === "push" && canPush) setView("push"); else { setView("main"); if (then === "import") { setTab("import"); setSource("github"); } } }} />
        : view === "push" && plan && loaded && notes ? <PushView repo={repo} branch={github.branch} token={tokenFor(repo) ?? ""} includeGm={includeGm} defaultMessage={defaultCommitMessage(notes, campaignId)}
            build={log => rpExportFiles(notes, campaignId, { includeGm, exportedAt: new Date().toISOString(), tables: loaded.tables, exportLog: log })}
            onBack={() => setView("main")} onChangeKey={() => connect("push")} onPushed={pushed} onBusy={b => { busy.current = b; }} />
        : tab === "export" ? <div role="tabpanel" id="rpb-panel-export" aria-labelledby="rpb-tab-export" className="rpb-panel">
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
              {canRestore && (repo
                ? <div className="rpb-row"><div><b>{repo}</b><small>Branch {github.branch}{lastPush && lastPush.repository === repo ? ` · last push ${shortDate(lastPush.at)}` : ""}</small></div><button type="button" className="rpb-link" onClick={() => connect("export")}>Change</button></div>
                : <button type="button" className="rpb-row rpb-connect" onClick={() => connect("push")}><div><b>Connect a GitHub repository</b><small>Push this campaign to your own repository, private or public</small></div><Github size={18} aria-hidden="true" /></button>)}
              <div className={canPush ? "rpb-btns" : undefined}>
                <button type="button" className={canPush ? "rpb-secondary" : "rpb-primary"} onClick={download} disabled={!!plan.error}><Download size={16} aria-hidden="true" />Download ZIP</button>
                {canPush && <button type="button" className="rpb-primary" onClick={startPush} disabled={!!plan.error}><Upload size={16} aria-hidden="true" />Push to GitHub</button>}
              </div>
              {exportError && <p className="rpb-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" />{exportError}</p>}
              {saved && <p className="rpb-ok" role="status"><Check size={15} aria-hidden="true" />{saved}</p>}
              <p className="rpb-muted">The ZIP opens as a folder an AI GM can read. {includeGm ? "It includes GM-only content, so keep it to yourself." : "With the GM-only folder off, it is safe to share with players."}</p>
            </>}
        </div> : <div role="tabpanel" id="rpb-panel-import" aria-labelledby="rpb-tab-import" className="rpb-panel">
          {!inBring && <>
          <div className="rpb-source" role="group" aria-label="Import source">
            {chips.map(([id, text]) =>
              <button key={id} type="button" aria-pressed={source === id} disabled={working} onClick={() => { if (source !== id) { setSource(id); setImp({ step: "idle" }); } }}>{text}</button>)}
          </div>
          {source === "github" && <div className="rpb-row"><div><b>{repo || "No repository connected"}</b><small>{repo ? `Branch ${github.branch}` : "Connect one to read it back"}</small></div><button type="button" className="rpb-link" onClick={() => connect("import")}>{repo ? "Change" : "Connect"}</button></div>}
          <input ref={picker} type="file" accept=".zip,application/zip" className="rpb-file" tabIndex={-1} aria-hidden="true" onChange={e => void pick(e.target.files?.[0])} />
          <input ref={folderPicker} type="file" multiple className="rpb-file" tabIndex={-1} aria-hidden="true" {...({ webkitdirectory: "" } as Record<string, string>)} onChange={e => void pickFolder(e.target.files)} />
          {imp.step !== "done" && <button type="button" className={imp.step === "idle" || imp.step === "reading" ? "rpb-primary" : "rpb-secondary"} disabled={working} onClick={() => source === "zip" ? picker.current?.click() : source === "folder" ? folderPicker.current?.click() : void readGithub()}>{source === "zip" ? <FileArchive size={16} aria-hidden="true" /> : source === "folder" ? <FolderOpen size={16} aria-hidden="true" /> : <Github size={16} aria-hidden="true" />}{imp.step === "reading" ? "Reading…" : source === "zip" ? (imp.step === "idle" ? "Choose a ZIP file" : "Choose another ZIP") : source === "folder" ? (imp.step === "idle" ? "Choose a folder" : "Choose another folder") : !repo ? "Connect a GitHub repository" : imp.step === "idle" ? `Read ${repo}` : "Read it again"}</button>}
          {imp.step === "idle" && <p className="rpb-muted">{source === "zip" ? "Pick a ZIP you downloaded from here, or the ZIP of an RP repository (GitHub's Download ZIP works). The app checks what it holds and offers only what fits. Nothing is changed until you import." : source === "folder" ? "Pick the folder of an RP repository on this device. It is read here in your browser. Nothing is changed until you import." : "Reads the branch from GitHub with the key saved on this device and checks what it holds. Nothing is changed until you import."}</p>}
          </>}
          {imp.step === "error" && <div className="rpb-card rpb-card-error" role="alert"><b><TriangleAlert size={16} aria-hidden="true" />{imp.title}</b><span>{imp.message}</span></div>}
          {imp.step === "note" && <div className="rpb-card" role="status"><b><Info size={16} aria-hidden="true" />{imp.title}</b><span>{imp.message}</span></div>}
          {(imp.step === "found" || imp.step === "restoring") && <FoundCard imp={imp} onMode={mode => setImp({ ...imp, mode })} onRestore={() => void restore()} onReview={() => imp.bring && setImp({ step: "bring", found: imp, bring: imp.bring, notice: null, rev: 0 })} />}
          {(imp.step === "bring" || imp.step === "bringing") && <BringBackView key={imp.rev} plan={imp.bring.plan} repoLabel={imp.bring.label} notice={imp.notice} busy={imp.step === "bringing"} onBack={() => setImp({ ...imp.found, step: "found", bring: imp.bring })} onSubmit={sel => void submitBring(sel)} />}
          {imp.step === "brought" && <div className="rpb-card rpb-card-ok" role="status"><b><Check size={16} aria-hidden="true" />Brought back {plural(imp.count, "change", "changes")}</b><span>Each page that was changed kept its earlier version in Page history. Pushing again will make the repo match the campaign.</span><button type="button" className="rpb-primary" onClick={close}>Done</button></div>}
          {(imp.step === "preview" || imp.step === "importing") && <ImportPreviewView preview={imp.preview} name={imp.name} show={imp.show} busy={imp.step === "importing"} onName={name => setImp({ ...imp, name })} onShow={show => setImp({ ...imp, show })} onImport={() => void importNew()} />}
          {imp.step === "done" && <div className="rpb-card rpb-card-ok" role="status"><b><Check size={16} aria-hidden="true" />{imp.verb} as {imp.name}</b><span>Your other campaigns were not changed.</span><a className="rpb-primary" href={imp.href}>Open campaign</a></div>}
        </div>}
      </div>
    </div>
  </div>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The found card for an export, with the choice between a separate copy and bringing the repo's changes back into this campaign. */
function FoundCard({ imp, onMode, onRestore, onReview }: { imp: Extract<Imported, { step: "found" | "restoring" }>; onMode: (mode: "restore" | "bring") => void; onRestore: () => void; onReview: () => void }) {
  const bring = imp.bring, n = bring ? changedFiles(bring) : 0, busy = imp.step === "restoring", group = useId();
  const mode = bring && n > 0 ? imp.mode : "restore";
  return <>
    <div className="rpb-card" role="status"><b><Check size={16} aria-hidden="true" />RPG Tools export found</b><span>{imp.name}{imp.date ? ` · exported ${shortDate(imp.date)}` : ""} · {imp.files} files</span></div>
    {bring ? <div className="rpb-panel" role="radiogroup" aria-label="What to do with this export">
      <label className={`rpb-row rpb-radio${mode === "restore" ? " rpb-choice" : ""}`}><input type="radio" name={group} checked={mode === "restore"} disabled={busy} onChange={() => onMode("restore")} /><div><b>Restore as a new campaign</b><small>A separate copy, with its own world named “{imp.world}”. This campaign isn&apos;t touched.</small></div><span className="rpb-dot" aria-hidden="true" /></label>
      <label className={`rpb-row rpb-radio${mode === "bring" ? " rpb-choice" : ""}`}><input type="radio" name={group} checked={mode === "bring"} disabled={busy || n === 0} onChange={() => onMode("bring")} /><div><b>Bring back changes</b><small>{n === 0 ? "Nothing changed in the repo since your last push." : `${plural(n, "file", "files")} changed in the repo since your last push.`}</small></div><span className="rpb-dot" aria-hidden="true" /></label>
    </div>
      : <div className="rpb-row rpb-choice"><div><b>Restore as a new campaign</b><small>A separate copy, with its own world named “{imp.world}”. This campaign isn&apos;t touched.</small></div><span className="rpb-dot" aria-hidden="true" /></div>}
    {mode === "bring" ? <button type="button" className="rpb-primary" onClick={onReview}>Review {plural(n, "change", "changes")}</button>
      : <button type="button" className="rpb-primary" onClick={onRestore} disabled={busy}>{busy ? "Restoring…" : `Restore as “${imp.name.slice(0, 40)} (copy)”`}</button>}
  </>;
}
/** The mapping preview: what each part of the repository becomes. Nothing is created until the button is pressed. */
function ImportPreviewView({ preview, name, show, busy, onName, onShow, onImport }: { preview: ImportPreview; name: string; show: boolean; busy: boolean; onName: (name: string) => void; onShow: (show: boolean) => void; onImport: () => void }) {
  const gone = preview.notImported.reduce((n, x) => n + x.count, 0);
  return <>
    <div className="rpb-card" role="status"><b><Check size={16} aria-hidden="true" />RP repository in the numbered layout</b><span>{preview.repoName} · {preview.files} files</span></div>
    <h3 className="rpb-h">What becomes what</h3>
    <ul className="rpb-map" aria-label="What becomes what">
      {preview.rows.map(r => <li key={r.from + r.to}><span className="rpb-from">{r.from}</span><span className="rpb-to">→ {r.to}{r.to.startsWith("Front page") ? null : <em> ({r.count})</em>}{r.note ? <small> · {r.note}</small> : null}</span></li>)}
      {preview.stays > 0 && <li><span className="rpb-from">7-Library/</span><span className="rpb-to">→ Stays in the repo <small>· never copied ({plural(preview.stays, "file", "files")})</small></span></li>}
      {gone > 0 && <li><span className="rpb-from">{preview.notImported.map(x => x.label).join(", ")}</span><span className="rpb-to">→ Not imported <em>({gone})</em></span></li>}
    </ul>
    {preview.unmatched > 0 && <p className="rpb-note">{preview.unmatched === 1 ? "1 file didn't match a folder and goes" : `${preview.unmatched} files didn't match a folder and go`} into an “Imported notes” folder.</p>}
    {preview.skipped > 0 && <p className="rpb-muted">{plural(preview.skipped, "image or other file is", "images and other files are")} skipped. Only Markdown is imported.</p>}
    {preview.notices.map(n => <p key={n} className="rpb-note">{n}</p>)}
    <p className="rpb-muted">Every page starts as GM-only unless you turn on “Show to players” below. <span className="rpb-nw">6-GM-Only</span> pages and Imported notes always stay GM-only. You can change any page afterwards.</p>
    <div className="rpb-row">
      <div><b id="rpb-show-label">Show to players</b><small>Pages outside 6-GM-Only appear on the player link. GM-only pages stay hidden.</small></div>
      <button type="button" role="switch" aria-checked={show} aria-labelledby="rpb-show-label" className="rpb-switch" disabled={busy} onClick={() => onShow(!show)}><span /></button>
    </div>
    <label className="rpb-field">Campaign name<input value={name} maxLength={160} disabled={busy} onChange={e => onName(e.target.value)} /></label>
    <button type="button" className="rpb-primary" onClick={onImport} disabled={busy || !name.trim()}>{busy ? "Importing…" : "Import as a new campaign"}</button>
    <p className="rpb-muted">Nothing is created until you press the button. Your other campaigns are never touched.</p>
  </>;
}
