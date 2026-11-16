"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronLeft, TriangleAlert } from "lucide-react";
import { changeCount, choicesFor, defaultChoice, type BringBackPlan, type Choice, type Row, type Selection } from "@/lib/encyclopedia/rp-bring-back";
import { shortDate } from "@/lib/encyclopedia/rp-sheet";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const CHOICE_WORD: Record<Choice, string> = { app: "Keep app's", repo: "Take repo's", both: "Keep both" };
const TAG_CLASS = { New: "rpb-tag-new", Edit: "rpb-tag-edit", Both: "rpb-tag-both" } as const;

/** What a choice does, for the line under the three-way choice. */
const choiceHint = (row: Row, c: Choice) =>
  c === "app" ? "The page stays as it is here." : c === "repo" ? "The repo's text replaces this part of the page." : row.matched ? "The page keeps your text. The repo's text is added as a new GM-only tab." : "The repo's text is added as a new GM-only tab.";

/**
 * The "Bring back changes" list: each change against the page it belongs to, with a checkbox (on by default). Nothing changes until the
 * button is pressed. The selection is kept here; the parent remounts this (by key) when the plan is made again.
 */
export function BringBackView({ plan, repoLabel, notice, busy, onBack, onSubmit }: {
  plan: BringBackPlan; repoLabel: string; notice: { tone: "warn" | "error"; text: string } | null; busy: boolean; onBack: () => void; onSubmit: (sel: Selection) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(plan.rows.filter(r => !r.blocked).map(r => r.key)));
  const [choices, setChoices] = useState<Record<string, Choice>>({}), [show, setShow] = useState(false);
  const showId = useId(), total = changeCount(plan), top = useRef<HTMLDivElement>(null);
  // A new review starts at the top of the sheet, so the heading and any notice are in view.
  useEffect(() => { top.current?.closest<HTMLElement>(".rpb-body")?.scrollTo(0, 0); }, []);
  const pick = (r: Row) => choices[r.key] ?? defaultChoice(r);
  const active = plan.rows.filter(r => checked.has(r.key) && !r.blocked && pick(r) !== "app").length;
  const hasNew = plan.rows.some(r => r.tag === "New");
  const when = plan.since ? shortDate(plan.since) : "";
  const toggle = (key: string) => setChecked(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  return <div className="rpb-panel" ref={top}>
    <div className="rpb-subhead"><button type="button" className="rpb-back" onClick={onBack} disabled={busy} aria-label="Back"><ChevronLeft size={18} aria-hidden="true" /></button><h3>Bring back changes</h3></div>
    <p className="rpb-muted">{repoLabel} · {total === 0 ? "no changes" : plural(total, "change", "changes")}{when ? ` since your push on ${when}` : " since your last push"}</p>
    {notice && <p className={notice.tone === "warn" ? "rpb-note" : "rpb-alert"} role={notice.tone === "warn" ? "status" : "alert"}>{notice.tone === "error" && <TriangleAlert size={16} aria-hidden="true" />}{notice.text}</p>}
    {total === 0 && <div className="rpb-card" role="status"><b><Check size={16} aria-hidden="true" />Nothing to bring back</b><span>The files in the repo match what this campaign wrote at the last push{plan.already.length ? `, or are already in the campaign (${plan.already.length})` : ""}.</span></div>}
    {total > 0 && <ul className="rpb-bb" aria-label="Changes in the repository">
      {plan.rows.map(r => {
        const c = pick(r), id = `${showId}-${r.key.replace(/[^A-Za-z0-9]/g, "_")}`;
        return <li key={r.key}>
          <label className="rpb-bb-main">
            <input type="checkbox" checked={checked.has(r.key) && !r.blocked} disabled={busy || !!r.blocked} onChange={() => toggle(r.key)} />
            <span className="rpb-bb-text">
              <span className="rpb-path">{r.path || "Page"}</span>
              <span className="rpb-bb-maps">{r.maps}{r.tag === "Both" && r.matched ? " · edited here too" : ""}</span>
              {r.note && r.tag !== "Both" && <small>{r.note}</small>}
              {r.blocked && <small>{r.blocked}</small>}
            </span>
            <span className={`rpb-tag ${TAG_CLASS[r.tag]}`}>{r.tag}</span>
          </label>
          {r.tag === "Both" && checked.has(r.key) && !r.blocked && <fieldset className="rpb-three" disabled={busy}>
            <legend className="rpb-sr">What to keep for {r.path}</legend>
            <div role="radiogroup" aria-label={`What to keep for ${r.path}`}>
              {choicesFor(r).map(x => <label key={x} className={c === x ? "rpb-pick rpb-pick-on" : "rpb-pick"}>
                <input type="radio" name={id} value={x} checked={c === x} onChange={() => setChoices(m => ({ ...m, [r.key]: x }))} />{CHOICE_WORD[x]}
              </label>)}
            </div>
            <small>{choiceHint(r, c)}{r.note && r.note !== "Edited here too." ? ` ${r.note}` : ""}</small>
          </fieldset>}
        </li>;
      })}
    </ul>}
    {hasNew && <div className="rpb-row">
      <div><b id={showId}>Show new pages to players</b><small>Off: new pages start GM-only. You can change any page afterwards.</small></div>
      <button type="button" role="switch" aria-checked={show} aria-labelledby={showId} className="rpb-switch" disabled={busy} onClick={() => setShow(v => !v)}><span /></button>
    </div>}
    {plan.removed.length > 0 && <details className="rpb-more-info"><summary>Removed in the repo · page kept ({plan.removed.length})</summary>
      <p className="rpb-muted">These files are gone from the repo. Their pages are still here; nothing is deleted.</p>
      <ul className="rpb-files">{plan.removed.map(p => <li key={p}>{p}</li>)}</ul></details>}
    {plan.kept.length > 0 && <details className="rpb-more-info"><summary>Stays in the repo ({plan.kept.length})</summary>
      <ul className="rpb-files">{plan.kept.map(k => <li key={k.path}>{k.path}<small>{k.reason}</small></li>)}</ul></details>}
    {plan.skipped.length > 0 && <p className="rpb-muted">{plural(plan.skipped.length, "file was", "files were")} not read (too big, or not UTF-8 text): {plan.skipped.slice(0, 3).join(", ")}{plan.skipped.length > 3 ? ", …" : ""}</p>}
    <details className="rpb-more-info"><summary>Rebuilt by the app ({plan.rebuilt.length})</summary>
      <p className="rpb-muted">The app makes these from your campaign every time you push, so they are never brought back.</p>
      <ul className="rpb-files">{plan.rebuilt.map(p => <li key={p}>{p}</li>)}</ul></details>
    {total > 0 && <>
      <button type="button" className="rpb-primary" disabled={busy || active === 0} onClick={() => onSubmit({ checked, choices, show })}>{busy ? "Bringing back…" : active === 0 ? "Nothing picked" : `Bring back ${plural(active, "change", "changes")}`}</button>
      <p className="rpb-muted">Each page keeps its earlier version in Page history. Nothing changes until you press the button.</p>
    </>}
    {total === 0 && <button type="button" className="rpb-secondary" onClick={onBack}>Back</button>}
  </div>;
}
