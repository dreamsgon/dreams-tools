"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ExternalLink, GitBranch as Github, TriangleAlert } from "lucide-react";
import { githubSchema } from "@/lib/encyclopedia/world-model";
import type { RpFile } from "@/lib/encyclopedia/rp-export";
import { checkBranch, cleanFolder, findAccess, GithubError, parseRepoLink, preparePush, pushFiles, validKey, type FetchLike, type Prepared, type PushResult } from "@/lib/github-push";
import { forgetAccountKey, forgetKey, forgetSignIn, keysFor, readSignIn, saveAccountKey, saveKey } from "@/lib/github-key";
import { addRepoUrl, freshSignIn, openGithubWindow, signInOn } from "@/lib/github-signin";

/* On a phone the sheet scrolls, so bring a new error into view. */
const showAlert = (el: HTMLElement | null) => { el?.scrollIntoView({ block: "center", behavior: "smooth" }); };

/** The browser's fetch, wrapped so it is not called as a method of another object. The key only ever goes to api.github.com (see lib/github-push.ts). */
export const githubFetch: FetchLike = (url, init) => fetch(url, init);
const message = (e: unknown, fallback: string) => e instanceof GithubError || e instanceof Error ? e.message : fallback;
export const TOKEN_PAGE = "https://github.com/settings/personal-access-tokens/new", TOKENS_PAGE = "https://github.com/settings/personal-access-tokens";

/**
 * The "Connect a repository" screen. Paste a link (or owner/repository) and press Connect: every key saved on this device, and the
 * "Sign in with GitHub" key, is tried in turn, and the branch is the repository's default unless the link or Advanced names another.
 * A key is asked for only when none of those can write to the repository. Nothing is saved until GitHub says a key can read and write.
 */
export function ConnectView({ initialRepo, initialBranch, initialFolder = "", tokenFor, saveConfig, onToken, onForget, onContinue, onBack, continueLabel, autoCheck = false }: {
  initialRepo: string; initialBranch: string; initialFolder?: string; tokenFor: (repo: string) => string | null;
  saveConfig: (github: { repository: string; branch: string; folder?: string }) => Promise<string | null>;
  onToken: (repo: string, token: string) => void; onForget: (repo: string) => void; onContinue: () => void; onBack: () => void; continueLabel: string;
  /** Connect straight away (the repository is already set and a key may be saved). */
  autoCheck?: boolean;
}) {
  // A campaign that already has a repository keeps its branch; a new one uses the repository's default branch unless one is typed.
  const [repoText, setRepoText] = useState(initialRepo), [branch, setBranch] = useState(initialRepo ? initialBranch : ""), [folderText, setFolderText] = useState(initialFolder), [key, setKey] = useState("");
  const [advanced, setAdvanced] = useState(!!initialFolder), [wantKey, setWantKey] = useState(false), [tick, setTick] = useState(0);
  const [state, setState] = useState<{ step: "idle" } | { step: "checking"; text?: string } | { step: "error"; text: string; code?: string } | { step: "ok"; repo: string; branch: string; kept: boolean; isPrivate: boolean; via: "pasted" | "saved" | "signin" } | { step: "forgot" }>({ step: "idle" });
  const link = parseRepoLink(repoText), parsed = link?.repo ?? null;
  void tick;
  const saved = parsed ? tokenFor(parsed) : null, anyKey = keysFor(parsed ?? "").length > 0 || !!saved, signIn = readSignIn();
  // With "Sign in with GitHub" on, someone with no key signs in first; the key steps wait behind a link.
  const signInFirst = signInOn() && !anyKey && !wantKey && !key;
  const showKey = wantKey || !anyKey && !signInOn() || state.step === "error" && (state.code === "no-access" || state.code === "bad-key" || state.code === "read-only");
  const busy = state.step === "checking";
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); if (state.step !== "checking") setState({ step: "idle" }); };

  async function check() {
    const l = parseRepoLink(repoText), fail = (text: string, code?: string) => setState({ step: "error", text, code });
    if (!l) return fail("Paste the repository's link from GitHub, like https://github.com/ayla/salt-road, or write ayla/salt-road.");
    const repo = l.repo, typedBranch = branch.trim() || l.branch || "";
    if (typedBranch && !githubSchema.shape.branch.safeParse(typedBranch).success) return fail("Branch names here can use letters, numbers, dashes, underscores and slashes.");
    const folder = cleanFolder(folderText.trim() ? folderText : l.folder ?? "");
    if (folder === null) return fail("Folder names can use letters, numbers, spaces, dots, dashes and underscores, separated by slashes, like Campaigns/Salt Road.");
    const typed = key.trim();
    if (typed && !validKey(typed)) return fail("That does not look like a GitHub key. Paste the whole key, starting with github_pat_.", "bad-key");
    setState({ step: "checking" });
    await freshSignIn();
    const tokens = [typed, tokenFor(repo) ?? "", ...keysFor(repo)].filter(Boolean);
    if (!tokens.length) return fail(signInOn() ? "Sign in with GitHub, or paste a GitHub key. The steps are below." : "Paste a GitHub key first. The steps are below.", "bad-key");
    try {
      const { token, info } = await findAccess(tokens, repo, githubFetch);
      const useBranch = typedBranch || info.defaultBranch;
      const found = await checkBranch(token, repo, useBranch, githubFetch);
      if (found === "missing") { setAdvanced(true); return fail(`The branch “${useBranch}” does not exist in ${info.fullName}. Its default branch is ${info.defaultBranch}. Clear the branch under Advanced to use that.`); }
      if (found === "empty" && info.defaultBranch !== useBranch) { setAdvanced(true); return fail(`${info.fullName} is empty, so GitHub can only start it on its default branch, ${info.defaultBranch}. Clear the branch under Advanced to use that.`); }
      const wrote = await saveConfig({ repository: repo, branch: useBranch, ...(folder ? { folder } : {}) });
      setFolderText(folder); setBranch(useBranch); setRepoText(repo);
      if (wrote) return fail(wrote);
      const viaSignIn = token === readSignIn()?.token;
      // A pasted key that works is kept for this repository and for every campaign, so the next one connects without pasting.
      const kept = saveKey(repo, token) && (token !== typed || viaSignIn || saveAccountKey(token));
      onToken(repo, token); setKey(""); setWantKey(false);
      setState({ step: "ok", repo: info.fullName, branch: useBranch, kept, isPrivate: info.isPrivate, via: viaSignIn ? "signin" : token === typed ? "pasted" : "saved" });
    } catch (e) {
      const code = e instanceof GithubError ? e.code : undefined;
      fail(message(e, "Could not check the repository."), code);
    }
  }
  const auto = useRef(autoCheck);
  useEffect(() => { if (auto.current && parseRepoLink(initialRepo)) { auto.current = false; void check(); } });
  async function signInWithGithub() {
    setState({ step: "checking", text: "Waiting for GitHub…" });
    const r = await openGithubWindow("/api/github/login");
    setTick(n => n + 1);
    if (!r.ok || !readSignIn()) return setState({ step: "error", text: r.error ?? "GitHub sign-in did not finish." });
    if (parseRepoLink(repoText)) return check();
    setState({ step: "idle" });
  }
  async function addRepo() {
    setState({ step: "checking", text: "Waiting for GitHub…" });
    await openGithubWindow(addRepoUrl());
    return check();
  }
  function forget() {
    const repo = parsed ?? parseRepoLink(initialRepo)?.repo;
    if (repo) { forgetKey(repo); onForget(repo); }
    forgetAccountKey(); forgetSignIn(); setKey(""); setTick(n => n + 1); setState({ step: "forgot" });
  }
  const name = parsed ? parsed.split("/")[1] : "your repository";

  return <div className="rpb-panel">
    <div className="rpb-subhead"><button type="button" className="rpb-back" onClick={onBack} disabled={busy} aria-label="Back"><ChevronLeft size={18} aria-hidden="true" /></button><h3>Connect a repository</h3></div>
    <form className="rpb-panel" onSubmit={e => { e.preventDefault(); void check(); }} autoComplete="off">
      <label className="rpb-field">Repository link<input value={repoText} onChange={e => edit(setRepoText)(e.target.value)} placeholder="https://github.com/your-name/salt-road" inputMode="url" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={300} disabled={busy} /></label>
      {state.step !== "ok" && <p className="rpb-muted">{signIn?.login ? `Signed in to GitHub as ${signIn.login}. ` : anyKey ? "A GitHub key is saved on this device. " : ""}{anyKey ? "Paste the link and press Connect." : signInFirst ? "Copy the link from the repository's page on GitHub, then sign in. RPG Tools asks GitHub which repositories it may use." : "Copy the link from the repository's page on GitHub."}</p>}
      <button type="button" className="rpb-link rpb-advanced" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)} disabled={busy}>{advanced ? "Hide branch and folder" : "Branch and folder (optional)"}</button>
      {advanced && <>
        <label className="rpb-field">Branch<input value={branch} onChange={e => edit(setBranch)(e.target.value)} placeholder="The repository's default branch" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={100} disabled={busy} /></label>
        <label className="rpb-field">Folder<input value={folderText} onChange={e => edit(setFolderText)(e.target.value)} placeholder="Leave empty for the top, or e.g. Campaigns/Salt Road" spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={200} disabled={busy} /></label>
        <p className="rpb-note">With a folder, this campaign is kept inside it, so several campaigns can share one repository. Pushes and reads touch only that folder.</p>
      </>}
      {state.step === "ok" ? <>
        <p className="rpb-ok" role="status"><Check size={15} aria-hidden="true" />Connected to {state.repo}{state.isPrivate ? " (private)" : ""}, branch {state.branch}</p>
        <p className="rpb-muted">{state.via === "signin" ? "Using your GitHub sign-in." : state.via === "saved" ? "Using the GitHub key saved on this device." : "The key is saved on this device for your other campaigns too."}</p>
        {!state.kept && <p className="rpb-muted">This browser would not keep the key, so you will paste it again next time.</p>}
        <button type="button" className="rpb-primary" onClick={onContinue}>{continueLabel}</button>
      </> : signInFirst && !showKey ? <button type="button" className="rpb-primary" onClick={() => void signInWithGithub()} disabled={busy}><Github size={16} aria-hidden="true" />{busy ? state.text ?? "Connecting…" : "Sign in with GitHub"}</button>
        : <button type="submit" className="rpb-primary" disabled={busy}>{busy ? state.text ?? "Connecting…" : "Connect"}</button>}
      {state.step === "error" && <p className="rpb-alert" role="alert" ref={showAlert}><TriangleAlert size={16} aria-hidden="true" />{state.text}</p>}
      {state.step === "error" && state.code === "no-app" && signInOn() && <button type="button" className="rpb-secondary" onClick={() => void addRepo()} disabled={busy}>Add RPG Tools to {name} on GitHub</button>}
      {state.step !== "ok" && signInOn() && !signIn && !(signInFirst && !showKey) && <button type="button" className="rpb-secondary" onClick={() => void signInWithGithub()} disabled={busy}><Github size={16} aria-hidden="true" />Sign in with GitHub</button>}
      {state.step !== "ok" && (showKey ? <>
        <label className="rpb-field">{signInOn() ? "Or paste a GitHub key (fine-grained token)" : "GitHub key (fine-grained token)"}<input type="password" value={key} onChange={e => edit(setKey)(e.target.value)} placeholder="github_pat_…" autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={400} disabled={busy} /></label>
        <ol className="rpb-steps">
          <li>On GitHub, <a href={TOKEN_PAGE} target="_blank" rel="noopener">make a fine-grained key<ExternalLink size={12} aria-hidden="true" /></a>, or <a href={TOKENS_PAGE} target="_blank" rel="noopener">edit the one you have<ExternalLink size={12} aria-hidden="true" /></a>.</li>
          <li>Repository access: <b>All repositories</b>, so one key works for every campaign. Or <b>Only select repositories</b> and include {name}.</li>
          <li>Permissions: <b>Contents › Read and write</b>. Nothing else.</li>
          <li>Paste the key above and press Connect. It is kept for your other campaigns too.</li>
        </ol>
        <p className="rpb-note">Saved on this device only. RPG Tools&apos; server never receives it.</p>
      </> : <button type="button" className="rpb-link" onClick={() => setWantKey(true)} disabled={busy}>{anyKey ? "Use a different GitHub key" : "Use a GitHub key instead"}</button>)}
      {state.step === "forgot" && <p className="rpb-muted" role="status">GitHub keys and sign-in were removed from this device.</p>}
      {(anyKey || state.step === "ok") && state.step !== "forgot" && <button type="button" className="rpb-link" onClick={forget} disabled={busy}>Forget GitHub on this device</button>}
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
export function PushView({ repo, branch, folder = "", token, includeGm, build, defaultMessage, onBack, onChangeKey, onPushed, onBusy }: {
  repo: string; branch: string; folder?: string; token: string; includeGm: boolean; build: (exportLog: string | undefined) => RpFile[]; defaultMessage: string;
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
      try { const prep = await preparePush(token, repo, branch, includeGm, log => buildRef.current(log), githubFetch, folder); if (live) setState({ step: "review", prep }); }
      catch (e) { if (live) setState({ step: "error", text: message(e, "Could not read the repository."), code: e instanceof GithubError ? e.code : undefined }); }
    })();
    return () => { live = false; };
  }, [token, repo, branch, folder, includeGm, run]);
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
    ...prep.removals.map(r => ({ key: "r" + r.path, tag: "removed" as const, path: r.path, note: r.reason === "gm" ? "GM file" : r.reason === "moved" ? "Moved to a file named after its page" : undefined })),
  ] : [];
  const gmRemoved = prep?.removals.some(r => r.reason === "gm");
  const keyProblem = (code?: string) => code === "bad-key" || code === "no-access" || code === "read-only";
  return <div className="rpb-panel">
    <div className="rpb-subhead"><button type="button" className="rpb-back" onClick={onBack} disabled={state.step === "pushing"} aria-label="Back to export"><ChevronLeft size={18} aria-hidden="true" /></button><h3>{state.step === "done" ? "Pushed to GitHub" : prep && !prep.nothingToPush ? `Push ${count} changed file${count === 1 ? "" : "s"}` : "Push to GitHub"}</h3></div>
    <p className="rpb-muted">{repo} · Branch {branch}{folder ? ` · Folder ${folder}` : ""}</p>
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

