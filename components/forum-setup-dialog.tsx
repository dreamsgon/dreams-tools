"use client";
import { useState } from "react";
import { Check, Megaphone, MessagesSquare, Smile } from "lucide-react";
import { Modal } from "./campaigns-modal";
import { defaultForumSetup, describeForumSetup, type ForumAccess, type ForumSetup } from "@/lib/forum/setup";

const ACCESS: { value: ForumAccess; label: string }[] = [
  { value: "post", label: "Read and post" },
  { value: "read", label: "Only read" },
  { value: "none", label: "Can't see it" },
];

/**
 * Set up forum: the GM chooses the forum's name, the boards it starts with and who may read and post, then
 * confirms on a summary before anything is made. `onConfirm` makes it; while it runs `busy` is true, and a
 * failure comes back as `error` with the choices kept.
 */
export function ForumSetupDialog({ campaignName, busy, error, close, onConfirm }: { campaignName: string; busy: boolean; error: string; close: () => void; onConfirm: (setup: ForumSetup) => void }) {
  // The name starts filled with the campaign's (a real value, not a grey placeholder); kept as is, it is stored empty so it follows a rename.
  const [setup, setSetup] = useState<ForumSetup>(() => ({ ...defaultForumSetup(), title: campaignName.slice(0, 80) })), [review, setReview] = useState(false);
  const chosen = (): ForumSetup => ({ ...setup, title: setup.title.trim() === campaignName.trim() ? "" : setup.title });
  const set = <K extends keyof ForumSetup>(k: K, v: ForumSetup[K]) => setSetup(s => ({ ...s, [k]: v }));
  const errorLine = error && <p className="campaigns-error" role="alert">{error}</p>;

  if (review) return <Modal title="Confirm the forum" intro="Here is how the forum will start. You can change all of it later in the forum's settings and on Members." close={busy ? () => {} : close} footer={<>
    <button type="button" className="campaigns-secondary" disabled={busy} onClick={() => setReview(false)}>Back</button>
    <button type="button" className="campaigns-primary" disabled={busy} onClick={() => onConfirm(chosen())}><Check size={16} aria-hidden="true" />{busy ? "Setting up…" : "Set up forum"}</button>
  </>}>
    <ul className="forum-setup-summary">{describeForumSetup(chosen(), campaignName).map(line => <li key={line}>{line}</li>)}</ul>
    {errorLine}
  </Modal>;

  return <Modal title="Set up the forum" intro="A roleplay forum for this campaign: boards for its places, and out-of-character boards to talk as yourselves. Choose how it starts, then confirm." close={close} footer={<>
    <button type="button" className="campaigns-secondary" onClick={close}>Cancel</button>
    <button type="submit" form="forum-setup" className="campaigns-primary">Review</button>
  </>}>
    <form id="forum-setup" className="campaigns-form" onSubmit={e => { e.preventDefault(); setReview(true); }}>
      <label>Name<input autoFocus value={setup.title} maxLength={80} placeholder={campaignName} onChange={e => set("title", e.target.value)} /><small>Shown in the forum&apos;s banner. Keep the campaign&apos;s name, or write another.</small></label>
      <label>Tagline<input value={setup.tagline} maxLength={160} placeholder="e.g. Tales from the Lantern Coast" onChange={e => set("tagline", e.target.value)} /></label>
      <label className="campaigns-check"><input type="checkbox" checked={setup.banner} onChange={e => set("banner", e.target.checked)} /><span><strong>Banner picture</strong> show the campaign&apos;s banner behind the name</span></label>
      <label>New posts start in<select value={setup.markup} onChange={e => set("markup", e.target.value as ForumSetup["markup"])}>
        <option value="markdown">Markdown</option>
        <option value="bbcode">BBCode</option>
      </select><small>Each poster can switch a post to the other when they write.</small></label>
      <fieldset>
        <legend>Boards to start with</legend>
        <label className="campaigns-check"><input type="checkbox" checked={setup.announcements} onChange={e => set("announcements", e.target.checked)} /><Megaphone size={16} aria-hidden="true" /><span><strong>Announcements</strong> news and rules; only moderators start topics</span></label>
        <label className="campaigns-check"><input type="checkbox" checked={setup.chat} onChange={e => set("chat", e.target.checked)} /><MessagesSquare size={16} aria-hidden="true" /><span><strong>General chat</strong> plans, questions and anything else</span></label>
        <label className="campaigns-check"><input type="checkbox" checked={setup.introductions} onChange={e => set("introductions", e.target.checked)} /><Smile size={16} aria-hidden="true" /><span><strong>Introductions</strong> say hello and introduce a character</span></label>
        <small>In-character boards go in a Locations category. Add one for each place from the forum or a place&apos;s page.</small>
      </fieldset>
      <fieldset>
        <legend>Who can do what</legend>
        <label>Players<select value={setup.players} onChange={e => set("players", e.target.value as ForumAccess)}>{ACCESS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></label>
        <label className="campaigns-check"><input type="checkbox" checked={setup.players === "post" && setup.pictures} disabled={setup.players !== "post"} onChange={e => set("pictures", e.target.checked)} /><span><strong>Pictures</strong> players may add pictures to posts</span></label>
        <label>Guests<select value={setup.guests} onChange={e => set("guests", e.target.value as ForumAccess)}>{ACCESS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></label>
        <label className="campaigns-check"><input type="checkbox" checked={setup.cogms} onChange={e => set("cogms", e.target.checked)} /><span><strong>Co-GMs moderate</strong> and arrange the boards with you</span></label>
        <small>These set the Players, Guests and Co-GMs groups&apos; forum permissions. Fine-tune them, or per board, later.</small>
      </fieldset>
    </form>
  </Modal>;
}
