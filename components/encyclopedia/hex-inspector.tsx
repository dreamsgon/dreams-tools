'use client';
import { useState } from 'react';
import { ArrowRight, CalendarDays, Dices, Footprints, Users, Wind } from 'lucide-react';
import { terrains, type HexNote, type MapData } from '@/lib/encyclopedia/map-model';
import { advanceCalendar, cellLabel, cellWord, encounterChecks, hexNote, HOURS_PER_DAY, moveParty, paces, partyRegion, placeParty, setHexNote, type CrawlPlan, type Pace } from '@/lib/encyclopedia/hex-crawl';
import { advanceDate, formatDate, type Calendar } from '@/lib/encyclopedia/calendar-model';
import { weatherOn } from '@/lib/encyclopedia/weather-model';
import { inCampaign, rollTable, type TableLibrary } from '@/lib/encyclopedia/tables';
import type { Campaign } from '@/lib/encyclopedia/world-model';

const hoursText = (h: number) => { const r = Math.round(h * 2) / 2; return `${r} hour${r === 1 ? '' : 's'}`; };
const checkOptions = [[0, 'No checks'], [8, '1 in 8 per hex'], [6, '1 in 6 per hex'], [4, '1 in 4 per hex']] as const;

/** Everything about one hex or square of an area map: its notes, its encounters, and moving the party there. */
export function HexInspector({ map, cell, plan, pace, setPace, campaign, library, setMap, onCalendarChange }: {
  map: MapData; cell: number; plan: CrawlPlan | null; pace: Pace; setPace: (p: Pace) => void; campaign?: Campaign;
  library: TableLibrary | null | 'error'; setMap: (patch: Partial<MapData>) => void; onCalendarChange?: (c: Calendar) => boolean;
}) {
  const note = hexNote(map, cell), word = cellWord(map);
  const [calendarId, setCalendarId] = useState(campaign?.calendars?.[0]?.id ?? '');
  const [sides, setSides] = useState(6), [roll, setRoll] = useState<{ cell: number; text: string } | null>(null);
  const [log, setLog] = useState<{ cell: number; lines: string[] } | null>(null);
  const calendar = campaign?.calendars?.find(c => c.id === calendarId);
  const save = (patch: Partial<HexNote>) => setMap({ hexes: setHexNote(map, { ...note, ...patch }) });
  const revealed = !map.fog?.enabled || map.fog.revealed.includes(cell);
  const terrain = map.source === 'generated' ? terrains[map.tiles[cell] ?? 1]?.name : null;
  const tables = library && library !== 'error' ? library.tables.filter(t => t.kind !== 'oracle' && inCampaign(t, campaign?.id ?? null)).sort((a, b) => Number(b.category === 'encounter') - Number(a.category === 'encounter') || a.name.localeCompare(b.name)) : [];
  const tableId = note.tableId ?? map.encounterTableId ?? null;
  const table = tables.find(t => t.id === tableId);
  const rollOn = (id: string | null | undefined) => {
    if (!id || !library || library === 'error') return null;
    try { return rollTable(library, id).text; } catch { return null; }
  };
  const arrival = calendar && plan ? advanceDate(calendar, calendar.current, plan.days) : null;
  const region = calendar && campaign ? partyRegion(map, cell, campaign.id, calendar) : undefined;
  const forecast = calendar && region && arrival ? weatherOn(calendar, region.id, arrival) : undefined;

  const move = () => {
    if (!plan || plan.blocked !== null) return;
    let next: Calendar | null = calendar ?? null;
    if (calendar && plan.days > 0) {
      next = advanceCalendar(calendar, plan.days, region);
      if (onCalendarChange && !onCalendarChange(next)) { setLog({ cell, lines: ['The calendar could not be saved, so the party stayed put.'] }); return; }
    }
    setMap(moveParty(map, plan, next ? formatDate(next, next.current) : undefined));
    const lines = [`Moved ${plan.cells.length} ${word.toLowerCase()}${plan.cells.length === 1 ? '' : 'es'} to ${word.toLowerCase()} ${cellLabel(map, cell)}${next ? `. ${formatDate(next, next.current)}` : ''}.`];
    for (const c of encounterChecks(plan.cells, sides)) {
      const here = map.hexes?.find(h => h.cell === c), id = here?.tableId ?? map.encounterTableId;
      const text = rollOn(id);
      lines.push(`Encounter in ${cellLabel(map, c)}${here?.title ? ` (${here.title})` : ''}: ${text ?? 'make one up, or choose an encounter table.'}`);
    }
    if (sides && lines.length === 1) lines.push('No encounters on the way.');
    setLog({ cell, lines });
  };
  const makeCamp = () => {
    if (!map.party) return;
    if (calendar) { const next = advanceCalendar(calendar, 1, region); if (onCalendarChange && !onCalendarChange(next)) return; }
    setMap({ party: { ...map.party, hours: 0 } });
    setLog({ cell, lines: [calendar ? `Camped for the night. ${formatDate(calendar, advanceDate(calendar, calendar.current, 1))}, a fresh day of travel.` : 'Camped for the night. A fresh day of travel.'] });
  };

  return <div className="world-pin hex-inspector">
    <span className="world-label">{word} {cellLabel(map, cell)}</span>
    <input className="hex-title" aria-label={`${word} name`} placeholder={`Name this ${word.toLowerCase()}`} value={note.title} maxLength={100} onChange={e => save({ title: e.target.value })}/>
    <span className="hex-meta">{[terrain, note.exploredOn ? `explored on ${note.exploredOn}` : map.fog?.enabled ? (revealed ? 'explored' : 'not explored yet') : null].filter(Boolean).join(' · ')}</span>
    <label className="world-field">Notes<textarea rows={4} value={note.notes} maxLength={4000} placeholder="What the party finds here: ruins, lairs, people, secrets." onChange={e => save({ notes: e.target.value })}/></label>
    <label className="world-field">Who can see these notes<select value={note.visibility} onChange={e => save({ visibility: e.target.value as HexNote['visibility'] })}><option value="gm">GM only</option><option value="players">Players, once explored</option></select></label>

    <h3 className="world-sub"><Dices size={16}/> Random encounters here</h3>
    {library === null ? <p className="aside-hint">Loading your tables…</p> : library === 'error' ? <p className="aside-hint">Your random tables could not be loaded.</p> : <>
      <div className="hex-roll">
        <select aria-label="Encounter table" value={note.tableId ?? ''} onChange={e => save({ tableId: e.target.value || null })}>
          <option value="">{map.encounterTableId ? `Map default: ${tables.find(t => t.id === map.encounterTableId)?.name ?? 'missing table'}` : 'No table'}</option>
          {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" className="button" disabled={!table} onClick={() => setRoll({ cell, text: rollOn(tableId) ?? 'That table could not be rolled.' })}><Dices size={15}/> Roll</button>
      </div>
      {roll?.cell === cell && <p className="hex-result" role="status">{roll.text}</p>}
      <label className="world-field">Default for the whole map<select value={map.encounterTableId ?? ''} onChange={e => setMap({ encounterTableId: e.target.value || null })}><option value="">None</option>{tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {!tables.length && <p className="aside-hint">Make an encounter table on the Random tables page to roll it here.</p>}
    </>}

    <h3 className="world-sub"><Users size={16}/> The party</h3>
    {!map.party ? <>
      <p className="aside-hint">Put the party on the map to track where they are. Moving them spends travel time, explores the {word.toLowerCase()}es they pass, and can roll for encounters.</p>
      <button type="button" className="button primary" onClick={() => setMap({ party: placeParty(map, cell), ...(map.fog?.enabled ? { fog: { ...map.fog, revealed: [...new Set([...map.fog.revealed, cell])].sort((a, b) => a - b) } } : {}) })}><Footprints size={15}/> Put the party here</button>
    </> : map.party.cell === cell ? <>
      <p>The party is here. {hoursText(map.party.hours)} of {HOURS_PER_DAY} travel hours used today.</p>
      <button type="button" className="button" onClick={makeCamp}>Make camp{calendar ? ' and start the next day' : ''}</button>
      <label className="world-check"><input type="checkbox" checked={map.party.visibility === 'players'} onChange={e => setMap({ party: { ...map.party!, visibility: e.target.checked ? 'players' : 'gm' } })}/><span>Players can see the party<small>Shows the marker and the trail on the shared map.</small></span></label>
    </> : <>
      <div className="world-seg" role="group" aria-label="Pace">{(Object.keys(paces) as Pace[]).map(p => <button key={p} type="button" aria-pressed={pace === p} onClick={() => setPace(p)}>{paces[p].name}</button>)}</div>
      {!plan ? <p className="aside-hint">Set the map width (with nothing selected) to measure travel.</p> : <>
        <dl className="hex-plan">
          <div><dt>Distance</dt><dd>{plan.cells.length} {word.toLowerCase()}{plan.cells.length === 1 ? '' : 'es'} · {Math.round(plan.distance * 10) / 10} {plan.unit === 'mi' ? 'miles' : 'km'}</dd></div>
          <div><dt>Travel time</dt><dd>{hoursText(plan.hours)}</dd></div>
          {plan.extraHours > 0 && <div><dt>Slowed by {plan.slowest?.toLowerCase()}</dt><dd>+{hoursText(plan.extraHours)}</dd></div>}
          <div><dt>Arrive</dt><dd>{arrival && calendar ? formatDate(calendar, arrival) : plan.days ? `${plan.days} day${plan.days === 1 ? '' : 's'} later` : 'Today'}</dd></div>
        </dl>
        {calendar && <div className="hex-day"><span><CalendarDays size={16}/>{(campaign?.calendars?.length ?? 0) > 1 ? <select aria-label="Calendar" value={calendarId} onChange={e => setCalendarId(e.target.value)}>{campaign!.calendars!.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : calendar.name}</span>{region && <span><Wind size={16}/>{region.name}: {forecast ? `${forecast.condition.toLowerCase()}, ${Math.round(forecast.highF)}°F` : plan.days ? 'forecast made on arrival' : 'no forecast today'}</span>}</div>}
        {!calendar && <p className="aside-hint">{campaign ? 'Add a calendar to this campaign to move its date along with the party.' : 'Open this map in a campaign with a calendar to move the date along with the party.'}</p>}
        <label className="world-field">Encounter checks<select value={sides} onChange={e => setSides(+e.target.value)}>{checkOptions.map(([n, name]) => <option key={n} value={n}>{name}</option>)}</select></label>
        {plan.blocked !== null && <p className="form-error" role="alert">The way crosses open water at {cellLabel(map, plan.blocked)}. Pick a closer {word.toLowerCase()}, or draw a road across.</p>}
        <button type="button" className="button primary" disabled={plan.blocked !== null} onClick={move}>Move party here <ArrowRight size={15}/></button>
      </>}
      <button type="button" className="text-button" onClick={() => setMap({ party: { ...map.party!, cell, trail: [] } })}>Put the party here without travelling</button>
    </>}
    {log && log.cell === cell && <ul className="hex-log" role="status">{log.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
  </div>;
}
