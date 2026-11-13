// A local MCP server for AI apps that only run local (stdio) servers. It forwards every message to the
// hosted RPG Tools MCP endpoint, so it has exactly the same tools.
//   RPG_TOOLS_URL=https://your-site RPG_TOOLS_KEY=rpg_… node scripts/rpg-tools-mcp.mjs
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

export function createBridge({ url, key, fetchImpl = fetch }) {
  const origin = new URL(url);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))))
    throw Error('RPG_TOOLS_URL must be an HTTPS origin, or a local HTTP origin such as http://localhost:5173.');
  if (!/^(rpg|enc|mt)_[a-f0-9]{64}$/.test(key ?? '')) throw Error('Set RPG_TOOLS_KEY to the key from AI connection in the Encyclopedia (it starts with rpg_).');
  const endpoint = new URL('/api/mcp', origin);
  /** Sends one line from the AI app and returns the line to write back, or null for none. */
  return async function forward(line) {
    let id = null;
    try { const parsed = JSON.parse(line); id = Array.isArray(parsed) ? null : parsed?.id ?? null; } catch { return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    let response;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: line });
    } catch { return id === null ? null : JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32002, message: 'Cannot reach RPG Tools. Check RPG_TOOLS_URL and your connection.' } }); }
    if (response.status === 202) return null;
    const text = (await response.text()).replaceAll(key, '[key]');
    try {
      const reply = JSON.parse(text);
      // Errors the endpoint sends before it reads the message (a revoked key, say) carry no id: give them this one.
      if (!response.ok && reply?.error && reply.id === null) return id === null ? null : JSON.stringify({ ...reply, id });
      return text;
    }
    catch { return id === null ? null : JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32003, message: `RPG Tools answered ${response.status} without JSON. Check RPG_TOOLS_URL.` } }); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const forward = createBridge({ url: process.env.RPG_TOOLS_URL ?? 'http://localhost:5173', key: process.env.RPG_TOOLS_KEY });
    let queue = Promise.resolve();
    createInterface({ input: process.stdin }).on('line', line => {
      if (!line.trim()) return;
      // Answers go out in the order the messages came in.
      queue = queue.then(() => forward(line)).then(out => { if (out) process.stdout.write(out + '\n'); }).catch(e => console.error(`RPG Tools MCP: ${e.message}`));
    });
  } catch (e) { console.error(`RPG Tools MCP: ${e.message}`); process.exitCode = 1; }
}
