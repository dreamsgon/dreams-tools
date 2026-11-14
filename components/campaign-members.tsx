"use client";
import { useEffect, useRef, useState } from "react";
import { Ban, Bell, Check, Copy, Link2, MoreHorizontal, Plus, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { choices, groupColors, permissionInfo, permissionKeys, type Choice, type GroupColor, type Permission } from "@/lib/members";
import type { MemberStore } from "@/lib/members-server";
import { when } from "./home-campaigns";
import "./campaign-members.css";

export type MembersView = Awaited<ReturnType<MemberStore["forOwner"]>>;
type Sub = "people" | "groups" | "links" | "banned";
type Group = MembersView["groups"][number];
type Person = MembersView["members"][number];

/** Sends one change to /api/members and returns the owner's updated view. */
export async function membersAction(body: object): Promise<MembersView> {
  const r = await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || "That didn't save. Try again.");
  return out;
}
/** "2h ago", "yesterday" or "Nov 12", to sit mid-sentence. */
export const ago = (iso: string) => { const w = when(iso); return /^[A-Z][a-z]{2} \d/.test(w) ? w : w.toLowerCase(); };
export const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
const choiceNames: Record<Choice, string> = { yes: "Yes", no: "No", never: "Never" };
const builtinAbout: Record<string, string> = { cogms: "Run the game with you", players: "Play and read player pages", guests: "Read along, no posting" };
export const about = (g: Pick<Group, "about" | "builtin">) => g.about || (g.builtin ? builtinAbout[g.builtin] : "Made by you");

export function Chip({ group }: { group: Pick<Group, "name" | "color"> }) {
  return <span className={`mem-chip mem-${group.color}`}>{group.name}</span>;
}
export function Avatar({ name, seed }: { name: string; seed?: string }) {
  const n = [...(seed ?? name)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  return <span className={`mem-avatar mem-av${n}`} aria-hidden="true">{initial(name)}</span>;
}

/** The Members tab: People, Groups and permissions, Invite links and Banned. Only the campaign's owner sees it. */
export default function CampaignMembers({ campaignId, view, setView }: { campaignId: string; view: MembersView; setView: (v: MembersView) => void }) {
  const [sub, setSub] = useState<Sub>("people"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [banning, setBanning] = useState<{ userId: string; name: string } | null>(null);
  async function act(body: object) {
    setBusy(true); setError("");
    try { setView(await membersAction({ ...body, campaignId })); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); return false; }
    finally { setBusy(false); }
  }
  const p = { view, act, busy };
  return <div className="mem">
    <div className="mem-subtabs" role="tablist" aria-label="Members">
      {(["people", "groups", "links", ...(view.bans.length ? ["banned" as const] : [])] as Sub[]).map(s =>
        <button key={s} role="tab" aria-selected={sub === s} onClick={() => setSub(s)}>
          {{ people: "People", groups: "Groups and permissions", links: "Invite links", banned: "Banned" }[s]}
          {s === "banned" && <span className="mem-count">{view.bans.length}</span>}
          {s === "people" && view.requests.length > 0 && <span className="mem-count mem-count-warn">{view.requests.length}</span>}
        </button>)}
    </div>
    {error && <p className="hub-error mem-error" role="alert">{error}</p>}
    {sub === "people" && <People {...p} go={setSub} ban={setBanning} />}
    {sub === "groups" && <Groups {...p} />}
    {sub === "links" && <Links {...p} />}
    {sub === "banned" && <Banned {...p} />}
    {banning && <BanDialog who={banning} busy={busy} close={() => setBanning(null)} ban={async (email, ip, note) => { if (await act({ action: "ban", userId: banning.userId, email, ip, note })) setBanning(null); }} />}
  </div>;
}

type Part = { view: MembersView; act: (body: object) => Promise<boolean>; busy: boolean };

function People({ view, act, busy, go, ban }: Part & { go: (s: Sub) => void; ban: (w: { userId: string; name: string }) => void }) {
  const groupOf = (id: string) => view.groups.find(g => g.id === id);
  const count = (id: string) => view.members.filter(m => m.groups.includes(id)).length;
  return <div className="mem-layout">
    <div className="mem-main">
      {view.requests.length > 0 && <section className="hub-card mem-asking" aria-label="Asking to join">
        <h2>Asking to join</h2>
        <ul className="mem-list">{view.requests.map(r => <li key={r.userId}>
          <Avatar name={r.name} seed={r.userId} />
          <span className="mem-who"><strong>{r.name}</strong><small>Used the {groupOf(r.groupId)?.name ?? "invite"} link · {ago(r.at)}</small></span>
          <span className="mem-actions">
            <button className="hub-button" disabled={busy} onClick={() => void act({ action: "decline", userId: r.userId })}>Decline</button>
            <button className="hub-button hub-button-primary" disabled={busy} onClick={() => void act({ action: "letIn", userId: r.userId })}><Check size={15} aria-hidden="true" />Let in</button>
          </span>
        </li>)}</ul>
      </section>}
      <section className="hub-card" aria-label="Members">
        <div className="hub-card-head"><h2>{view.members.length + 1} {view.members.length ? "members" : "member"}</h2>
          <button className="hub-button hub-button-primary" onClick={() => go("links")}><UserPlus size={15} aria-hidden="true" />Invite people</button></div>
        <ul className="mem-list">
          <li><Avatar name={view.ownerName || "You"} seed="owner" /><span className="mem-who"><strong>{view.ownerName || "You"} <em>(you)</em></strong><small>Runs this campaign</small></span><span className="mem-chips"><span className="mem-chip mem-owner">Owner</span></span><span className="mem-menu-spot" /></li>
          {view.members.map(m => <li key={m.userId}>
            <Avatar name={m.name} seed={m.userId} />
            <span className="mem-who"><strong>{m.name}</strong><small>Joined {date(m.joinedAt)}</small></span>
            <span className="mem-chips">{m.groups.map(id => groupOf(id)).filter(g => !!g).map(g => <Chip key={g.id} group={g} />)}</span>
            <MemberMenu person={m} groups={view.groups} busy={busy} act={act} ban={() => ban({ userId: m.userId, name: m.name })} />
          </li>)}
        </ul>
        {!view.members.length && <p className="hub-muted">Nobody has joined yet. Share an invite link and people show up here.</p>}
      </section>
    </div>
    <aside className="mem-side">
      <section className="hub-card">
        <div className="hub-card-head"><h2>Your groups</h2><button className="hub-button" onClick={() => go("groups")}><Plus size={15} aria-hidden="true" />New group</button></div>
        <ul className="mem-groups">
          <li><span className="mem-chip mem-owner">Owner</span><span>Everything, always</span><b>1</b></li>
          {view.groups.map(g => <li key={g.id}><Chip group={g} /><span>{about(g)}</span><b>{count(g.id)}</b></li>)}
        </ul>
        <p className="hub-muted mem-small">Co-GMs, Players and Guests come with every campaign. Make your own for a split party or table talk. Someone in two groups gets what either allows. <button className="mem-link" onClick={() => go("groups")}>Change permissions</button></p>
      </section>
      {view.bans.length > 0 && <section className="hub-card">
        <div className="hub-card-head"><h2>Banned</h2><button className="mem-link" onClick={() => go("banned")}>Manage</button></div>
        <ul className="mem-groups">{view.bans.slice(0, 4).map(b => <li key={b.id}><Avatar name={b.name} seed={b.userId} /><span>{b.name}</span><small>{banBy(b)}</small></li>)}</ul>
      </section>}
      <section className="hub-card">
        <h2>Player links still work</h2>
        <p className="hub-muted">The secret player link you already shared keeps working for people without an account. Members just don&apos;t need it.</p>
      </section>
    </aside>
  </div>;
}
const banBy = (b: MembersView["bans"][number]) => {
  const parts = ["Account", ...(b.byEmail ? ["email"] : []), ...(b.byIp ? ["address"] : [])];
  return parts.length < 3 ? parts.join(" and ") : `${parts[0]}, ${parts[1]} and ${parts[2]}`;
};

/** The ⋯ menu on a member: their groups, Remove and Ban. */
function MemberMenu({ person, groups, busy, act, ban }: { person: Person; groups: Group[]; busy: boolean; act: (b: object) => Promise<boolean>; ban: () => void }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const toggle = (id: string) => {
    const next = person.groups.includes(id) ? person.groups.filter(g => g !== id) : [...person.groups, id];
    if (next.length) void act({ action: "memberGroups", userId: person.userId, groups: next });
  };
  return <span className="mem-menu-spot" ref={ref}>
    <button className="mem-icon" aria-label={`${person.name}: groups and more`} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
    {open && <div className="mem-menu" role="menu">
      <h3>Groups</h3>
      {groups.map(g => <label key={g.id} className="mem-check"><input type="checkbox" disabled={busy || (person.groups.length === 1 && person.groups[0] === g.id)} checked={person.groups.includes(g.id)} onChange={() => toggle(g.id)} />{g.name}</label>)}
      <hr />
      <button role="menuitem" className="mem-danger" disabled={busy} onClick={() => { setOpen(false); void act({ action: "remove", userId: person.userId }); }}>Remove from campaign</button>
      <button role="menuitem" className="mem-danger" disabled={busy} onClick={() => { setOpen(false); ban(); }}><Ban size={15} aria-hidden="true" />Ban from campaign…</button>
    </div>}
  </span>;
}

function Groups({ view, act, busy }: Part) {
  const [adding, setAdding] = useState(false), [name, setName] = useState(""), [color, setColor] = useState<GroupColor>("pink");
  const [editing, setEditing] = useState<string | null>(null);
  const rows = (forum: boolean) => permissionKeys.filter(k => !!permissionInfo[k].forum === forum);
  const table = (keys: Permission[]) => keys.map(k => <tr key={k}>
    <th scope="row">{permissionInfo[k].name}{permissionInfo[k].soon && <span className="mem-soon">Coming soon</span>}{permissionInfo[k].hint && <small className="mem-row-hint">{permissionInfo[k].hint}</small>}</th>
    <td><span className="mem-always">Always</span></td>
    {view.groups.map(g => <td key={g.id}><div className="mem-seg" role="radiogroup" aria-label={`${g.name}: ${permissionInfo[k].name}`}>
      {choices.map(c => <button key={c} role="radio" aria-checked={g.perms[k] === c} className={`mem-seg-${c}`} disabled={busy} onClick={() => g.perms[k] !== c && void act({ action: "permission", groupId: g.id, permission: k, choice: c })}>{choiceNames[c]}</button>)}
    </div></td>)}
  </tr>);
  return <div className="mem-perms">
    <div className="mem-perms-head">
      {adding ? <form className="mem-new-group" onSubmit={async e => { e.preventDefault(); if (await act({ action: "addGroup", name, color })) { setAdding(false); setName(""); } }}>
        <input autoFocus required maxLength={40} placeholder="Group name, like Party B" aria-label="Group name" value={name} onChange={e => setName(e.target.value)} />
        <Colors value={color} set={setColor} />
        <button className="hub-button hub-button-primary" disabled={busy || !name.trim()}>Add group</button>
        <button type="button" className="hub-button" onClick={() => setAdding(false)}>Cancel</button>
      </form> : <button className="hub-button" onClick={() => setAdding(true)} disabled={view.groups.length >= 20}><Plus size={15} aria-hidden="true" />New group</button>}
      <p className="hub-muted mem-small">Rename, recolour or delete a group from its name.</p>
    </div>
    {editing && (() => { const g = view.groups.find(x => x.id === editing); return g ? <EditGroup key={g.id} group={g} busy={busy} act={act} done={() => setEditing(null)} /> : null; })()}
    <div className="mem-table-wrap"><table className="mem-table">
      <thead><tr><th scope="col">Permission</th><th scope="col"><span className="mem-chip mem-owner">Owner</span></th>
        {view.groups.map(g => <th scope="col" key={g.id}><button className="mem-chip-button" onClick={() => setEditing(editing === g.id ? null : g.id)} aria-expanded={editing === g.id}><Chip group={g} /></button></th>)}</tr></thead>
      <tbody>
        <tr className="mem-section"><th colSpan={view.groups.length + 2}>Campaign</th></tr>
        {table(rows(false))}
        <tr className="mem-section"><th colSpan={view.groups.length + 2}>Forum <small>Kept now, used when the forum arrives.</small></th></tr>
        {table(rows(true))}
      </tbody>
    </table></div>
    <p className="hub-muted mem-small"><b>Yes</b> allows it. <b>No</b> leaves it to the member&apos;s other groups. <b>Never</b> wins over everything, so a Guest who is also a Player still can&apos;t edit. Only you can manage members for now.</p>
  </div>;
}
function Colors({ value, set }: { value: GroupColor; set: (c: GroupColor) => void }) {
  return <span className="mem-colors" role="radiogroup" aria-label="Colour">{groupColors.map(c => <button type="button" key={c} role="radio" aria-checked={value === c} aria-label={c} className={`mem-swatch mem-${c}`} onClick={() => set(c)} />)}</span>;
}
function EditGroup({ group, busy, act, done }: { group: Group; busy: boolean; act: (b: object) => Promise<boolean>; done: () => void }) {
  const [name, setName] = useState(group.name), [color, setColor] = useState<GroupColor>(group.color), [text, setText] = useState(group.about ?? "");
  return <form className="hub-card mem-edit-group" onSubmit={async e => { e.preventDefault(); if (await act({ action: "editGroup", groupId: group.id, name, color, about: text })) done(); }}>
    <h2>Edit {group.name}</h2>
    <div className="mem-new-group">
      <input required maxLength={40} aria-label="Group name" value={name} onChange={e => setName(e.target.value)} />
      <input maxLength={80} aria-label="What the group is for" placeholder={about(group)} value={text} onChange={e => setText(e.target.value)} />
      <Colors value={color} set={setColor} />
    </div>
    <div className="hub-row">
      <button className="hub-button hub-button-primary" disabled={busy || !name.trim()}>Save</button>
      <button type="button" className="hub-button" onClick={done}>Cancel</button>
      {group.builtin ? <span className="hub-muted mem-small">{group.name} comes with every campaign, so it stays.</span>
        : <button type="button" className="hub-button mem-danger-button" disabled={busy} onClick={async () => { if (await act({ action: "deleteGroup", groupId: group.id })) done(); }}><Trash2 size={15} aria-hidden="true" />Delete group</button>}
    </div>
  </form>;
}

const expiryChoices = [["never", "Never"], ["1d", "In 1 day"], ["7d", "In 7 days"], ["30d", "In 30 days"]] as const;
function Links({ view, act, busy }: Part) {
  const [copied, setCopied] = useState("");
  const link = (id: string) => view.links.find(l => l.groupId === id);
  const waiting = (id: string) => view.requests.filter(r => r.groupId === id);
  return <div className="mem-layout">
    <div className="mem-main">
      {view.groups.map(g => {
        const l = link(g.id), w = waiting(g.id);
        if (!l) return <section key={g.id} className="hub-card mem-link-card mem-link-none">
          <Chip group={g} /><span className="hub-muted">{g.builtin === "cogms" ? "No link. People join this group only when you move them into it." : "No link yet."}</span>
          <button className="hub-button" disabled={busy} onClick={() => void act({ action: "newLink", groupId: g.id, approve: g.builtin === "cogms", expires: "never" })}><Link2 size={15} aria-hidden="true" />Make a link</button>
        </section>;
        const left = l.expiresAt && !l.expired ? `Until ${date(l.expiresAt)}` : null;
        return <section key={g.id} className="hub-card mem-link-card">
          <div className="mem-link-top">
            <Chip group={g} />
            <span className="hub-muted mem-small">{l.uses ? `Used ${l.uses === 1 ? "once" : `${l.uses} times`}` : "Not used yet"}{w.length > 0 && <b className="mem-waiting"> · {w.length === 1 ? `${w[0].name} is waiting` : `${w.length} waiting`}</b>}{l.expired && <b className="mem-waiting"> · Expired</b>}</span>
            <span className="mem-actions">
              <button className="hub-button" disabled={busy} title="Makes a new link. The old one stops working." onClick={() => void act({ action: "newLink", groupId: g.id, approve: l.approve })}><RefreshCw size={14} aria-hidden="true" />New link</button>
              <button className="hub-button" disabled={busy} onClick={() => void act({ action: "linkOff", groupId: g.id })}>Turn off</button>
            </span>
          </div>
          {l.url ? <div className="mem-url">
            <input readOnly aria-label={`${g.name} invite link`} value={l.url} onFocus={e => e.currentTarget.select()} />
            <button className="hub-button hub-button-primary" onClick={() => { void navigator.clipboard?.writeText(l.url!); setCopied(g.id); setTimeout(() => setCopied(c => c === g.id ? "" : c), 2000); }}>{copied === g.id ? <><Check size={15} aria-hidden="true" />Copied</> : <><Copy size={15} aria-hidden="true" />Copy</>}</button>
          </div> : <p className="hub-muted mem-small">This link can&apos;t be shown again. Make a new link to share.</p>}
          <div className="mem-link-settings">
            <label>Expires <select disabled={busy} value={l.expiresAt ? "keep" : "never"} onChange={e => e.target.value !== "keep" && void act({ action: "linkSettings", groupId: g.id, expires: e.target.value })}>
              {l.expiresAt && <option value="keep">{left ?? "Expired"}</option>}
              {expiryChoices.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select></label>
            <span className="mem-setting">New people
              <span className="mem-seg mem-seg-wide" role="radiogroup" aria-label={`New people on the ${g.name} link`}>
                <button role="radio" aria-checked={!l.approve} disabled={busy} onClick={() => l.approve && void act({ action: "linkSettings", groupId: g.id, approve: false })}>Join straight away</button>
                <button role="radio" aria-checked={l.approve} disabled={busy} onClick={() => !l.approve && void act({ action: "linkSettings", groupId: g.id, approve: true })}>Wait for my OK</button>
              </span></span>
          </div>
        </section>;
      })}
    </div>
    <aside className="mem-side">
      <section className="hub-card">
        <h2>How links work</h2>
        <ul className="mem-howto">
          <li>Each group can have one link. Whoever opens it signs in and joins that group.</li>
          <li><b>New link</b> stops the old one working. <b>Turn off</b> stops it until you make another.</li>
          <li>Choose for each link: <b>Join straight away</b>, or <b>Wait for my OK</b>, where people wait under Asking to join until you let them in.</li>
          <li>A Co-GMs link waits for your OK to start, so nobody gets GM pages by a forwarded link.</li>
        </ul>
      </section>
      <section className="hub-card">
        <h2 className="mem-bell-head"><Bell size={14} aria-hidden="true" />Tell me when someone</h2>
        <ul className="mem-toggles">
          <li><Toggle on disabled label="Asks to join" /><span><strong>Asks to join</strong><small>On the bell in RPG Tools, and as a count on the Members tab.</small></span></li>
          <li><Toggle on={view.notify.joins} disabled={busy} label="Joins and leaves" flip={() => void act({ action: "notify", joins: !view.notify.joins, discord: view.notify.discord })} /><span><strong>Joins and leaves</strong><small>On the bell, so you know who came in or left.</small></span></li>
          <li><Toggle on={view.notify.discord} disabled={busy} label="Also post it in Discord" flip={() => void act({ action: "notify", joins: view.notify.joins, discord: !view.notify.discord })} /><span><strong>Also post it in Discord</strong><small>Where you send &ldquo;People joining&rdquo; in your Discord settings.</small></span></li>
        </ul>
      </section>
    </aside>
  </div>;
}
function Toggle({ on, disabled, label, flip }: { on: boolean; disabled?: boolean; label: string; flip?: () => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="mem-switch" disabled={disabled} onClick={flip}><span /></button>;
}

function Banned({ view, act, busy }: Part) {
  return <section className="hub-card mem-banned">
    <h2>Banned</h2>
    <ul className="mem-list">{view.bans.map(b => <li key={b.id}>
      <Avatar name={b.name} seed={b.userId} />
      <span className="mem-who"><strong>{b.name}</strong><small>Banned {date(b.at)} · {banBy(b).toLowerCase()}{b.note ? <> · &ldquo;{b.note}&rdquo;</> : null}</small></span>
      <span className="mem-actions"><button className="hub-button" disabled={busy} onClick={() => void act({ action: "unban", banId: b.id })}>Unban</button></span>
    </li>)}</ul>
    <p className="hub-muted mem-small">Banned people can&apos;t open your invite links or ask to join. They aren&apos;t told why. A ban on where they connect from ends after 30 days.</p>
  </section>;
}

function BanDialog({ who, busy, close, ban }: { who: { userId: string; name: string }; busy: boolean; close: () => void; ban: (email: boolean, ip: boolean, note: string) => void }) {
  const [email, setEmail] = useState(true), [ip, setIp] = useState(false), [note, setNote] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return <dialog ref={ref} className="mem-dialog" aria-labelledby="mem-ban-title" onClose={close} onCancel={close}>
    <form method="dialog" onSubmit={e => { e.preventDefault(); ban(email, ip, note); }}>
      <div className="mem-dialog-head"><Avatar name={who.name} seed={who.userId} /><div><h2 id="mem-ban-title">Ban {who.name}?</h2><p>They leave the campaign now and can&apos;t come back in.</p></div>
        <button type="button" className="mem-icon" aria-label="Cancel" onClick={close}><X size={18} /></button></div>
      <fieldset><legend>Ban by</legend>
        <label className="mem-check mem-check-block"><input type="checkbox" checked disabled /><span><strong>Their account</strong><small>Always on. They can&apos;t join again with this account.</small></span></label>
        <label className="mem-check mem-check-block"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /><span><strong>Their email address</strong><small>A new account with the same email can&apos;t join either.</small></span></label>
        <label className="mem-check mem-check-block"><input type="checkbox" checked={ip} onChange={e => setIp(e.target.checked)} /><span><strong>Where they connect from (IP address)</strong><small>Blocks new accounts from the same internet connection for 30 days. Off to start: shared Wi-Fi or a school network can block other people too, and a new connection gets around it.</small></span></label>
      </fieldset>
      <label className="mem-note"><span><b>Note for you</b> (only you see it)</span><input maxLength={200} placeholder="Why, so you remember later" value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="mem-dialog-foot"><span className="hub-muted mem-small">You can unban them under Members › Banned.</span>
        <button type="button" className="hub-button" onClick={close}>Cancel</button>
        <button className="hub-button mem-ban-button" disabled={busy}>Ban {who.name}</button></div>
    </form>
  </dialog>;
}
