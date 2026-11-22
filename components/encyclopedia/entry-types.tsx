'use client';
/*
 * Entry types: the picker in New entry and Change type (built-in kinds in groups, then the GM's own types), the small
 * form that makes a new type (a name, an icon and what it works like), and the Change type dialog.
 * A GM type is a page template (lib/encyclopedia/templates.ts) with an icon; its fields and tabs are on the Templates page.
 */
import { useState, type ComponentType } from 'react';
import { BookOpen, File, FileText, Flag, Folder, Goal, Hexagon, LayoutTemplate, ListChecks, Map as MapIcon, MapPin, Milestone, Orbit, Plus, ScrollText, Shapes, Ship, Store, TriangleAlert, Users } from 'lucide-react';
import { GalaxyIcon } from './galaxy-art';
import { PAGE_ICON_GLYPHS } from './page-icons';
import { ToolDialog } from './tool-dialog';
import { KIND_GROUPS, KIND_HINTS, KIND_LABELS, type EntryKind } from '@/lib/encyclopedia/entry-kinds';
import { PAGE_ICONS, type PageIcon } from '@/lib/encyclopedia/page-text';
import { newId, templateKinds, type Entry, type PageTemplate, type Workspace } from '@/lib/encyclopedia/world-model';
import { KIND_NAMES, saveTemplate, templatesFor } from '@/lib/encyclopedia/templates';
import { changeEntryType, typeChangeLoses, typeOf, type EntryType } from '@/lib/encyclopedia/entry-type';

export const KIND_ICONS: Record<EntryKind, ComponentType<{ size?: number }>> = {
  map: MapIcon, folder: Folder, note: FileText, page: File, other: Shapes, character: Users, place: MapPin, faction: Flag, lore: BookOpen,
  session: ScrollText, timeline: Milestone, tasks: ListChecks, quest: Goal, vehicle: Ship, store: Store, galaxy: GalaxyIcon, sector: Hexagon, system: Orbit,
};

/** A GM type's icon: its own, or its kind's. */
export const typeIcon = (t: Pick<PageTemplate, 'icon' | 'kind'>) => t.icon ? PAGE_ICON_GLYPHS[t.icon] : KIND_ICONS[t.kind] ?? LayoutTemplate;

const same = (a: EntryType, b: EntryType) => a.templateId !== undefined ? a.templateId === b.templateId : b.templateId === undefined && a.kind === b.kind;

/**
 * Every type to pick from: the GM's own first (they made them for this game), then the built-in kinds in groups.
 * `omit` leaves out kinds that can't be picked here (a page with pages inside can't become a map).
 */
export function TypePicker({ value, onChange, types, onNewType, omit = [], label = 'Entry type' }: {
  value: EntryType; onChange: (t: EntryType) => void; types: PageTemplate[]; onNewType?: () => void; omit?: EntryKind[]; label?: string;
}) {
  const chosen = value.templateId !== undefined ? types.find(t => t.id === value.templateId) : undefined;
  const hint = chosen ? `Your type · works like ${KIND_NAMES[chosen.kind].toLowerCase()}${chosen.fields.length ? ` · ${chosen.fields.length} field${chosen.fields.length === 1 ? '' : 's'}` : ''}` : value.kind ? KIND_HINTS[value.kind] : '';
  const pill = (key: string, t: EntryType, name: string, Icon: ComponentType<{ size?: number }>, title?: string) =>
    <button key={key} type="button" role="radio" aria-checked={same(value, t)} title={title} onClick={() => onChange(t)}><Icon size={15}/><span>{name}</span></button>;
  return <div className="type-picker" role="radiogroup" aria-label={label}>
    <div className="type-picker-head"><span className="type-picker-label">{label}</span>{hint && <span className="type-picker-hint">{hint}</span>}</div>
    {(types.length > 0 || onNewType) && <div className="type-group">
      <span className="type-group-name">Your types</span>
      <div className="type-pills">{types.filter(t => !omit.includes(t.kind)).map(t => pill(t.id, { templateId: t.id }, t.name, typeIcon(t), `${t.name}: works like ${KIND_NAMES[t.kind].toLowerCase()}`))}
        {onNewType && <button type="button" className="type-new" onClick={onNewType}><Plus size={15}/><span>New type</span></button>}</div>
    </div>}
    {KIND_GROUPS.map(g => { const kinds = g.kinds.filter(k => !omit.includes(k)); return kinds.length ? <div key={g.name} className="type-group">
      <span className="type-group-name">{g.name}</span>
      <div className="type-pills">{kinds.map(k => pill(k, { kind: k }, KIND_LABELS[k], KIND_ICONS[k], KIND_HINTS[k]))}</div>
    </div> : null; })}
  </div>;
}

/** Make a new entry type: a name, an icon, what it works like and who can use it. Fields and tabs come later, on Templates. */
export function NewTypeForm({ worldName, campaign, onCancel, onMake }: {
  worldName: string; campaign?: { id: string; name: string } | null; onCancel: () => void; onMake: (t: PageTemplate) => void;
}) {
  const [name, setName] = useState(''), [icon, setIcon] = useState<PageIcon>('star'), [kind, setKind] = useState<PageTemplate['kind']>('page'), [scope, setScope] = useState<'campaign' | 'world'>(campaign ? 'campaign' : 'world');
  const make = () => { const n = name.trim(); if (!n) return; onMake({ id: newId(), name: n.slice(0, 160), kind, icon, fields: [], tabs: [], body: '', overviewVisibility: kind === 'session' ? 'gm' : 'players', updatedAt: new Date().toISOString(), ...(scope === 'campaign' && campaign ? { campaignId: campaign.id } : {}) }); };
  const Glyph = PAGE_ICON_GLYPHS[icon];
  return <div className="new-type" role="group" aria-label="New entry type">
    <div className="new-type-head"><span className="new-type-preview"><Glyph size={18}/></span><input autoFocus aria-label="Type name" placeholder="Name it: Deity, Spell, Ship class…" maxLength={60} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); make(); } }}/></div>
    <div className="page-icon-grid new-type-icons" role="radiogroup" aria-label="Icon">{PAGE_ICONS.map(id => { const G = PAGE_ICON_GLYPHS[id]; return <button key={id} type="button" role="radio" aria-checked={icon === id} aria-label={id} title={id} className={icon === id ? 'on' : ''} onClick={() => setIcon(id)}><G size={15} aria-hidden="true"/></button>; })}</div>
    <div className="new-type-row">
      <label>Works like<select value={kind} onChange={e => setKind(e.target.value as PageTemplate['kind'])}>{templateKinds.map(k => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}</select></label>
      <label>Who can use it<select value={scope} onChange={e => setScope(e.target.value as 'campaign' | 'world')}>{campaign && <option value="campaign">{campaign.name}</option>}<option value="world">Every campaign in {worldName}</option></select></label>
    </div>
    <p className="new-type-hint">Add info box fields, tabs and starting text to it later on the Templates page.</p>
    <div className="button-row new-type-actions"><button type="button" className="button small" onClick={onCancel}>Cancel</button><button type="button" className="button small primary" disabled={!name.trim()} onClick={make}>Make type</button></div>
  </div>;
}

type Change = (s: Workspace | ((latest: Workspace) => Workspace)) => boolean | void;

/** Change type, from a page's Edit controls: pick the new type, see what goes, change it. */
export function ChangeTypeDialog({ entry, data, campaignId, change, onDone, onClose }: { entry: Entry; data: Workspace; campaignId: string | null; change: Change; onDone: (name: string) => void; onClose: () => void }) {
  const world = data.worlds.find(w => w.id === entry.worldId), campaign = data.campaigns.find(c => c.id === campaignId) ?? null;
  const types = templatesFor(world, campaignId), now = typeOf(data, entry), [to, setTo] = useState<EntryType>(now), [making, setMaking] = useState(false), [error, setError] = useState('');
  const hasChildren = data.entries.some(e => e.parentId === entry.id);
  const lost = (() => { try { return typeChangeLoses(data, entry, to); } catch { return []; } })();
  const name = to.templateId !== undefined ? types.find(t => t.id === to.templateId)?.name ?? '' : KIND_LABELS[to.kind];
  const go = () => { try { if (change(s => changeEntryType(s, entry.id, to, newId)) !== false) onDone(name); } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the type.'); } };
  return <ToolDialog title="Change type" onClose={onClose}><div className="details-form change-type">
    <p className="modal-intro">{entry.title} keeps its title, text, tabs, tags, links and place in the Wiki.</p>
    {making ? <NewTypeForm worldName={world?.name ?? 'this world'} campaign={campaign} onCancel={() => setMaking(false)} onMake={t => { if (change(s => saveTemplate(s, entry.worldId, t, newId)) !== false) { setTo({ templateId: t.id }); setMaking(false); } }}/>
      : <TypePicker value={to} onChange={t => { setTo(t); setError(''); }} types={types} omit={hasChildren ? ['map'] : []} label="New type" onNewType={() => setMaking(true)}/>}
    {lost.length > 0 && <p className="type-loses" role="alert"><TriangleAlert size={15}/><span>Becoming {/^[aeiou]/i.test(name) ? 'an' : 'a'} {name.toLowerCase()} removes {list(lost)}. Page history can bring it back.</span></p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={same(to, now) || making} onClick={go}>{lost.length ? `Change to ${name}` : `Make it ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`}</button></div>
  </div></ToolDialog>;
}

const list = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
