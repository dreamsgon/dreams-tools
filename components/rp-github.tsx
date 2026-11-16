"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ExternalLink, TriangleAlert } from "lucide-react";
import { githubSchema } from "@/lib/encyclopedia/world-model";
import type { RpFile } from "@/lib/encyclopedia/rp-export";
import { checkBranch, checkRepo, GithubError, parseRepo, preparePush, pushFiles, validKey, type FetchLike, type Prepared, type PushResult } from "@/lib/github-push";
import { forgetKey, saveKey } from "@/lib/github-key";

/* On a phone the sheet scrolls, so bring a new error into view. */
const showAlert = (el: HTMLElement | null) => { el?.scrollIntoView({ block: "center", behavior: "smooth" }); };

/** The browser's fetch, wrapped so it is not called as a method of another object. The key only ever goes to api.github.com (see lib/github-push.ts). */
export const githubFetch: FetchLike = (url, init) => fetch(url, init);
const message = (e: unknown, fallback: string) => e instanceof GithubError || e instanceof Error ? e.message : fallback;
export const TOKEN_PAGE = "https://github.com/settings/personal-access-tokens/new";

/** The "Connect a repository" screen: repository, branch and key. Nothing is saved until GitHub says the key can read and write. */
export function ConnectView({ initialRepo, initialBranch, tokenFor, saveConfig, onToken, onForget, onContinue, onBack, continueLabel }: {
  initialRepo: string; initialBranch: string; tokenFor: (repo: string) => string | null;
  saveConfig: (github: { repository: string; branch: string }) => Promise<string | null>;
  onToken: (repo: string, token: string) => void; onForget: (repo: string) => void; onContinue: () => void; onBack: () => void; continueLabel: string;
}) {
  const [repoText, setRepoText] = useState(initialRepo), [branch, setBranch] = useState(initialBranch || "main"), [key, setKey] = useState("");
  const [state, setState] = useState<{ step: "idle" } | { step: "checking" } | { step: "error"; text: string } | { step: "ok"; repo: string; kept: boolean; isPrivate: boolean } | { step: "forgot" }>({ step: "idle" });
  const parsed = parseRepo(repoText), saved = parsed ? tokenFor(parsed) : null;
  const busy = state.step === "checking";

  async function check() {
    const repo = parseRepo(repoText), fail = (text: string) => setState({ step: "error", text });
    if (!repo) return fail("Write the repository as owner/repository, for example ayla/salt-road.");
    const parsedBranch = githubSchema.shape.branch.safeParse(branch.trim());
    if (!parsedBranch.success) return fail("Branch names here can use letters, numbers, dashes, underscores and slashes.");
    const token = key.trim() || tokenFor(repo);
    if (!token) return fail("Paste a GitHub key first. The steps are above.");
    if (!validKey(token)) return fail("That does not look like a GitHub key. Paste the whole key, starting with github_pat_.");
    setState({ step: "checking" });
    try {
      const info = await checkRepo(token, repo, githubFetch);
      const found = await checkBranch(token, repo, parsedBranch.data, githubFetch);
      if (found === "missing") return fail(`The branch “${parsedBranch.data}” does not exist in ${info.fullName}. Create it on GitHub or use the branch it has. RPG Tools does not create branches.`);
      if (found === "empty" && info.defaultBranch !== parsedBranch.data) return fail(`${info.fullName} is empty, so GitHub can only start it on its default branch, ${info.defaultBranch}. Use that branch name.`);
      const wrote = await saveConfig({ repository: repo, branch: parsedBranch.data });
      if (wrote) return fail(wrote);
      const kept = key.trim() ? saveKey(repo, token) : true;
      onToken(repo, token); setKey("");
      setState({ step: "ok", repo: info.fullName, kept, isPrivate: info.isPrivate });
    } catch (e) { fail(message(e, "Could not check the repository.")); }
  }
  function forget() { const repo = parsed ?? parseRepo(initialRepo); if (!repo) return; forgetKey(repo); onForget(repo); setKey(""); setState({ step: "forgot" }); }

  return <div className="rpb-panel">
    <div className="rpb-subhead"><button type="button" className="rpb-back" onClick={onBack} disabled={busy} aria-label="Back"><ChevronLeft size={18} aria-hidden="true" /></button><h3>Connect a repository</h3></div>
    <form className="rpb-panel" onSubmit={e => { e.preventDefault(); void check(); }} autoComplete="off">
      <label className="rpb-field">Repository<input value={repoText} onChange={e => { setRepoText(e.target.value); setState({ step: "idle" }); }} placeholder="your-name/salt-road" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={200} disabled={busy} /></label>
      <label className="rpb-field">Branch<input value={branch} onChange={e => { setBranch(e.target.value); setState({ step: "idle" }); }} placeholder="main" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={100} disabled={busy} /></label>
      <label className="rpb-field">GitHub key (fine-grained token)<input type="password" value={key} onChange={e => { setKey(e.target.value); setState({ step: "idle" }); }} placeholder={saved ? "A key is saved on this device. Paste to replace it." : "github_pat_…"} autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={400} disabled={busy} /></label>
      <ol className="rpb-steps">
        <li>On GitHub, <a href={TOKEN_PAGE} target="_blank" rel="noopener">make a fine-grained key<ExternalLink size={12} aria-hidden="true" /></a> (Settings › Developer settings › Fine-grained tokens).</li>
        <li>Repository access: <b>Only select repositories</b> › {parsed ? parsed.split("/")[1] : "your repository"}. A private repository works too.</li>
        <li>Permissions: <b>Contents › Read and write</b>. Nothing else.</li>
        <li>Paste the key above.</li>
      </ol>
      <p className="rpb-note">Saved on this device only. RPG Tools&apos; server never receives it.</p>
      {state.step === "ok" ? <>
        <p className="rpb-ok" role="status"><Check size={15} aria-hidden="true" />Can read and write {state.repo}{state.isPrivate ? " (private)" : ""}</p>
        {!state.kept && <p className="rpb-muted">This browser would not keep the key, so you will paste it again next time.</p>}
        <button type="button" className="rpb-primary" onClick={onContinue}>{continueLabel}</button>
      </> : <button type="submit" className="rpb-primary" disabled={busy}>{busy ? "Checking…" : "Check and save"}</button>}
      {state.step === "error" && <p className="rpb-alert" role="alert" ref={showAlert}><TriangleAlert size={16} aria-hidden="true" />{state.text}</p>}
      {state.step === "forgot" && <p className="rpb-muted" role="status">The key was removed from this device.</p>}
      {(saved || state.step === "ok") && state.step !== "forgot" && <button type="button" className="rpb-link" onClick={forget} disabled={busy}>Forget key on this device</button>}
    </form>
  </div>;
}

type PushState =
  | { step: "loading" }
  | { step: "error"; text: string; code?: string }
  | { step: "review"; prep: Prepared }
  | { step: "pushing"; prep: Prepared; progress: string }
  | { step: "failed"; prep: Prepared; text: string; code?: string }
  | { step: "done"; prep: Prepared; result: PushResult };

const TAG = { new: "New", edit: "Edit", removed: "Removed" } as const;
const SKIP_WORD = { edited: "edited", unowned: "not made here", template: "template" } as const;

/** A list that shows its first few rows and then "and N more", which opens the rest. */
function Rows({ rows, extra, label }: { rows: { key: string; tag?: keyof typeof TAG; path: string; note?: string }[]; extra?: string; label: string }) {
  const [all, setAll] = useState(false), shown = all ? rows : rows.slice(0, 4), more = rows.length - 4;
  return <div className="rpb-changes">
    <ul aria-label={label} className={all ? "rpb-scroll" : undefined}>
      {shown.map(r => <li key={r.key}>{r.tag && <span className={`rpb-tag rpb-tag-${r.tag}`}>{TAG[r.tag]}</span>}<span className="rpb-path">{r.path}</span>{r.note && <small>{r.note}</small>}</li>)}
    </ul>
    {(more > 0 || extra) && (more > 0 ? <button type="button" className="rpb-link rpb-more" aria-expanded={all} onClick={() => setAll(v => !v)}>{all ? "Show fewer" : `and ${more} more`}{extra ? ` · ${extra}` : ""}</button> : <span className="rpb-more rpb-muted">{extra}</span>)}
  </div>;
}

/** Compares the campaign with the branch, shows what a push would change, and pushes one commit. */
export function PushView({ repo, branch, token, includeGm, build, defaultMessage, onBack, onChangeKey, onPushed, onBusy }: {
  repo: string; branch: string; token: string; includeGm: boolean; build: (exportLog: string | undefined) => RpFile[]; defaultMessage: string;
  onBack: () => void; onChangeKey: () => void; onPushed: (result: PushResult) => void; onBusy: (busy: boolean) => void;
}) {
  const [state, setState] = useState<PushState>({ step: "loading" }), [msg, setMsg] = useState(defaultMessage);
  const alive = useRef(true), buildRef = useRef(build);
  useEffect(() => { buildRef.current = build; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const busyRef = useRef(onBusy);
  useEffect(() => { busyRef.current = onBusy; });
  const pushing = state.step === "pushing";
  useEffect(() => { busyRef.current(pushing); return () => busyRef.current(false); }, [pushing]);

  const [run, setRun] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try { const prep = await preparePush(token, repo, branch, includeGm, log => buildRef.current(log), githubFetch); if (live) setState({ step: "review", prep }); }
      catch (e) { if (live) setState({ step: "error", text: message(e, "Could not read the repository."), code: e instanceof GithubError ? e.code : undefined }); }
    })();
    return () => { live = false; };
  }, [token, repo, branch, includeGm, run]);
  function again() { setState({ step: "loading" }); setRun(n => n + 1); }

  async function push(prep: Prepared) {
    setState({ step: "pushing", prep, progress: "Starting…" });
    try {
      const result = await pushFiles(token, prep, msg, githubFetch, progress => { if (alive.current) setState({ step: "pushing", prep, progress }); });
      onPushed(result);
      if (alive.current) setState({ step: "done", prep, result });
    } catch (e) { if (alive.current) setState({ step: "failed", prep, text: message(e, "The push failed."), code: e instanceof GithubError ? e.code : undefined }); }
  }

  const prep = state.step === "review" || state.step === "pushing" || state.step === "failed" || state.step === "done" ? state.prep : null;
  const busy = state.step === "pushing" || state.step === "loading";
  const count = prep ? prep.changes.length + prep.removals.length : 0;
  const rows = prep ? [
    ...prep.changes.map(c => ({ key: "c" + c.path, tag: c.kind as keyof typeof TAG, path: c.path })),
    ...prep.removals.map(r => ({ key: "r" + r.path, tag: "removed" as const, path: r.path, note: r.reason === "gm" ? "GM file" : undefined })),
  ] : [];
  const gmRemoved = prep?.removals.some(r => r.reason === "gm");
  const keyProblem = (code?: string) => code === "bad-key" || code === "no-access" || code === "read-only";
  return <div className="rpb-panel">
    <div className="rpb-subhead"><button type="button" className="rpb-back" onClick={onBack} disabled={state.step === "pushing"} aria-label="Back to export"><ChevronLeft size={18} aria-hidden="true" /></button><h3>{state.step === "done" ? "Pushed to GitHub" : prep && !prep.nothingToPush ? `Push ${count} changed file${count === 1 ? "" : "s"}` : "Push to GitHub"}</h3></div>
    <p className="rpb-muted">{repo} · Branch {branch}</p>
    {state.step === "loading" && <p className="rpb-muted" role="status">Comparing with {repo}…</p>}
    {state.step === "error" && <>
      <p className="rpb-alert" role="alert" ref={showAlert}><TriangleAlert size={16} aria-hidden="true" />{state.text}</p>
      {keyProblem(state.code) ? <button type="button" className="rpb-primary" onClick={onChangeKey}>Change the key</button> : <button type="button" className="rpb-secondary" onClick={again}>Try again</button>}
    </>}
    {prep && prep.nothingToPush && state.step === "review" && <div className="rpb-card" role="status"><b><Check size={16} aria-hidden="true" />Already up to date</b><span>{repo} already has everything from this campaign. Nothing to push.</span></div>}
    {prep && !prep.nothingToPush && <>
      <Rows rows={rows} extra={`${prep.unchanged} unchanged`} label="Files in this push" />
      {prep.skipped.length > 0 && <div className="rpb-card rpb-skipped"><b>{prep.skipped.length} file{prep.skipped.length === 1 ? "" : "s"} left as is</b><span>Edited in the repo, left as is. RPG Tools never overwrites a file you or an AI GM changed there.</span>
        <Rows rows={prep.skipped.map(s => ({ key: "s" + s.path, path: s.path, note: SKIP_WORD[s.reason] }))} label="Files left as they are" /></div>}
      {gmRemoved && <p className="rpb-muted">Player-safe push: the GM-only files are removed from {branch}. They stay in the repository&apos;s Git history.</p>}
      {includeGm && state.step !== "done" && <p className="rpb-muted">This push includes the GM-only folder. Keep the repository private.</p>}
      {prep.truncated && <p className="rpb-muted">This repository is very large, so only the RP folders were read.</p>}
      {state.step !== "done" && <label className="rpb-field">Commit message<input value={msg} onChange={e => setMsg(e.target.value)} maxLength={200} disabled={busy} /></label>}
      {state.step !== "done" && <button type="button" className="rpb-primary" disabled={busy || !msg.trim()} onClick={() => void push(prep)}>{state.step === "pushing" ? state.progress : `Push ${prep.head ? "1 commit" : "2 commits"} to ${branch}`}</button>}
      {state.step === "pushing" && <p className="rpb-muted" role="status">Keep this open until it finishes.</p>}
      {state.step === "failed" && <>
        <p className="rpb-alert" role="alert" ref={showAlert}><TriangleAlert size={16} aria-hidden="true" />{state.text}</p>
        {state.code === "moved" ? <button type="button" className="rpb-secondary" onClick={again}>Review again</button> : keyProblem(state.code) && <button type="button" className="rpb-secondary" onClick={onChangeKey}>Change the key</button>}
      </>}
      {state.step === "done" && <p className="rpb-ok rpb-pushed" role="status"><Check size={15} aria-hidden="true" /><span>Pushed · {state.result.files} file{state.result.files === 1 ? "" : "s"} in {state.result.commits} commit{state.result.commits === 1 ? "" : "s"} · <a href={state.result.url} target="_blank" rel="noopener">View on GitHub<ExternalLink size={12} aria-hidden="true" /></a></span></p>}
    </>}
    {(state.step === "done" || (prep?.nothingToPush && state.step === "review")) && <button type="button" className="rpb-secondary" onClick={onBack}>Back to export</button>}
  </div>;
}

