"use client";
import "./token-library.css";
import "./token-ui.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Copy as CopyIcon, FolderPlus, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { Modal } from "./dialogs";
import { confirmDialog } from "./confirm-dialog";
import { useFolderExpansion } from "./folder-expansion";
import LibraryOrganizer from "./library-organizer";
import { moveSibling, placeBeside } from "@/lib/folder-order";
import TokenFace from "./token-face";
import TokenEditor from "./token-editor";
import { TokenTile, usePlacementGesture } from "./token-placement";
import { canMoveCollection, collectionPath, createTokenFolder, moveLibraryTokenToCampaign, moveTokenToFolder, tokenFoldersForCampaign, newToken, uid, type Token, type Workspace } from "@/lib/model";
import { tokenDisposition } from "@/lib/token-defaults";
import { tokenInitials } from "@/lib/token-initials";
import { filterGalleryTokens, galleryGroups, GALLERY_SIDES, type GallerySide } from "@/lib/token-gallery";
import { toggleArmed, type ArmedToken } from "@/lib/token-arming";

const SIDE_DOT: Record<string, string> = { party: "#6f9cf2", ally: "#4fcf9a", neutral: "#e8a93a", enemy: "#f0685f" };

/** Saved tokens as a compact grid: search, side chips, folders as groups. Click a tile to arm it, then click the map; or drag it on. */
export default function TokenLibrary({ workspace: w, commit, campaignId, armed, setArmed, onMakeToken, save }: {
  workspace: Workspace; commit: (fn: (w: Workspace) => void) => void; campaignId: string | null;
  armed: ArmedToken | null; setArmed: (a: ArmedToken | null) => void; onMakeToken: () => void; save?: () => Promise<unknown>;
}) {
  const [query, setQuery] = useState(""), [side, setSide] = useState<GallerySide>("all"), [scope, setScope] = useState<"campaign" | "all">("campaign");
  const [editing, setEditing] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null), [organizing, setOrganizing] = useState(false);
  const [creating, setCreating] = useState(false), [folderName, setFolderName] = useState(""), [location, setLocation] = useState<string | null>(null);
  const [closed, setClosed] = useFolderExpansion("token-gallery");
  const gesture = usePlacementGesture(token => setArmed(toggleArmed(armed, token)));
  const menuBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeForRoll = () => setEditing(null);
    window.addEventListener("maptable-tray-roll", closeForRoll);
    return () => window.removeEventListener("maptable-tray-roll", closeForRoll);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => { if (!menuBox.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(null); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc, true); };
  }, [menu]);

  const folders = scope === "all" ? w.tokenFolders : tokenFoldersForCampaign(w, campaignId);
  const narrowed = side !== "all" || !!query.trim();
  const tokens = useMemo(() => filterGalleryTokens(w, { campaignId, scope, side, query }), [w, campaignId, scope, side, query]);
  const groups = galleryGroups(folders, tokens, w.tokenFolderLocations, narrowed);
  const partyMarker = w.tokenLibrary.find(t => t.partyMarker && w.libraryCampaigns[t.id] === campaignId);
  const patch = (id: string, update: Partial<Token>) => commit(next => { const token = next.tokenLibrary.find(t => t.id === id); if (token) Object.assign(token, update); });
  const createPartyMarker = () => {
    if (!campaignId) return;
    if (partyMarker) { setEditing(partyMarker.id); return; }
    const token: Token = { ...newToken("Party"), rosterRole: "party", disposition: "party", partyMarker: true, showHp: false, hp: 0, maxHp: 1, color: "#d69b36", sideColours: false };
    commit(next => { next.tokenLibrary.push(token); next.libraryCampaigns[token.id] = campaignId; });
    setEditing(token.id);
  };
  const remove = async (t: Token) => {
    if (!await confirmDialog({ title: `Delete ${t.name || "this saved token"}?`, message: "Tokens already on maps keep their settings.", confirm: "Delete saved token", danger: true })) return;
    commit(next => { next.tokenLibrary = next.tokenLibrary.filter(token => token.id !== t.id); delete next.tokenFolderLocations[t.id]; delete next.libraryLocations[t.id]; delete next.libraryCampaigns[t.id]; });
    if (armed?.id === t.id) setArmed(null);
    setEditing(null); setMenu(null);
  };
  const duplicate = (t: Token) => {
    const copy: Token = { ...structuredClone(t), id: uid(), name: `${t.name} copy`.slice(0, 120), sourceLibraryId: undefined, conditionRounds: undefined, attachedToId: null };
    commit(next => { next.tokenLibrary.push(copy); next.libraryCampaigns[copy.id] = next.libraryCampaigns[t.id] ?? null; next.tokenFolderLocations[copy.id] = next.tokenFolderLocations[t.id] ?? null; });
    setEditing(copy.id);
  };
  const editor = w.tokenLibrary.find(t => t.id === editing);
  const owner = (t: Token) => w.libraryCampaigns[t.id] ?? campaignId;

  const tile = (t: Token) => {
    const isArmed = armed?.id === t.id;
    const folderChoices = w.tokenFolders.filter(f => f.campaignId === (w.libraryCampaigns[t.id] ?? null));
    return <TokenTile key={t.id} armed={isArmed} name={t.name} tint={tokenDisposition(t)}
      title={`${t.name}. Click, then click the map to place it, or drag it onto the map.`}
      gesture={gesture.bind({ id: t.id, name: t.name, source: "library" })}
      face={<TokenFace token={t} workspace={w} campaignId={owner(t)} initials={tokenInitials(t.name)} size={32} />}
      tools={<>
        <button type="button" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setEditing(t.id)}><Pencil size={12} /></button>
        <div className="token-tile-menu" ref={menu === t.id ? menuBox : undefined}>
          <button type="button" aria-label={`More for ${t.name}`} aria-haspopup="menu" aria-expanded={menu === t.id} title="More" onClick={() => setMenu(menu === t.id ? null : t.id)}><MoreHorizontal size={12} /></button>
          {menu === t.id && <div className="token-tile-popover" role="menu" aria-label={`${t.name} actions`}>
            <label>Move to folder<select value={w.tokenFolderLocations[t.id] ?? ""} onChange={e => { const target = e.target.value || null; commit(next => { moveTokenToFolder(next, t.id, target); }); setMenu(null); }}>
              <option value="">Not in a folder</option>{folderChoices.map(f => <option key={f.id} value={f.id}>{collectionPath(w.tokenFolders, f.id)}</option>)}
            </select></label>
            <button type="button" role="menuitem" onClick={() => { duplicate(t); setMenu(null); }}><CopyIcon size={13} /> Duplicate</button>
            <button type="button" role="menuitem" className="danger" onClick={() => void remove(t)}>Delete…</button>
          </div>}
        </div>
      </>} />;
  };

  const organizerItems = w.tokenLibrary.filter(t => scope === "all" || !w.libraryCampaigns[t.id] || w.libraryCampaigns[t.id] === campaignId);
  const organizerFolder = folders.some(f => f.id === location) ? location : null;

  return <section className="saved-token-library token-gallery-body">
    <div className="gallery-scroll">
      <label className="gallery-search"><Search size={14} aria-hidden="true" /><input aria-label="Find a token" placeholder="Find a token" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="gallery-chips" role="group" aria-label="Side">
        {GALLERY_SIDES.map(s => <button key={s.id} type="button" aria-pressed={side === s.id} onClick={() => setSide(s.id)}>
          {s.id !== "all" && <i style={{ background: SIDE_DOT[s.id] }} aria-hidden="true" />}{s.label}</button>)}
      </div>
      <div className="gallery-scope"><span>Showing</span>
        <div className="segmented" role="group" aria-label="Token library campaign filter">
          <button type="button" aria-pressed={scope === "campaign"} onClick={() => setScope("campaign")}>This campaign</button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>All campaigns</button>
        </div>
      </div>
      {campaignId && <p className="gallery-party-marker">Party marker for the overworld map <button type="button" className="text-button" onClick={createPartyMarker}>{partyMarker ? "Edit" : "Create"}</button></p>}
      {groups.map(g => {
        const key = g.id ?? "loose", shut = closed.has(key) && !query.trim();
        return <section key={key} className="gallery-group" aria-label={g.name}>
          <h3><button type="button" aria-expanded={!shut} onClick={() => setClosed(old => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>
            {shut ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span>{g.name}</span><small>{g.tokens.length}</small></button></h3>
          {!shut && (g.tokens.length ? <div className="token-tile-grid">{g.tokens.map(tile)}</div> : <p className="gallery-empty">Empty folder. Move tokens here from a tile&apos;s ⋯ menu or Organize.</p>)}
        </section>;
      })}
      {!tokens.length && <p className="gallery-empty">{narrowed ? "No tokens match." : scope === "campaign" ? "No saved tokens for this campaign yet. Make one below, or switch to All campaigns." : "No saved tokens yet. Make one below."}</p>}
      <p className="gallery-hint">Click a token, then click the map. Or drag it straight on. Hover a token to edit it or move it to a folder.</p>
      <p role="status" className="gallery-hint">{gesture.message}</p>
      {creating && <form className="gallery-folder-form" onSubmit={e => { e.preventDefault(); if (!folderName.trim()) return; commit(next => { createTokenFolder(next, campaignId, folderName.trim()); }); setCreating(false); setFolderName(""); }}>
        <label>Folder name<input autoFocus required maxLength={120} value={folderName} onChange={e => setFolderName(e.target.value)} /></label>
        <div className="button-row"><button className="primary" disabled={!folderName.trim()}>Create folder</button><button type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </form>}
    </div>
    <footer className="gallery-footer">
      <button type="button" className="primary" onClick={onMakeToken}><Plus size={14} /> Make token</button>
      <button type="button" onClick={() => { setCreating(true); setFolderName(""); }}><FolderPlus size={13} /> New folder</button>
      <button type="button" className="gallery-organize" onClick={() => setOrganizing(true)}>Organize…</button>
    </footer>
    {organizing && createPortal(<Modal title="Organize saved tokens" wide close={() => setOrganizing(false)}>
      <LibraryOrganizer title="Token library" folders={folders} items={organizerItems} locations={w.tokenFolderLocations} location={organizerFolder} setLocation={setLocation}
        onCreateFolder={name => commit(next => { createTokenFolder(next, campaignId, name); })}
        onRenameFolder={(id, name) => commit(next => { const f = next.tokenFolders.find(f => f.id === id); if (f && name.trim()) f.name = name.trim().slice(0, 120); })}
        canMoveFolder={(id, parentId) => parentId === null || w.tokenFolders.find(f => f.id === id)?.campaignId === w.tokenFolders.find(f => f.id === parentId)?.campaignId}
        onMoveFolder={(id, parentId) => commit(next => { const f = next.tokenFolders.find(f => f.id === id); if (f && (parentId === null || next.tokenFolders.some(parent => parent.id === parentId && parent.campaignId === f.campaignId)) && canMoveCollection(next.tokenFolders, id, parentId)) f.parentId = parentId; })}
        onStepFolder={(id, delta) => commit(next => { const shown = new Set(folders.map(f => f.id)); next.tokenFolders = moveSibling(next.tokenFolders, id, delta, f => shown.has(f.id)); })}
        onPlaceFolder={(id, targetId, place) => commit(next => { const f = next.tokenFolders.find(f => f.id === id), t = next.tokenFolders.find(f => f.id === targetId); if (f && t && f.campaignId === t.campaignId && canMoveCollection(next.tokenFolders, id, t.parentId)) next.tokenFolders = placeBeside(next.tokenFolders, id, targetId, place); })}
        onRemoveFolder={id => commit(next => {
          const f = next.tokenFolders.find(f => f.id === id); if (!f) return;
          next.tokenFolders = next.tokenFolders.filter(f => f.id !== id);
          next.tokenFolders.forEach(child => { if (child.parentId === id) child.parentId = f.parentId; });
          for (const key in next.tokenFolderLocations) if (next.tokenFolderLocations[key] === id) next.tokenFolderLocations[key] = f.parentId;
        })}
        onMoveItem={(id, target) => commit(next => { moveTokenToFolder(next, id, target); })}
        renderItem={t => <div className="library-row"><button type="button" className="organizer-token" onClick={() => { setOrganizing(false); setEditing(t.id); }} title={`Edit ${t.name}`}>
          <TokenFace token={t} workspace={w} campaignId={owner(t)} initials={tokenInitials(t.name)} size={26} /><span>{t.name || "Unnamed token"}</span><Pencil size={13} /></button></div>} />
    </Modal>, document.body)}
    {editor && <TokenEditor key={editor.id} mode="saved" token={editor} workspace={w} campaignId={owner(editor)} initials={tokenInitials(editor.name)}
      patch={update => patch(editor.id, update)} commit={commit} close={() => setEditing(null)}
      onDuplicate={() => duplicate(editor)} onDelete={() => void remove(editor)}
      savedSummary={w.tokenFolderLocations[editor.id] ? collectionPath(w.tokenFolders, w.tokenFolderLocations[editor.id]!) : "Not in a folder"}
      savedCopy={<SavedTokenCopy token={editor} workspace={w} campaignId={campaignId} commit={commit} save={save} remove={() => void remove(editor)} />} />}
    {gesture.ghost}
  </section>;
}

/** The old Library tab for a saved token: what it is saved as, where it lives, and the cloud save. */
function SavedTokenCopy({ token: t, workspace: w, campaignId, commit, save, remove }: {
  token: Token; workspace: Workspace; campaignId: string | null; commit: (fn: (w: Workspace) => void) => void; save?: () => Promise<unknown>; remove: () => void;
}) {
  const [message, setMessage] = useState("");
  return <SavedCopyShell>
    {!t.partyMarker && <label>Save as<select value={t.rosterRole ?? "library"} onChange={e => { const role = e.target.value as "library" | "npc" | "party"; commit(next => { const saved = next.tokenLibrary.find(item => item.id === t.id)!; saved.rosterRole = role; if (role !== "library") moveLibraryTokenToCampaign(next, t.id, campaignId); }); }}>
      <option value="library">Library token</option><option value="npc" disabled={!campaignId}>Campaign NPC</option><option value="party" disabled={!campaignId}>Party member</option></select></label>}
    <label>Folder<select value={w.tokenFolderLocations[t.id] ?? ""} onChange={e => commit(next => { moveTokenToFolder(next, t.id, e.target.value || null); })}>
      <option value="">Library root</option>{w.tokenFolders.filter(f => f.campaignId === (w.libraryCampaigns[t.id] ?? null)).map(f => <option key={f.id} value={f.id}>{collectionPath(w.tokenFolders, f.id)}</option>)}</select></label>
    {!t.partyMarker && <label>Campaign<select value={w.libraryCampaigns[t.id] ?? ""} onChange={e => commit(next => moveLibraryTokenToCampaign(next, t.id, e.target.value || null))}>
      {(t.rosterRole ?? "library") === "library" && <option value="">Shared</option>}{w.collections.filter(c => c.kind === "campaign").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    <div className="button-row">
      <button type="button" onClick={async () => { setMessage("Saving…"); try { const result = await save?.(); setMessage(result === false ? "Cloud save failed. Retry using Save." : "Gallery token saved."); } catch { setMessage("Cloud save failed. Retry using Save."); } }}>Save gallery token</button>
      <button type="button" className="danger" onClick={remove}>Delete saved token</button>
    </div>
    <small role="status">{message}</small>
    <small>Edits and deletion affect this saved token. Placed tokens keep their settings.</small>
  </SavedCopyShell>;
}
function SavedCopyShell({ children }: { children: React.ReactNode }) { return <div className="editor-card"><h3>Saved copy</h3>{children}</div>; }
