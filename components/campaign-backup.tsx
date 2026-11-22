"use client";
import { useRef, useState } from "react";
import { Copy, Download, Trash2, Upload } from "lucide-react";
import type { CampaignRow, CampaignSummary } from "@/lib/campaign-links";
import { campaignBackupZip, deleteCampaign, duplicateCampaign, importBackupZip, saveBlob } from "@/lib/campaign-backup-client";
import { Modal } from "./campaigns-modal";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Downloads the campaign's backup ZIP, showing what it is doing on the button. */
function useBackup(row: CampaignRow) {
  const [step, setStep] = useState(""), [error, setError] = useState(""), [done, setDone] = useState("");
  async function run() {
    setError(""); setDone("");
    try {
      const made = await campaignBackupZip(row.key, setStep);
      saveBlob(made.blob, made.name);
      setDone(made.missing ? `Downloaded ${made.name}. ${plural(made.missing, "picture")} could not be found and ${made.missing === 1 ? "is" : "are"} not in it.` : `Downloaded ${made.name}.`);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "The backup could not be made."); return false; }
    finally { setStep(""); }
  }
  return { step, error, done, run };
}

/** The Duplicate, Backup and Delete part of a campaign's details. */
export function CampaignBackupSection({ row, busy, onDeleted, onDuplicated }: { row: CampaignRow; busy: boolean; onDeleted: (summary: CampaignSummary, name: string) => void; onDuplicated: (summary: CampaignSummary, key: string, name: string, warning: string) => void }) {
  const backup = useBackup(row), [deleting, setDeleting] = useState(false), [copying, setCopying] = useState(false);
  return <section className="campaigns-backup" aria-label="Duplicate, backup and delete">
    <h3>Duplicate</h3>
    <p className="campaigns-muted">Make a new campaign from this one&apos;s setup: its maps, pages, forum boards, theme and groups. Handy for running the same adventure again.</p>
    <button type="button" className="campaigns-secondary" disabled={busy || !!backup.step} onClick={() => setCopying(true)}><Copy size={16} aria-hidden="true" />Duplicate…</button>
    {copying && <DuplicateCampaign row={row} close={() => setCopying(false)} onDuplicated={onDuplicated} />}
    <h3>Backup</h3>
    <p className="campaigns-muted">A ZIP with this campaign&apos;s maps, notes, forum and pictures. Import it on the Campaigns page to bring it back as a new campaign.</p>
    <button type="button" className="campaigns-secondary" disabled={busy || !!backup.step} onClick={() => void backup.run()}><Download size={16} aria-hidden="true" />{backup.step || "Download backup"}</button>
    {backup.done && <p className="campaigns-muted" role="status">{backup.done}</p>}
    {backup.error && <p className="campaigns-error" role="alert">{backup.error}</p>}
    <button type="button" className="campaigns-delete-open" disabled={busy || !!backup.step} onClick={() => setDeleting(true)}><Trash2 size={15} aria-hidden="true" />Delete campaign…</button>
    {deleting && <DeleteCampaign row={row} close={() => setDeleting(false)} onDeleted={onDeleted} />}
  </section>;
}

function DeleteCampaign({ row, close, onDeleted }: { row: CampaignRow; close: () => void; onDeleted: (summary: CampaignSummary, name: string) => void }) {
  const backup = useBackup(row), [typed, setTyped] = useState(""), [working, setWorking] = useState(false), [error, setError] = useState("");
  const matches = typed.trim().toLocaleLowerCase() === row.name.trim().toLocaleLowerCase();
  const parts = [
    row.maptable && `${plural(row.maptable.scenes, "scene")} in Maptable, with its saved tokens`,
    row.encyclopedia && `${plural(row.encyclopedia.pages, "page")} in the Wiki (${row.encyclopedia.worldName ? `${row.encyclopedia.worldName}'s` : "the world's"} shared lore stays)`,
    row.encyclopedia?.forum && "its forum and every post in it",
    row.encyclopedia && "its saved AI chats, session transcripts and random tables used only in it",
  ].filter(Boolean) as string[];
  async function remove() {
    setWorking(true); setError("");
    try { const r = await deleteCampaign(row.key, typed); onDeleted(r.summary, r.deleted); }
    catch (e) { setError(e instanceof Error ? e.message : "The campaign could not be deleted."); setWorking(false); }
  }
  const busy = working || !!backup.step;
  return <Modal title={`Delete ${row.name}?`} close={busy ? () => {} : close} footer={<>
    <button type="button" className="campaigns-secondary" disabled={busy} onClick={close}>Keep it</button>
    <button type="submit" form="delete-campaign" className="campaigns-danger campaigns-danger-big" disabled={busy || !matches}><Trash2 size={16} aria-hidden="true" />{working ? "Deleting…" : "Delete forever"}</button>
  </>}>
    <form id="delete-campaign" className="campaigns-form" onSubmit={e => { e.preventDefault(); if (matches && !busy) void remove(); }}>
      <p>This deletes, from both tools:</p>
      <ul className="campaigns-delete-list">{parts.map(p => <li key={p}>{p}</li>)}</ul>
      <p>Player links, invite links, AI connections and agent keys for it stop working, and its members lose access. This can&apos;t be undone from here.</p>
      <div className="campaigns-delete-backup">
        <span>Keep a copy first. You can import it later to bring the campaign back.</span>
        <button type="button" className="campaigns-secondary" disabled={busy} onClick={() => void backup.run()}><Download size={16} aria-hidden="true" />{backup.step || "Download backup"}</button>
        {backup.done && <small role="status">{backup.done}</small>}
        {backup.error && <small className="campaigns-error" role="alert">{backup.error}</small>}
      </div>
      <label><span>Type <strong>{row.name}</strong> to confirm</span><input value={typed} autoComplete="off" spellCheck={false} disabled={busy} onChange={e => setTyped(e.target.value)} /></label>
      {error && <p className="campaigns-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}

/** Import: pick a backup ZIP and add it as a new campaign. */
export function ImportCampaign({ close, onImported }: { close: () => void; onImported: (summary: CampaignSummary, key: string, name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [step, setStep] = useState(""), [error, setError] = useState("");
  async function run() {
    if (!file) return;
    setError("");
    try { const r = await importBackupZip(file, setStep); onImported(r.summary, r.key, r.name); }
    catch (e) { setError(e instanceof Error ? e.message : "The backup could not be imported."); }
    finally { setStep(""); }
  }
  return <Modal title="Import a campaign" intro="Choose a campaign backup ZIP (made with Download backup). It's added as a new campaign; nothing you already have changes." close={step ? () => {} : close} footer={<>
    <button type="button" className="campaigns-secondary" disabled={!!step} onClick={close}>Cancel</button>
    <button type="button" className="campaigns-primary" disabled={!file || !!step} onClick={() => void run()}><Upload size={16} aria-hidden="true" />{step ? "Importing…" : "Import"}</button>
  </>}>
    <div className="campaigns-form">
      <label>Backup ZIP<input ref={input} type="file" accept=".zip,application/zip" disabled={!!step} onChange={e => { setFile(e.target.files?.[0] ?? null); setError(""); }} /></label>
      {file && !step && <small>{file.name}, {(file.size / 1024 / 1024).toFixed(1)} MB</small>}
      {step && <p className="campaigns-muted" role="status" aria-live="polite">{step}</p>}
      {error && <p className="campaigns-error" role="alert">{error}</p>}
      <small>Its pictures are uploaded unless your account already has them. People in the campaign aren&apos;t included: invite them again.</small>
    </div>
  </Modal>;
}

/** Duplicate: a new campaign from this one, with the choices that change what comes along. */
function DuplicateCampaign({ row, close, onDuplicated }: { row: CampaignRow; close: () => void; onDuplicated: (summary: CampaignSummary, key: string, name: string, warning: string) => void }) {
  const [name, setName] = useState(`${row.name} (copy)`), [copyWorld, setCopyWorld] = useState(false);
  const [posts, setPosts] = useState(false), [chats, setChats] = useState(false), [step, setStep] = useState(""), [error, setError] = useState("");
  const world = row.encyclopedia?.worldName || "the world";
  const parts = [
    row.maptable && `${plural(row.maptable.scenes, "scene")} in Maptable, with saved tokens`,
    row.encyclopedia && `${plural(row.encyclopedia.pages, "page")} in the Wiki, with stats, calendars, quests and the front page`,
    row.encyclopedia?.forum && "the forum's boards, categories and settings",
    row.encyclopedia && "its theme, random tables and member groups with their permissions",
  ].filter(Boolean) as string[];
  async function run() {
    setError("");
    try { const r = await duplicateCampaign(row.key, { name: name.trim(), copyWorld, posts, chats }, setStep); onDuplicated(r.summary, r.key, r.name, r.warning); }
    catch (e) { setError(e instanceof Error ? e.message : "The campaign could not be duplicated."); }
    finally { setStep(""); }
  }
  return <Modal title={`Duplicate ${row.name}`} intro="The copy is a new campaign beside this one. Nothing in this campaign changes." close={step ? () => {} : close} footer={<>
    <button type="button" className="campaigns-secondary" disabled={!!step} onClick={close}>Cancel</button>
    <button type="submit" form="duplicate-campaign" className="campaigns-primary" disabled={!name.trim() || !!step}><Copy size={16} aria-hidden="true" />{step ? "Duplicating…" : "Duplicate"}</button>
  </>}>
    <form id="duplicate-campaign" className="campaigns-form campaigns-duplicate" onSubmit={e => { e.preventDefault(); if (name.trim() && !step) void run(); }}>
      <label>Name of the copy<input value={name} maxLength={120} autoFocus disabled={!!step} onChange={e => setName(e.target.value)} /></label>
      <div><p>The copy gets:</p><ul className="campaigns-delete-list">{parts.map(p => <li key={p}>{p}</li>)}</ul></div>
      {row.encyclopedia && <fieldset disabled={!!step}>
        <legend>{world}&apos;s shared lore</legend>
        <label className="campaigns-choice"><input type="radio" name="dup-world" checked={!copyWorld} onChange={() => setCopyWorld(false)} /><span><strong>Share it</strong><small>Both campaigns use the same world. A change to its lore shows in both.</small></span></label>
        <label className="campaigns-choice"><input type="radio" name="dup-world" checked={copyWorld} onChange={() => setCopyWorld(true)} /><span><strong>Make a separate copy</strong><small>The copy gets a world of its own, so its lore can change without touching this one.</small></span></label>
      </fieldset>}
      {row.encyclopedia && <fieldset disabled={!!step}>
        <legend>Also copy</legend>
        {row.encyclopedia.forum && <label className="campaigns-choice"><input type="checkbox" checked={posts} onChange={e => setPosts(e.target.checked)} /><span><strong>Forum topics and posts</strong><small>Off: the forum starts empty, with the same boards.</small></span></label>}
        <label className="campaigns-choice"><input type="checkbox" checked={chats} onChange={e => setChats(e.target.checked)} /><span><strong>Saved AI chats</strong></span></label>
      </fieldset>}
      <small>Not copied: the people in the campaign, invite and player links, AI connections, agent and bridge keys, the Discord channel and the web address. Pictures are shared, not copied.</small>
      {step && <p className="campaigns-muted" role="status" aria-live="polite">{step}</p>}
      {error && <p className="campaigns-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
