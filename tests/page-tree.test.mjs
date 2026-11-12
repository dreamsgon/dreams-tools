import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,canParent} from '../lib/encyclopedia/world-model.ts';
import {movePage,dropProblem,descendantCount,pagePath,linkSuggestions,mentionsOf,unlinkedMentions,linkMentions,linkText} from '../lib/encyclopedia/page-tree.ts';

const now='2026-11-12T00:00:00.000Z';
const page=(id,title,parentId=null,body='',campaignId=null,kind='place')=>({id,worldId:'demo-world',campaignId,parentId,title,kind,body,updatedAt:now});
function world(extra){const s=demoWorkspace();s.entries.push(...extra);return workspaceSchema.parse(s);}

test('any page can hold sub-pages in the same scope, but not across campaigns or in a loop', () => {
  const s=world([page('fens','The Fens'),page('greyfen','Greyfen','fens'),page('lantern','The Sunken Lantern','greyfen')]);
  assert.equal(workspaceSchema.safeParse(s).success,true);
  assert.deepEqual(pagePath(s,s.entries.find(e=>e.id==='lantern')),['The Fens','Greyfen']);
  assert.equal(descendantCount(s,'fens'),2);
  const loop={...s,entries:s.entries.map(e=>e.id==='fens'?{...e,parentId:'lantern'}:e)};
  assert.equal(workspaceSchema.safeParse(loop).success,false);
  const cross={...s,entries:[...s.entries,page('camp','In a campaign','fens','', 'demo-campaign','note')]};
  assert.equal(workspaceSchema.safeParse(cross).success,false);
  const e=s.entries.find(x=>x.id==='demo-mara');
  assert.equal(canParent(e,s.entries.find(x=>x.id==='greyfen'),s),true);
  assert.equal(canParent(s.entries.find(x=>x.id==='fens'),s.entries.find(x=>x.id==='lantern'),s),false);
});

test('dragging nests a page or places it before or after another', () => {
  const s=world([page('fens','The Fens'),page('greyfen','Greyfen','fens'),page('docks','Greyfen docks','fens'),page('hall',"Reeve's hall")]);
  const inside=movePage(s,'hall','greyfen','inside');
  assert.equal(inside.entries.find(e=>e.id==='hall').parentId,'greyfen');
  const before=movePage(s,'hall','docks','before');
  const kids=before.entries.filter(e=>e.parentId==='fens').sort((a,b)=>a.order-b.order).map(e=>e.id);
  assert.deepEqual(kids,['greyfen','hall','docks']);
  assert.equal(movePage(s,'fens','greyfen','inside'),null);
  assert.match(dropProblem(s,'fens','greyfen','inside'),/itself/);
  assert.match(dropProblem(s,'fens','demo-sessions','inside'),/Shared lore/);
  assert.equal(workspaceSchema.safeParse(before).success,true);
});

test('link suggestions rank by name and say where each page is', () => {
  const s=world([page('fens','The Fens'),page('greyfen','Greyfen','fens'),page('lantern','The Sunken Lantern','greyfen')]);
  const from=s.entries.find(e=>e.id==='demo-first');
  const found=linkSuggestions(s,from,'sunk');
  assert.equal(found[0].entry.id,'lantern');
  assert.deepEqual(found[0].path,['The Fens','Greyfen']);
  assert.equal(linkSuggestions(s,from,'grey')[0].entry.title,'Greyfen');
  assert.ok(!linkSuggestions(s,from,'').some(x=>x.entry.id==='demo-first'));
  assert.equal(linkText({id:'x',title:'A [b]'}),'[[x|A b]]');
});

test('mentions show nearby words; unlinked names can be linked in one go', () => {
  const s=world([page('greyfen','Greyfen'),page('bell','The Drowned Bell',null,'In 1102 the bell was heard as far as [[greyfen|Greyfen]] on new-moon nights.'),
    page('salt','Salt in the Wound',null,'They fled to greyfen before dawn. Greyfen again.'),page('code','Code',null,'Use `Greyfen` and [[greyfen|Greyfen]].'),page('lore','Eel lore',null,'',null,'lore')]);
  s.entries.find(e=>e.id==='lore').tabs=[{id:'t1',title:'Notes',body:'Eels love Greyfen.',visibility:'gm'}];
  const g=s.entries.find(e=>e.id==='greyfen');
  const m=mentionsOf(s,g);
  assert.deepEqual(m.map(x=>x.entry.id).sort(),['bell','code']);
  const bell=m.find(x=>x.entry.id==='bell');
  assert.equal(bell.label,'Greyfen');assert.match(bell.before,/as far as $/);assert.match(bell.after,/^ on new-moon/);
  assert.deepEqual(unlinkedMentions(s,g).map(e=>e.id),['lore','salt']);
  const linked=linkMentions(s,g,['salt','lore']);
  assert.equal(linked.entries.find(e=>e.id==='salt').body,'They fled to [[greyfen|greyfen]] before dawn. Greyfen again.');
  assert.equal(linked.entries.find(e=>e.id==='lore').tabs[0].body,'Eels love [[greyfen|Greyfen]].');
  assert.deepEqual(unlinkedMentions(linked,g),[]);
  assert.equal(workspaceSchema.safeParse(linked).success,true);
});
