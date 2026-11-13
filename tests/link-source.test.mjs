import test from 'node:test';
import assert from 'node:assert/strict';
import {linkTarget,notionText,readLink,LinkError} from '../lib/encyclopedia/link-source.ts';

/** A fake web: each request gets the next reply, and what was asked is recorded. */
function web(replies){
 const sent=[];
 const f=async(url,init={})=>{
  sent.push({url:String(url),method:init.method??'GET',redirect:init.redirect,body:init.body?JSON.parse(init.body):null});
  const next=replies.shift();if(!next)throw Error('No more replies');
  const {status=200,type='text/plain; charset=utf-8',body='',location}=next;
  return new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':type,...(location?{location}:{})}});
 };
 f.sent=sent;return f;
}

test('links become the file behind them, and anything else is refused with what to do',()=>{
 assert.deepEqual(linkTarget('https://docs.google.com/document/d/1AbCdEfGhIjK_lm-no/edit?usp=sharing'),{kind:'drive',url:'https://docs.google.com/document/d/1AbCdEfGhIjK_lm-no/export?format=txt'});
 assert.equal(linkTarget('https://drive.google.com/file/d/1AbCdEfGhIjK/view').url,'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjK');
 assert.equal(linkTarget('https://drive.google.com/open?id=1AbCdEfGhIjK').url,'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjK');
 assert.equal(linkTarget('https://github.com/lantern/coast/blob/main/sessions/session-13.md').url,'https://raw.githubusercontent.com/lantern/coast/main/sessions/session-13.md');
 assert.equal(linkTarget('https://gist.github.com/lantern/0a1b2c3d4e5f').url,'https://gist.githubusercontent.com/lantern/0a1b2c3d4e5f/raw');
 const n=linkTarget('https://www.notion.so/lantern/Session-13-notes-0123456789abcdef0123456789ABCDEF?pvs=4');
 assert.equal(n.kind,'notion');assert.equal(n.notionPage,'01234567-89ab-cdef-0123-456789abcdef');
 assert.equal(linkTarget('https://lantern.notion.site/01234567-89ab-cdef-0123-456789abcdef').notionPage,'01234567-89ab-cdef-0123-456789abcdef');
 const now=linkTarget('https://app.notion.com/p/enigmaticlogs/Claude-Test-4179cb8aeab58005acdaf5c9c6ab8b2b');
 assert.equal(now.notionPage,'4179cb8a-eab5-8005-acda-f5c9c6ab8b2b');assert.equal(now.url,'https://app.notion.com/api/v3/loadPageChunk');
 for(const [bad,why] of [
  ['https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit',/Only Google Docs/],
  ['https://drive.google.com/drive/folders/1AbCdEfGhIjK',/not a folder/],
  ['https://github.com/lantern/coast/tree/main/sessions',/That’s a folder/],
  ['https://github.com/lantern/coast',/Link one file/],
  ['https://www.notion.so/lantern/Session-notes',/no page in it/],
  ['https://example.com/notes.txt',/Google Docs, Google Drive, GitHub and Notion/],
  ['http://raw.githubusercontent.com/a/b/main/x.md',/Google Docs, Google Drive, GitHub and Notion/],
  ['https://raw.githubusercontent.com.evil.example/x',/Google Docs, Google Drive, GitHub and Notion/],
  ['not a link',/whole link/],
 ])assert.throws(()=>linkTarget(bad),e=>e instanceof LinkError&&why.test(e.message),bad);
});

test('a public GitHub file or Google Doc is read as text; a Discord export becomes chat lines',async()=>{
 let f=web([{body:'﻿GM: The ferry bumps against the landing.\r\nMara (Bram): I keep my hand on my sword.'}]);
 const r=await readLink('https://github.com/lantern/coast/blob/main/s13.md',f);
 assert.equal(r.kind,'github');assert.equal(r.text,'GM: The ferry bumps against the landing.\nMara (Bram): I keep my hand on my sword.');
 assert.equal(f.sent[0].redirect,'manual','redirects are checked one by one');
 f=web([{type:'application/json',body:{messages:[{author:{name:'mara',nickname:'Mara (Bram)'},content:'I keep watch.'}]}}]);
 assert.equal((await readLink('https://raw.githubusercontent.com/lantern/coast/main/s13.json',f)).text,'Mara (Bram): I keep watch.');
 f=web([{status:303,location:'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjK&export=download'},{type:'application/octet-stream',body:'GM: Fog.'}]);
 assert.equal((await readLink('https://drive.google.com/file/d/1AbCdEfGhIjK/view',f)).text,'GM: Fog.');
 assert.equal(f.sent[1].url,'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjK&export=download');
});

test('private, odd or wandering links fail with what to do, and nothing outside the allowed hosts is fetched',async()=>{
 const fails=async(link,replies,why)=>{const f=web(replies);await assert.rejects(readLink(link,f),e=>e instanceof LinkError&&why.test(e.message),link);return f;};
 await fails('https://docs.google.com/document/d/1AbCdEfGhIjK/edit',[{status:302,location:'https://accounts.google.com/ServiceLogin?continue=x'}],/isn’t shared publicly.*AI app/);
 const f=await fails('https://docs.google.com/document/d/1AbCdEfGhIjK/edit',[{status:302,location:'https://evil.example/steal'}],/somewhere RPG Tools doesn’t read/);
 assert.equal(f.sent.length,1,'the redirect was not followed');
 await fails('https://github.com/lantern/private/blob/main/s13.md',[{status:404,body:'404: Not Found'}],/isn’t there, or it’s private/);
 await fails('https://drive.google.com/file/d/1AbCdEfGhIjK/view',[{type:'text/html',body:'<html>Sign in</html>'}],/web page instead of the file/);
 await fails('https://raw.githubusercontent.com/a/b/main/map.png',[{type:'image/png',body:'x'}],/isn’t text/);
 await fails('https://raw.githubusercontent.com/a/b/main/empty.md',[{body:'  '}],/no text/);
 await fails('https://raw.githubusercontent.com/a/b/main/big.md',[{body:'x'.repeat(2_000_001)}],/over 2,000,000/);
});

const PAGE='01234567-89ab-cdef-0123-456789abcdef';
const blocks={
 [PAGE]:{value:{id:PAGE,type:'page',properties:{title:[['Session 13 notes']]},content:['h','p1','list','todo','sub','div','q','gone']}},
 h:{value:{value:{id:'h',type:'header',properties:{title:[['The toll at Greyfen']]}}}},
 p1:{value:{id:'p1',type:'text',properties:{title:[['GM: ',[['b']]],['Ostra Hale lifts the toll lantern.']]}}},
 list:{value:{id:'list',type:'bulleted_list',properties:{title:[['Clues']]},content:['li']}},
 li:{value:{id:'li',type:'bulleted_list',properties:{title:[['A sealed jar']]}}},
 todo:{value:{id:'todo',type:'to_do',properties:{title:[['Reach the chapel']],checked:[['Yes']]}}},
 sub:{value:{id:'sub',type:'page',properties:{title:[['NPC list']]},content:['secret']}},
 secret:{value:{id:'secret',type:'text',properties:{title:[['Never read']]}}},
 div:{value:{id:'div',type:'divider'}},
 q:{value:{id:'q',type:'quote',properties:{title:[['Pay the toll first.']]}}},
 gone:{value:{id:'gone',type:'text',alive:false,properties:{title:[['Deleted']]}}},
};

test('a Notion page shared to the web is read in order, with headings and lists, but not its sub-pages',async()=>{
 const t=notionText(PAGE,blocks);
 assert.equal(t.title,'Session 13 notes');
 assert.equal(t.text,['# The toll at Greyfen','GM: Ostra Hale lifts the toll lantern.','- Clues','  - A sealed jar','- [x] Reach the chapel','- NPC list','> Pay the toll first.'].join('\n'));
 const half=Object.fromEntries(Object.entries(blocks).filter(([k])=>!['q'].includes(k)));
 const f=web([{type:'application/json',body:{recordMap:{block:half},cursor:{stack:[[{id:'q'}]]}}},{type:'application/json',body:{recordMap:{block:{q:blocks.q}},cursor:{stack:[]}}}]);
 const r=await readLink(`https://lantern.notion.site/Session-13-notes-${PAGE.replace(/-/g,'')}`,f);
 assert.equal(r.kind,'notion');assert.equal(r.title,'Session 13 notes');assert.match(r.text,/> Pay the toll first\./);
 assert.equal(f.sent[0].url,'https://www.notion.so/api/v3/loadPageChunk');assert.equal(f.sent[0].body.pageId,PAGE);assert.equal(f.sent[1].body.chunkNumber,1);
 // When one of Notion's addresses can't be reached, the other is tried once.
 const so=web([{type:'application/json',body:{recordMap:{block:blocks},cursor:{stack:[]}}}]);
 const flaky=async(url,init)=>{if(String(url).includes('app.notion.com'))throw Error('unreachable');return so(url,init);};
 assert.match((await readLink(`https://app.notion.com/p/team/Notes-${PAGE.replace(/-/g,'')}`,flaky)).text,/# The toll at Greyfen/);
 assert.equal(so.sent[0].url,'https://www.notion.so/api/v3/loadPageChunk');
 const closed=web([{status:400,type:'application/json',body:{errorId:'x',name:'ValidationError'}}]);
 await assert.rejects(readLink(`https://www.notion.so/${PAGE.replace(/-/g,'')}`,closed),/Publish to the web/);
 const empty=web([{type:'application/json',body:{recordMap:{block:{}},cursor:{stack:[]}}}]);
 await assert.rejects(readLink(`https://www.notion.so/${PAGE.replace(/-/g,'')}`,empty),/didn’t share that page, or it’s empty/);
});
