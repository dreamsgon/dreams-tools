"use client";
/*
 * Pieces of the AI panel's chat (components/encyclopedia/ai-activity.tsx): the AI and model pickers under the message
 * box, and the saved-chats list with folders, used as the panel's drop-down and as the full-page chat's sidebar.
 */
import { useState } from "react";
import { Bot, Check, ChevronDown, ChevronRight, Folder, FolderInput, FolderPlus, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import type { ChatFolder, ChatMeta } from "@/lib/ai/chat-text";
import { isChatModel } from "@/lib/ai/model-list";

/** A connection made with an API key: the GM can ask it from the panel. `isDefault`: new chats ask it first. */
export type ChatConnection = { id: string; name: string; provider: string; model: string; isDefault?: boolean };
/** The models a connection's key can chat with, as loaded from the provider. */
export type ModelList = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; models: string[]; other: string[] };

const time = (iso: string) => {
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
/** Saved chats under Today, This week and Older. */
const byDate = (list: ChatMeta[]) => {
  const today = new Date().toDateString(), week = Date.now() - 7 * 86_400_000, out: [string, ChatMeta[]][] = [["Today", []], ["This week", []], ["Older", []]];
  for (const c of list) out[new Date(c.updatedAt).toDateString() === today ? 0 : Date.parse(c.updatedAt) > week ? 1 : 2][1].push(c);
  return out.filter(([, l]) => l.length);
};

/** Which AI to ask: the campaign's API-key connections, with a way to add another. */
export function ConnectionMenu({ chats, current, onPick, onDefault, busy, connectLink }: { chats: ChatConnection[]; current: string; onPick: (id: string) => void; onDefault: (id: string) => void; busy: boolean; connectLink: React.ReactNode }) {
  const marked = chats.find(c => c.isDefault)?.id ?? chats[0]?.id;
  return <div className="ai-chat-menu ai-pop ai-pop-up" role="menu" aria-label="Which AI to ask" data-ai-menu>
    <h4>Ask which AI</h4>
    {chats.map(c => <div key={c.id} className="ai-pop-row">
      <button type="button" role="menuitemradio" aria-checked={c.id === current} className="ai-pop-item" onClick={() => onPick(c.id)}>
        <Bot size={15}/><span><strong>{c.name}</strong><small>{c.provider} · {c.model}{chats.length > 1 && c.id === marked ? " · Default for new chats" : ""}</small></span>{c.id === current && <Check size={14} className="ai-pop-check"/>}
      </button>
      {chats.length > 1 && <button type="button" className={`icon-button ai-pop-star${c.id === marked ? " on" : ""}`} disabled={busy || c.id === marked} aria-pressed={c.id === marked}
        aria-label={c.id === marked ? `${c.name} is the default for new chats` : `Make ${c.name} the default for new chats`} title={c.id === marked ? "Default for new chats" : "Make this the default for new chats"} onClick={() => onDefault(c.id)}><Star size={14}/></button>}
    </div>)}
    <div className="ai-pop-foot">{connectLink}<small>The chat carries on with whichever AI you pick. Each answer says who wrote it.{chats.length > 1 ? " The star sets which AI new chats ask, on every device." : ""}</small></div>
  </div>;
}

/**
 * Which model to ask with: the models the connection's key can chat with, searchable, with the rest (speech, images,
 * embeddings) behind "Show all". Any model id can be typed. The connection's default model is marked, and the picked
 * one can become the default for new chats.
 */
export function ModelMenu({ list, current, fallback, connection, onPick, onDefault, onRetry, busy }: {
  list: ModelList | undefined; current: string; fallback: string; connection: string;
  onPick: (model: string) => void; onDefault: (model: string) => void; onRetry: () => void; busy: boolean;
}) {
  const [find, setFind] = useState(""), [all, setAll] = useState(false);
  const q = find.trim().toLowerCase(), typed = find.trim();
  const models = list?.status === "ok" ? [...list.models, ...(all ? list.other : [])] : [];
  const shown = models.filter(m => !q || m.toLowerCase().includes(q)).slice(0, 300);
  const canType = /^[\w.:/@+-]{1,120}$/.test(typed) && !models.includes(typed);
  return <div className="ai-chat-menu ai-pop ai-pop-up ai-model-menu" role="dialog" aria-label={`Model for ${connection}`} data-ai-menu>
    <label className="ai-chat-find"><Search size={13}/><input autoFocus value={find} placeholder="Search or type a model" aria-label="Search models" onChange={e => setFind(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const pick = shown[0] ?? (canType ? typed : ""); if (pick) onPick(pick); } }}/></label>
    {!list || list.status === "loading" ? <p className="ai-chat-menu-empty">Loading {connection}’s models…</p>
      : list.status === "error" ? <p className="ai-chat-menu-empty">{list.error} <button type="button" className="inline-link" onClick={onRetry}>Try again</button></p>
      : <ul className="ai-model-list">
        {shown.map(m => <li key={m}><button type="button" role="menuitemradio" aria-checked={m === current} className={`ai-pop-item${m === current ? " on" : ""}`} onClick={() => onPick(m)}>
          <span><strong>{m}</strong>{(m === fallback || !isChatModel(m)) && <small>{[m === fallback && "Default for new chats", !isChatModel(m) && "Not a chat model"].filter(Boolean).join(" · ")}</small>}</span>{m === current && <Check size={14} className="ai-pop-check"/>}
        </button></li>)}
        {!shown.length && !canType && <li><p className="ai-chat-menu-empty">No models match “{typed}”.</p></li>}
      </ul>}
    {canType && <button type="button" className="ai-pop-item ai-model-typed" onClick={() => onPick(typed)}><Plus size={14}/><span><strong>Use “{typed}”</strong><small>A model id the list doesn’t show</small></span></button>}
    <div className="ai-pop-foot">
      {list?.status === "ok" && list.other.length > 0 && <label className="ai-model-all"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)}/> Show {list.other.length} models that can’t chat (speech, images, embeddings)</label>}
      {current !== fallback ? <button type="button" className="button small" disabled={busy} onClick={() => onDefault(current)}><Star size={13}/> {busy ? "Saving…" : `Make ${current} the default`}</button>
        : <small>{current} is {connection}’s default. Pick another to use it in this chat.</small>}
    </div>
  </div>;
}

type ListProps = {
  list: ChatMeta[] | null; folders: ChatFolder[]; current: string | null; busy: string; sidebar?: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; onMove: (id: string, folder: string | null) => Promise<boolean>;
  onAddFolder: (name: string) => Promise<boolean>; onRenameFolder: (id: string, name: string) => Promise<boolean>; onDeleteFolder: (id: string) => Promise<boolean>;
  /** Starts a new chat that is saved in this folder. */
  onNewIn?: (folder: string) => void;
};

/** The saved chats: folders first, then the chats in no folder by date. Search looks through every folder. */
export function ChatList({ list, folders, current, busy, sidebar, onOpen, onRename, onDelete, onMove, onAddFolder, onRenameFolder, onDeleteFolder, onNewIn }: ListProps) {
  const [find, setFind] = useState(""), [closed, setClosed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null), [deleting, setDeleting] = useState(""), [moving, setMoving] = useState<{ id: string; to: string } | null>(null);
  const [folderEdit, setFolderEdit] = useState<{ id: string; name: string } | null>(null), [folderDelete, setFolderDelete] = useState(""), [over, setOver] = useState<string | null>(null);
  const q = find.trim().toLowerCase(), known = new Set(folders.map(f => f.id));
  const folderName = (id?: string) => folders.find(f => f.id === id)?.name;
  const inFolder = (c: ChatMeta) => c.folder && known.has(c.folder) ? c.folder : "";

  const drop = (to: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("text/x-ai-chat")) { e.preventDefault(); setOver(to ?? ""); } },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { const id = e.dataTransfer.getData("text/x-ai-chat"); setOver(null); if (id) { e.preventDefault(); void onMove(id, to); } },
  });
  const row = (c: ChatMeta, where?: string) => <li key={c.id} className={c.id === current ? "on" : ""} draggable={sidebar && !renaming && !moving} onDragStart={e => { e.dataTransfer.setData("text/x-ai-chat", c.id); e.dataTransfer.effectAllowed = "move"; }}>
    {renaming?.id === c.id ? <form className="ai-chat-rename" onSubmit={e => { e.preventDefault(); void onRename(c.id, renaming.title).then(ok => { if (ok) setRenaming(null); }); }}><input autoFocus value={renaming.title} maxLength={80} aria-label="Chat name" onChange={e => setRenaming({ id: c.id, title: e.target.value })}/><button className="button small primary" disabled={!renaming.title.trim() || !!busy}>Save</button><button type="button" className="button small quiet" onClick={() => setRenaming(null)}>Cancel</button></form>
      : deleting === c.id ? <div className="ai-chat-confirm"><span>Delete “{c.title}”?</span><button type="button" className="button small danger" disabled={!!busy} onClick={() => void onDelete(c.id).then(ok => { if (ok) setDeleting(""); })}>{busy === `delete:${c.id}` ? "Deleting…" : "Delete"}</button><button type="button" className="button small quiet" onClick={() => setDeleting("")}>Keep</button></div>
      : moving?.id === c.id ? <form className="ai-chat-rename" onSubmit={e => { e.preventDefault(); void onMove(c.id, moving.to || null).then(ok => { if (ok) setMoving(null); }); }}>
        <select autoFocus value={moving.to} aria-label={`Move “${c.title}” to`} onChange={e => setMoving({ id: c.id, to: e.target.value })}><option value="">No folder</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <button className="button small primary" disabled={!!busy || moving.to === inFolder(c)}>Move</button><button type="button" className="button small quiet" onClick={() => setMoving(null)}>Cancel</button></form>
      : <><button type="button" className="ai-chat-open" onClick={() => onOpen(c.id)}><strong>{c.title}</strong><small>{[where, c.connectionName, c.scene, `${c.count} messages`, time(c.updatedAt)].filter(Boolean).join(" · ")}</small></button>
        <button type="button" className="icon-button" aria-label={`Rename ${c.title}`} title="Rename" onClick={() => setRenaming({ id: c.id, title: c.title })}><Pencil size={13}/></button>
        {folders.length > 0 && <button type="button" className="icon-button" aria-label={`Move ${c.title} to a folder`} title="Move to a folder" onClick={() => setMoving({ id: c.id, to: inFolder(c) })}><FolderInput size={13}/></button>}
        <button type="button" className="icon-button" aria-label={`Delete ${c.title}`} title="Delete" onClick={() => setDeleting(c.id)}><Trash2 size={13}/></button></>}
  </li>;

  const newFolder = folderEdit?.id === "";
  const body = () => {
    if (list === null) return <p className="ai-chat-menu-empty">Loading…</p>;
    if (q) {
      const shown = list.filter(c => `${c.title} ${c.scene ?? ""} ${c.connectionName} ${c.model ?? ""} ${folderName(c.folder) ?? ""}`.toLowerCase().includes(q));
      return shown.length ? <section><h4>Found {shown.length}</h4><ul>{shown.map(c => row(c, folderName(c.folder)))}</ul></section> : <p className="ai-chat-menu-empty">No chats match “{find.trim()}”.</p>;
    }
    const loose = list.filter(c => !inFolder(c));
    return <>
      {folders.map(f => {
        const items = list.filter(c => c.folder === f.id), shut = closed[f.id];
        return <section key={f.id} className={`ai-folder${over === f.id ? " over" : ""}`} {...drop(f.id)}>
          {folderEdit?.id === f.id ? <form className="ai-chat-rename" onSubmit={e => { e.preventDefault(); void onRenameFolder(f.id, folderEdit.name).then(ok => { if (ok) setFolderEdit(null); }); }}><input autoFocus value={folderEdit.name} maxLength={60} aria-label="Folder name" onChange={e => setFolderEdit({ id: f.id, name: e.target.value })}/><button className="button small primary" disabled={!folderEdit.name.trim() || !!busy}>Save</button><button type="button" className="button small quiet" onClick={() => setFolderEdit(null)}>Cancel</button></form>
            : folderDelete === f.id ? <div className="ai-chat-confirm"><span>Delete the folder “{f.name}”?{items.length ? ` Its ${items.length} chat${items.length === 1 ? "" : "s"} stay, outside any folder.` : ""}</span><button type="button" className="button small danger" disabled={!!busy} onClick={() => void onDeleteFolder(f.id).then(ok => { if (ok) setFolderDelete(""); })}>{busy === `deleteFolder:${f.id}` ? "Deleting…" : "Delete"}</button><button type="button" className="button small quiet" onClick={() => setFolderDelete("")}>Keep</button></div>
            : <div className="ai-folder-head">
              <button type="button" className="ai-folder-name" aria-expanded={!shut} onClick={() => setClosed({ ...closed, [f.id]: !shut })}>{shut ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<Folder size={14}/><span>{f.name}</span><small>{items.length}</small></button>
              {onNewIn && <button type="button" className="icon-button" aria-label={`New chat in ${f.name}`} title="New chat in this folder" onClick={() => onNewIn(f.id)}><Plus size={13}/></button>}
              <button type="button" className="icon-button" aria-label={`Rename the folder ${f.name}`} title="Rename" onClick={() => setFolderEdit({ id: f.id, name: f.name })}><Pencil size={13}/></button>
              <button type="button" className="icon-button" aria-label={`Delete the folder ${f.name}`} title="Delete folder" onClick={() => setFolderDelete(f.id)}><Trash2 size={13}/></button>
            </div>}
          {!shut && (items.length ? <ul>{items.map(c => row(c))}</ul> : <p className="ai-folder-empty">Empty. {sidebar ? "Drag a chat here, or use" : "Use"} <FolderInput size={11} aria-label="Move to a folder"/> on a chat to move it in.</p>)}
        </section>;
      })}
      <div className={`ai-folder-loose${over === "" ? " over" : ""}`} {...drop(null)}>
        {!list.length ? <p className="ai-chat-menu-empty">No saved chats yet. Ask something and the chat is saved here.</p>
          : !loose.length ? (folders.length ? <p className="ai-folder-empty">Every chat is in a folder.</p> : null)
          : byDate(loose).map(([label, items]) => <section key={label}><h4>{folders.length && label === byDate(loose)[0]![0] ? `Not in a folder · ${label}` : label}</h4><ul>{items.map(c => row(c))}</ul></section>)}
      </div>
    </>;
  };
  return <>
    <div className="ai-chat-find">
      <Search size={13}/><input autoFocus={!sidebar} value={find} placeholder="Search chats" aria-label="Search chats" onChange={e => setFind(e.target.value)}/>
      <button type="button" className="icon-button" aria-label="New folder" title="New folder" onClick={() => { setFolderEdit({ id: "", name: "" }); setFind(""); }}><FolderPlus size={14}/></button>
    </div>
    {newFolder && <form className="ai-chat-rename ai-folder-new" onSubmit={e => { e.preventDefault(); void onAddFolder(folderEdit!.name).then(ok => { if (ok) setFolderEdit(null); }); }}><Folder size={14}/><input autoFocus value={folderEdit!.name} maxLength={60} placeholder="Folder name" aria-label="New folder name" onChange={e => setFolderEdit({ id: "", name: e.target.value })}/><button className="button small primary" disabled={!folderEdit!.name.trim() || !!busy}>{busy === "addFolder" ? "Adding…" : "Add"}</button><button type="button" className="button small quiet" onClick={() => setFolderEdit(null)}>Cancel</button></form>}
    {body()}
  </>;
}
