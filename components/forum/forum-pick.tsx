'use client';
/*
 * /forum with no campaign in the address (the Forum link in the site header): the forums you can open, your own
 * campaigns' and those you joined. With only one, it opens straight away.
 */
import { useEffect, useState } from 'react';
import { Crown, MessagesSquare, Users } from 'lucide-react';

type Forum = { href: string; name: string; sub: string; mine: boolean };
type Rows = { rows?: { key: string; name: string; encyclopedia: { id: string; name: string; worldName: string; archived: boolean; forum?: boolean } | null }[] };
type Joined = { campaigns?: { ref: string; campaign: string; ownerName: string; world: string; asking: boolean; forum?: boolean }[] };

export function ForumPicker() {
  const [list, setList] = useState<Forum[] | null>(null), [signIn, setSignIn] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const [own, joined] = await Promise.all([fetch('/api/campaigns', { cache: 'no-store' }), fetch('/api/members?mine=1', { cache: 'no-store' })]);
      if (own.status === 401 || joined.status === 401) { if (live) setSignIn(true); return; }
      const rows = own.ok ? await own.json() as Rows : {}, mem = joined.ok ? await joined.json() as Joined : {};
      const out: Forum[] = [
        ...(rows.rows ?? []).flatMap(r => r.encyclopedia?.forum && !r.encyclopedia.archived ? [{ href: `/forum#c-${encodeURIComponent(r.encyclopedia.id)}`, name: r.encyclopedia.name || r.name, sub: `You run it${r.encyclopedia.worldName ? ` · ${r.encyclopedia.worldName}` : ''}`, mine: true }] : []),
        ...(mem.campaigns ?? []).flatMap(c => c.forum && !c.asking ? [{ href: `/forum#m-${c.ref}`, name: c.campaign, sub: `Run by ${c.ownerName}${c.world ? ` · ${c.world}` : ''}`, mine: false }] : []),
      ];
      if (!live) return;
      if (out.length === 1) { location.replace(out[0]!.href); return; }
      setList(out);
    })().catch(() => { if (live) setError('Couldn’t list your forums. Try again in a moment.'); });
    return () => { live = false; };
  }, []);
  /* eslint-disable @next/next/no-html-link-for-pages -- other tools open as full pages (AGENTS.md) */
  return <div className="forum-message forum-pick">
    <h1><MessagesSquare size={22} aria-hidden="true" /> Forums</h1>
    {signIn ? <><p>Sign in to open your campaigns’ forums.</p><p><a className="f-btn" href={`/account?mode=login&next=${encodeURIComponent('/forum')}`}>Sign in</a></p></>
      : error ? <p className="form-error">{error}</p>
      : !list ? <p className="muted">Looking for your forums…</p>
      : !list.length ? <p>No forums yet. Forums start switched off: set one up with Set up forum on a campaign’s page. Campaigns you join show theirs once the GM sets one up and lets your group read it. <a href="/campaigns">Go to Campaigns</a></p>
      : <><p className="muted">Each campaign has its own forum. Pick one.</p><ul className="pick-list">{list.map(f => <li key={f.href}><a href={f.href}>{f.mine ? <Crown size={16} aria-hidden="true" /> : <Users size={16} aria-hidden="true" />}<span><b>{f.name}</b><small>{f.sub}</small></span></a></li>)}</ul></>}
  </div>;
  /* eslint-enable @next/next/no-html-link-for-pages */
}
