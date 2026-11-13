"use client";
/*
 * Connections › Discord: the campaign's channels (one webhook each), what goes to which channel, and the
 * name posts go out under. Webhook URLs never come back to the browser; only names and whether each works.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { postKinds, postKindNames, type PostKind, type PublicDiscord } from "@/lib/discord/settings";
import { confirmDialog } from "./confirm-dialog";
import "./discord-connections.css";

type Status = Record<string, "ok" | "deleted" | "unknown">;
type Loaded = PublicDiscord & { status: Status };
const json = { "Content-Type": "application/json" };

export default function DiscordConnections({ campaignId, campaignName, onChanged }: {
  campaignId: string | null; campaignName: string | null; onChanged: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null), [paste, setPaste] = useState(""), [busy, setBusy] = useState(""),
    [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null), [postAs, setPostAs] = useState(""),
    [message, setMessage] = useState(""), [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!campaignId) return; // The dialog gives each campaign its own copy (key), so nothing carries over.
    const url = `/api/settings?campaignId=${encodeURIComponent(campaignId)}`;
    // Show the saved channels at once, then look each webhook up in Discord.
    api<{ discord: Loaded }>(url).then(r => { if (active) { setData(r.discord); setPostAs(r.discord.postAs); } }).catch(e => { if (active) setError(e.message); });
    api<{ discord: Loaded }>(url + "&check=1").then(r => { if (active) setData(d => d ? { ...d, channels: r.discord.channels, status: r.discord.status } : r.discord); }).catch(() => {});
    return () => { active = false; };
  }, [campaignId]);

  const change = async (what: string, edit: Record<string, unknown>, done?: string) => {
    if (!campaignId) return false;
    setBusy(what); setError(""); setMessage("");
    try {
      const r = await api<{ discord: PublicDiscord }>("/api/settings", { method: "PUT", headers: json, body: JSON.stringify({ campaignId, ...edit }) });
      setData(d => ({ ...r.discord, status: d?.status ?? {} }));
      if (done) setMessage(done);
      onChanged();
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(""); }
  };

  const add = async () => {
    const url = paste.trim();
    if (!url) return;
    if (await change("add", { action: "addChannel", url }, "Channel added. Send a test to check it.")) {
      setPaste("");
      // The new webhook was just looked up: it has its Discord name when that worked.
      setData(d => { const c = d?.channels.at(-1); return d && c ? { ...d, status: { ...d.status, [c.id]: c.hookName ? "ok" : "unknown" } } : d; });
    }
  };
  const test = async (id: string, name: string) => {
    if (!campaignId) return;
    setBusy("test:" + id); setError(""); setMessage("");
    try {
      await api("/api/discord/test", { method: "POST", headers: json, body: JSON.stringify({ campaignId, channelId: id }) });
      setMessage(`Test sent to ${name}. Check that channel in Discord.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };
  const remove = async (id: string, name: string) => {
    if (!await confirmDialog({ title: `Remove ${name}?`, message: "Posts that went there will go to the main channel. The webhook itself stays in Discord.", confirm: "Remove channel", danger: true })) return;
    await change("remove:" + id, { action: "removeChannel", id }, `${name} removed.`);
  };
  const rename = async () => {
    if (!renaming) return;
    if (await change("rename:" + renaming.id, { action: "renameChannel", id: renaming.id, name: renaming.name })) setRenaming(null);
  };

  if (!campaignId) return <section className="discord-connections"><h3>Discord</h3><p className="muted">Open a campaign to set up its Discord channels.</p></section>;
  const channels = data?.channels ?? [];
  const label = (id: string | null) => id === "off" ? "Don’t post" : channels.find(c => c.id === id)?.name ?? "Main channel";

  return (
    <section className="discord-connections" aria-busy={!data}>
      <h3>Discord</h3>
      <p className="muted">
        Add a webhook for each channel you post to, then choose where each kind of post goes.
        {campaignName ? <> These channels are only used by <strong>{campaignName}</strong>.</> : null}{" "}
        Nothing is posted until you press a Discord button, unless you turn on Always in the dice tray.
      </p>

      <h4>Channels</h4>
      {!data && !error && <p className="muted">Loading…</p>}
      {data && !channels.length && <p className="muted">No channels yet. Paste a webhook below to add the first one.</p>}
      <ul className="discord-channels">
        {channels.map(c => {
          const state = data?.status[c.id];
          return (
            <li key={c.id}>
              <span className="discord-hash" aria-hidden>#</span>
              <div className="discord-channel-text">
                {renaming?.id === c.id ? (
                  <form className="discord-rename" onSubmit={e => { e.preventDefault(); void rename(); }}>
                    <input aria-label="Channel name" autoFocus maxLength={80} value={renaming.name} onChange={e => setRenaming({ id: c.id, name: e.target.value })} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} />
                    <button type="submit" disabled={!!busy || !renaming.name.trim()}>Save</button>
                    <button type="button" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <strong>{c.name}{data?.main === c.id && <span className="discord-main">Main channel</span>}</strong>
                )}
                <span className={`discord-state ${state ?? "checking"}`}>
                  {state === "ok" ? <>Working{c.hookName ? ` · webhook “${c.hookName}”` : ""}</>
                    : state === "deleted" ? "Deleted in Discord. Paste a new webhook."
                    : state === "unknown" ? "Couldn’t reach Discord to check it."
                    : "Checking…"}
                  {c.thread && " · posts in a thread"}
                </span>
              </div>
              {renaming?.id !== c.id && (
                <div className="discord-channel-actions">
                  <button type="button" disabled={!!busy || state === "deleted"} onClick={() => void test(c.id, c.name)}>{busy === "test:" + c.id ? "Sending…" : "Send a test"}</button>
                  {data?.main !== c.id && <button type="button" className="quiet" disabled={!!busy} onClick={() => void change("main:" + c.id, { action: "setMain", id: c.id }, `${c.name} is now the main channel.`)}>Make main</button>}
                  <button type="button" className="quiet" disabled={!!busy} onClick={() => setRenaming({ id: c.id, name: c.name })}>Rename</button>
                  <button type="button" className="quiet" disabled={!!busy} onClick={() => void remove(c.id, c.name)}>Remove</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form className="discord-add" onSubmit={e => { e.preventDefault(); void add(); }}>
        <input type="password" autoComplete="off" aria-label="Webhook URL" placeholder="Paste a webhook URL to add a channel" value={paste} disabled={!data || !!busy} onChange={e => setPaste(e.target.value)} />
        <button type="submit" disabled={!data || !!busy || !paste.trim()}>{busy === "add" ? "Checking…" : "+ Add channel"}</button>
      </form>
      <p className="muted small">Discord › Channel settings › Integrations › Webhooks › Copy Webhook URL. Links from the Discord app, PTB or Canary, and links to a thread or forum post work too. The URL stays on the server.</p>

      {data && channels.length > 0 && <>
        <h4>What goes where</h4>
        <ul className="discord-routes">
          {postKinds.map((kind: PostKind) => {
            const to = data.routes[kind];
            return (
              <li key={kind}>
                <div>
                  <span>{postKindNames[kind].name}</span>
                  {kind === "initiative"
                    ? <small>To keep one message up to date, turn that on in each scene’s Initiative panel</small>
                    : postKindNames[kind].hint && <small>{postKindNames[kind].hint}</small>}
                </div>
                <select aria-label={`Where ${postKindNames[kind].name.toLowerCase()} go`} disabled={!!busy}
                  value={to === "off" ? "off" : to ?? ""}
                  onChange={e => void change("route:" + kind, { action: "setRoute", kind, to: e.target.value || "main" })}>
                  <option value="">Main channel ({label(data.main)})</option>
                  {channels.filter(c => c.id !== data.main).map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                  <option value="off">Don’t post</option>
                </select>
              </li>
            );
          })}
        </ul>

        <h4>Post as</h4>
        <form className="discord-post-as" onSubmit={e => { e.preventDefault(); void change("postAs", { action: "postAs", name: postAs }, postAs.trim() ? `Posts will show as “${postAs.trim()}”.` : "Posts will show the campaign name."); }}>
          <input aria-label="Post as" maxLength={80} placeholder={campaignName ?? "Campaign name"} value={postAs} disabled={!!busy} onChange={e => setPostAs(e.target.value)} />
          <button type="submit" disabled={!!busy || postAs.trim() === data.postAs}>Save</button>
        </form>
        <p className="muted small">The name on every post. Leave it empty to use the campaign name. Rolls from a token show that token’s picture.</p>
      </>}

      {message && <p role="status" className="success">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
