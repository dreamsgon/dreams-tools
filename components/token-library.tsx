"use client";
import { uiZoom } from "@/lib/appearance";

import "./token-library.css";

import TokenStatusControl from "./token-status-control";
import TokenNotesControl from "./token-notes-control";
import TokenEditorTabs from "./token-editor-tabs";
import { InitiativeField } from "./map-initiative";
import TokenDisplayControls from "./token-display-controls";
import TokenColor from "./token-color";

import TokenBorder from "./token-border";

import TokenImage from "./token-image";

import { useEffect, useRef, useState } from "react";
import { LIBRARY_TOKEN_DROP, libraryTokenDropTarget } from "@/lib/library-token-drop";
import { createPortal } from "react-dom";
import { Modal } from "./dialogs";

import { Pencil } from "lucide-react";

import { canMoveCollection, collectionPath, createTokenFolder, moveLibraryTokenToCampaign, moveTokenToFolder, tokenFoldersForCampaign, newToken, type Token, type Workspace } from "@/lib/model";

import LibraryOrganizer from "./library-organizer";



export default function TokenLibrary({ workspace: w, commit, campaignId, onPlace, save }: {

  workspace: Workspace; commit: (fn: (w: Workspace) => void) => void;

  campaignId: string | null; onPlace: (token: Token) => void; save?: () => Promise<unknown>;

}) {

  const [location, setLocation] = useState<string | null>(null);

  const [saveMessage,setSaveMessage]=useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const placementDrag = useRef<{ pointerId: number; tokenId: string; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ name: string; x: number; y: number; ready: boolean } | null>(null);
  const [dragMessage, setDragMessage] = useState("");
  const resetPlacement = () => { placementDrag.current = null; setDragPreview(null); };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && placementDrag.current) {
        suppressClick.current = true; placementDrag.current = null; setDragPreview(null); setDragMessage("Placement cancelled.");
      }
    };
    const blur = () => { placementDrag.current = null; setDragPreview(null); };
    window.addEventListener("keydown", cancel); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", blur); };
  }, []);
  useEffect(() => {
    const closeForRoll = () => setEditing(null);
    window.addEventListener("maptable-tray-roll", closeForRoll);
    return () => window.removeEventListener("maptable-tray-roll", closeForRoll);
  }, []);

  const [roster,setRoster]=useState("all");

  const [filter, setFilter] = useState("current");

  const folders = filter === "all" ? w.tokenFolders : tokenFoldersForCampaign(w, campaignId);
  const folder = folders.some(f => f.id === location) ? location : null;
  const items = w.tokenLibrary.filter(t => (roster === "all" || (t.rosterRole ?? "library") === roster) &&
    (filter === "all" || !w.libraryCampaigns[t.id] || w.libraryCampaigns[t.id] === campaignId));

  const partyMarker = w.tokenLibrary.find(t => t.partyMarker && w.libraryCampaigns[t.id] === campaignId);

  const createPartyMarker = () => {

    if (!campaignId) return;

    if (partyMarker) { setEditing(partyMarker.id); setLocation(w.tokenFolderLocations[partyMarker.id] ?? null); return; }

    const token: Token = { ...newToken("Party"), rosterRole: "party", partyMarker: true, showHp: false, hp: 0, maxHp: 1, color: "#d69b36" };

    commit(next => { next.tokenLibrary.push(token); next.libraryCampaigns[token.id] = campaignId; });

    setEditing(token.id); setLocation(null);

  };

  const patch = (id: string, update: Partial<Token>) => commit(next => {

    const token = next.tokenLibrary.find(t => t.id === id);

    if (token) Object.assign(token, update);

  });

  return <section className="saved-token-library">

    <div className="button-row token-roster-filters">{[["all","All tokens"],["library","Library"],["npc","Campaign NPCs"],["party","Party"]].map(([value,label])=><button key={value} aria-pressed={roster===value} onClick={()=>{setRoster(value);setLocation(null);setEditing(null);}}>{label}</button>)}</div>

    <h3>{roster==="npc"?"Campaign NPCs":roster==="party"?"Party":roster==="all"?"All tokens":"Token library"} <span className="count">{items.length}</span></h3>

    {roster === "party" && <div className="party-marker-callout"><strong>Overworld party marker</strong><p>One reusable marker for the whole group. Place a copy on any campaign map.</p><button disabled={!campaignId} onClick={createPartyMarker}>{partyMarker ? "Edit party marker" : "Create party marker"}</button>{partyMarker && <button onClick={() => onPlace(partyMarker)}>Place {partyMarker.name || "Party"}</button>}</div>}

    {(roster==="npc" || roster==="party")&&<><button disabled={!campaignId} onClick={()=>{const t={...newToken(roster==="npc"?"New NPC":"New party member"),rosterRole:roster as "npc"|"party"};commit(next=>{next.tokenLibrary.push(t);next.libraryCampaigns[t.id]=campaignId;});setEditing(t.id);setLocation(null);}}>New {roster==="npc"?"NPC":"party member"}</button><p className="muted">{campaignId?"Saved for this campaign. Click a name to place a copy in this scene.":"Open a campaign to save NPCs and party members."}</p></>}

    {<label>Show<select aria-label="Token library campaign filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="current">This campaign + shared</option><option value="all">All campaigns</option></select></label>}

    <LibraryOrganizer gallery key={`${roster}:${campaignId ?? "shared"}`} title={roster === "party" ? "Party" : roster === "npc" ? "Campaign NPCs" : "Token library"} folders={folders} items={items} locations={w.tokenFolderLocations} location={folder} setLocation={setLocation}

      onCreateFolder={name => commit(next => { createTokenFolder(next, campaignId, name); })}

      onRenameFolder={(id, name) => commit(next => { const f = next.tokenFolders.find(f => f.id === id); if (f && name.trim()) f.name = name.trim().slice(0, 120); })}

      canMoveFolder={(id, parentId) => parentId === null || w.tokenFolders.find(f => f.id === id)?.campaignId === w.tokenFolders.find(f => f.id === parentId)?.campaignId}

      onMoveFolder={(id, parentId) => commit(next => { const f = next.tokenFolders.find(f => f.id === id); if (f && (parentId === null || next.tokenFolders.some(parent => parent.id === parentId && parent.campaignId === f.campaignId)) && canMoveCollection(next.tokenFolders, id, parentId)) f.parentId = parentId; })}

      onRemoveFolder={id => commit(next => {

        const f = next.tokenFolders.find(f => f.id === id); if (!f) return;

        next.tokenFolders = next.tokenFolders.filter(f => f.id !== id);

        next.tokenFolders.forEach(child => { if (child.parentId === id) child.parentId = f.parentId; });

        for (const locations of [next.tokenFolderLocations]) for (const key in locations) if (locations[key] === id) locations[key] = f.parentId;

      })}

      onMoveItem={(id, target) => commit(next => { moveTokenToFolder(next, id, target); })}

      renderItem={t => <div className="token-library-item">

        <div className="library-row">

          <button type="button" title={`Click to place ${t.name}, or drag onto the map`} aria-label={`Place ${t.name} on map`}
            style={{ touchAction: "none" }} onDragStart={event => event.preventDefault()}
            onPointerDown={event => {
              if (event.button !== 0 || !event.isPrimary) return;
              suppressClick.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
              placementDrag.current = { pointerId: event.pointerId, tokenId: t.id, x: event.clientX, y: event.clientY, active: false };
            }}
            onPointerMove={event => {
              const d = placementDrag.current;
              if (!d || d.pointerId !== event.pointerId) return;
              if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) >= 6) { d.active = true; suppressClick.current = true; setDragMessage(""); }
              if (d.active) { event.preventDefault(); setDragPreview({ name: t.name, x: event.clientX, y: event.clientY, ready: !!libraryTokenDropTarget(event.clientX, event.clientY, d.tokenId) }); }
            }}
            onPointerUp={event => {
              const d = placementDrag.current;
              if (!d || d.pointerId !== event.pointerId) return;
              if (d.active) {
                const target = libraryTokenDropTarget(event.clientX, event.clientY, d.tokenId);
                const accepted = target && !target.dispatchEvent(new CustomEvent(LIBRARY_TOKEN_DROP, { cancelable: true, detail: { tokenId: d.tokenId, clientX: event.clientX, clientY: event.clientY } }));
                setDragMessage(accepted ? `Placed ${t.name} on map.` : "Not placed. Drop onto the map to place a token.");
              }
              resetPlacement();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { suppressClick.current = true; resetPlacement(); }}
            onLostPointerCapture={() => { if (placementDrag.current?.active) suppressClick.current = true; resetPlacement(); }}
            onClick={event => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } suppressClick.current = false; onPlace(t); }}>

            <span className="token-avatar" style={{ background: t.color }}>{t.assetId && w.assets.some(a => a.id === t.assetId) ? <img src={w.assets.find(a => a.id === t.assetId)?.src} alt="" /> : t.name.slice(0, 2)}</span><span className="saved-token-label"><strong>{t.name || "Unnamed token"}</strong><small>{t.partyMarker ? "Group marker · no HP" : t.rosterRole === "party" ? "Party member" : t.rosterRole === "npc" ? "Campaign NPC" : "Library token"}</small></span>

          </button>

          <button type="button" aria-label={`Edit ${t.name}`} aria-expanded={editing === t.id} onClick={() => setEditing(editing === t.id ? null : t.id)}><Pencil size={14} /></button>

        </div>



      </div>} />

    {(() => { const t = w.tokenLibrary.find(token => token.id === editing); return t && createPortal(<Modal title={`Edit ${t.name || "saved token"}`} close={() => setEditing(null)}>        <div className="organizer-editor token-library-editor">

          <TokenEditorTabs key={t.id} sections={[
            {id: "general", label: "General", content: <>
          <label>Name<input aria-label="Saved token name" maxLength={120} value={t.name} onChange={e => patch(t.id, { name: e.target.value })} /></label>
          <label><input type="checkbox" checked={t.hidden} onChange={e => patch(t.id, { hidden: e.target.checked })} /> Hidden from players</label>

            </>},
            {id: "appearance", label: "Appearance", content: <>
          <div className="two-col"><label>Size<input type="number" min={0.25} max={20} step={0.25} value={t.size} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) patch(t.id, { size: Math.max(0.25, Math.min(20, n)) }); }} /></label><label>Fill color<TokenColor label="Fill color" value={t.color} onChange={color => patch(t.id, { color, borderColor: t.borderColor ?? t.color })} /></label></div>

          <label>Border color<TokenColor label="Border color" value={t.borderColor ?? t.color} onChange={borderColor => patch(t.id, { borderColor, useDispositionColor: false })} /></label><label>Text color<TokenColor label="Text color" value={t.textColor ?? "#ffffff"} onChange={textColor => patch(t.id, { textColor })} /></label>

          <TokenBorder token={t} workspace={w} commit={commit} saved /><TokenImage token={t} workspace={w} commit={commit} saved /><TokenDisplayControls token={t} workspace={w} campaignId={w.libraryCampaigns[t.id] ?? campaignId} onChange={update => patch(t.id, update)} />

          

            </>},
            {id: "combat", label: "Combat", content: <>
          <TokenStatusControl zeroHpStatus={t.zeroHpStatus} onZeroHpChange={zeroHpStatus=>patch(t.id,{zeroHpStatus})} value={t.status} onChange={status=>patch(t.id,{status})} />
          <label>Initiative<InitiativeField label="Saved token initiative" value={t.initiative} onCommit={initiative=>patch(t.id,{initiative})}/></label>
          {!t.partyMarker && <div className="two-col"><label>HP<input type="number" min={0} max={1000000} value={t.hp} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) patch(t.id, { hp: Math.max(0, Math.min(1000000, n)) }); }} /></label><label>Max HP<input type="number" min={1} max={1000000} value={t.maxHp} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) patch(t.id, { maxHp: Math.max(1, Math.min(1000000, n)) }); }} /></label></div>}

          <TokenNotesControl section="combat" token={t}  campaignId={w.libraryCampaigns[t.id] ?? campaignId} onChange={update => patch(t.id, update)} />

            </>},
            {id: "notes", label: "Notes", content: <>
          <TokenNotesControl section="notes" token={t} sceneId={!w.libraryCampaigns[t.id] || w.libraryCampaigns[t.id] === campaignId ? w.activeId : undefined} campaignId={w.libraryCampaigns[t.id] ?? campaignId} onChange={update => patch(t.id, update)} />

            </>},
            {id: "library", label: "Library", content: <>
          {!t.partyMarker && <label>Save as<select value={t.rosterRole??"library"} onChange={e=>{const role=e.target.value as "library"|"npc"|"party";commit(next=>{const saved=next.tokenLibrary.find(item=>item.id===t.id)!;saved.rosterRole=role;if(role!=="library")moveLibraryTokenToCampaign(next,t.id,campaignId);});setRoster(role);}}><option value="library">Library token</option><option value="npc" disabled={!campaignId}>Campaign NPC</option><option value="party" disabled={!campaignId}>Party member</option></select></label>}

          <label>Folder<select value={w.tokenFolderLocations[t.id] ?? ""} onChange={e => commit(next => { moveTokenToFolder(next, t.id, e.target.value || null); })}><option value="">Library root</option>{w.tokenFolders.filter(f => f.campaignId === (w.libraryCampaigns[t.id] ?? null)).map(f => <option key={f.id} value={f.id}>{collectionPath(w.tokenFolders, f.id)}</option>)}</select></label>

          {!t.partyMarker && <label>Campaign<select value={w.libraryCampaigns[t.id] ?? ""} onChange={e => commit(next => moveLibraryTokenToCampaign(next, t.id, e.target.value || null))}>{(t.rosterRole??"library")==="library"&&<option value="">Shared</option>}{w.collections.filter(c => c.kind === "campaign").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}

          <button type="button" onClick={() => { commit(next => { next.tokenLibrary = next.tokenLibrary.filter(token => token.id !== t.id); delete next.tokenFolderLocations[t.id]; delete next.libraryLocations[t.id]; delete next.libraryCampaigns[t.id]; }); setEditing(null); }}>Delete saved token</button>

            </>},
          ]}/>
          <button type="button" onClick={async()=>{setSaveMessage("Saving…");try{const result=await save?.();setSaveMessage(result===false?"Cloud save failed. Retry using Save.":"Gallery token saved.");}catch{setSaveMessage("Cloud save failed. Retry using Save.");}}}>Save gallery token</button><small role="status">{saveMessage}</small>
          <small>Edits and deletion affect this saved token. Placed tokens keep their settings.</small>

        </div></Modal>, document.body); })()}
    {dragPreview && createPortal(<div aria-hidden="true" className="token-drag-preview" data-ready={dragPreview.ready ? "true" : "false"} style={{ left: dragPreview.x / uiZoom() + 14, top: dragPreview.y / uiZoom() + 14 }}>{dragPreview.name || "Token"} · {dragPreview.ready ? "Release to place" : "Drag onto map"}</div>, document.body)}
    <p className="empty-small">Click a token’s icon or name to place it, or drag it onto the map. Use the grip to move it between folders. Escape cancels a drag.</p>
    <p role="status" className="empty-small">{dragMessage}</p>

  </section>;

}



