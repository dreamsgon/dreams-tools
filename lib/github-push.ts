/*
 * A small GitHub client for pushing an RP export to a repository and restoring one, straight from the browser.
 *
 * The key (a fine-grained personal access token) is sent only as an Authorization header to https://api.github.com. Every
 * request is built by `call`, which only ever joins API_BASE with a /repos/... path made from a validated owner/repository, so
 * the key cannot reach another host. The key is never put in a URL, a log line or an error message: every error text goes
 * through `scrub`, and the messages are written by us (GitHub's own words are shown only as a quoted extra, scrubbed).
 *
 * Pure apart from the injected `fetch` (and crypto.subtle for SHA-1), so it runs in Node tests with a fake GitHub.
 */
import { assertSafePath, isLayoutPath, isRewrittenPath, planWrite, sameApartFromOwned, sha256Hex, FOLDERS_LIST, type RpFile } from "./encyclopedia/rp-export.ts";
import { readRestoreCopy, RESTORE_PATH } from "./encyclopedia/rp-zip.ts";
import { classifyZip, exportedAt, type ZipKind } from "./encyclopedia/rp-sheet.ts";
import { decodeText, planRead, type RepoFile } from "./encyclopedia/rp-import.ts";
import { isCandidate, parseFilesMap, type FilesMap } from "./encyclopedia/rp-bring-back.ts";
import { ZIP_MAX_BYTES } from "./zip-read.ts";
import type { Workspace } from "./encyclopedia/world-model.ts";

export const API_BASE = "https://api.github.com";
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type GithubErrorCode = "bad-key" | "no-access" | "read-only" | "rate-limit" | "network" | "no-branch" | "moved" | "protected" | "too-big" | "bad-input" | "failed" | "no-app";
export class GithubError extends Error {
  code: GithubErrorCode;
  constructor(code: GithubErrorCode, message: string) { super(message); this.code = code; this.name = "GithubError"; }
}
/** `dir`: the folder inside the repository the campaign lives in ("" for the top). Paths the functions here take and give are inside it. */
export type Conn = { token: string; repo: string; fetch: FetchLike; dir?: string };

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** "owner/repo", from that or from a pasted github.com address. Null when it is neither. */
export function parseRepo(input: string): string | null {
  const text = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  return REPO_RE.test(text) && !text.split("/").some(p => p === "." || p === "..") ? text : null;
}
/** A pasted repository: "owner/repo", a github.com link (also with /tree/<branch>/<folder>), or a git clone address. */
export type RepoLink = { repo: string; branch?: string; folder?: string };
export function parseRepoLink(input: string): RepoLink | null {
  let text = input.trim().replace(/^git@github\.com:/i, "").replace(/^(git\+)?(https?|ssh|git):\/\/(git@)?/i, "").replace(/^(www\.)?github\.com\//i, "");
  text = text.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const parts = text.split("/");
  // GitHub account names are letters, numbers and dashes, so "gitlab.com/…" or any other host stops here.
  if (parts.length < 2 || !/^[A-Za-z0-9-]{1,39}$/.test(parts[0])) return null;
  const repo = parseRepo(`${parts[0]}/${parts[1].replace(/\.git$/i, "")}`);
  if (!repo) return null;
  if (parts.length === 2) return { repo };
  // github.com/owner/repo/tree/<branch>/<folder…>. A branch with a slash can't be told apart from a folder here, so the first part is the branch.
  if (parts[2] !== "tree" || !parts[3]) return { repo };
  const decode = (p: string) => { try { return decodeURIComponent(p); } catch { return p; } };
  const folder = cleanFolder(parts.slice(4).map(decode).join("/"));
  return { repo, branch: decode(parts[3]), ...(folder ? { folder } : {}) };
}
/** A key is one run of printable ASCII (github_pat_..., ghp_...). Anything else would also break the header. */
export const validKey = (token: string) => /^[\x21-\x7e]{8,400}$/.test(token);
const scrub = (text: string, token: string) => { let out = text; if (token) out = out.split(token).join("***"); return out.replace(/(github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, "***"); };
/**
 * A campaign's folder in its repository, tidied: no leading or trailing slashes, and each part plain letters, numbers, spaces, dots,
 * dashes or underscores. "" is the top of the repository. Null when it can't be used.
 */
export function cleanFolder(input: string): string | null {
  const parts = input.trim().replace(/\\/g, "/").split("/").map(p => p.trim()).filter(Boolean);
  if (parts.length > 10 || parts.some(p => p === "." || p === ".." || p.startsWith(".") || !/^[\w .-]{1,80}$/.test(p))) return null;
  const dir = parts.join("/");
  return dir.length <= 200 ? dir : null;
}
const inDir = (c: Conn, path: string) => c.dir ? `${c.dir}/${path}` : path;
const refPath = (branch: string) => branch.split("/").map(encodeURIComponent).join("/");

// GitHub's JSON is read defensively field by field, so it is typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Reply = { status: number; data: Json; headers: Headers };
/** One API call. Network failures and the usual failures (401, 403, 404, 5xx) become plain GithubErrors; callers handle the rest. */
async function call(c: Conn, method: string, path: string, body?: unknown, accept = "application/vnd.github+json", expect: number[] = []): Promise<Reply> {
  if (!path.startsWith("/repos/") && !path.startsWith("/user/installations")) throw new GithubError("bad-input", "Internal error: unexpected GitHub path.");
  let res: Response;
  const { fetch: send } = c; // called on its own, never as a method: the browser's fetch refuses a foreign `this`
  try {
    res = await send(API_BASE + path, { method, cache: "no-store", headers: { Authorization: `Bearer ${c.token}`, Accept: accept, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { throw new GithubError("network", "Could not reach GitHub. Check your connection and try again."); }
  let data: Json = null;
  try { data = res.status === 204 ? null : await res.json(); } catch { data = null; }
  const reply = { status: res.status, data, headers: res.headers };
  if (res.ok || expect.includes(res.status)) return reply;
  throw explain(c, reply);
}

function explain(c: Conn, r: Reply): GithubError {
  const said = typeof r.data?.message === "string" ? scrub(r.data.message, c.token).slice(0, 200) : "";
  const limited = (r.status === 403 || r.status === 429) && (r.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(said));
  if (limited) {
    const reset = Number(r.headers.get("x-ratelimit-reset")), when = Number.isFinite(reset) && reset > 0 ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.` : " Try again in a few minutes.";
    return new GithubError("rate-limit", `GitHub's request limit was reached.${when}`);
  }
  if (r.status === 401) return new GithubError("bad-key", "GitHub did not accept that key. It may be wrong, expired or revoked. Make a new one and paste it again.");
  if (r.status === 403) return new GithubError("no-access", `GitHub says this key may not do that. Give it Contents: Read and write on ${c.repo} only.${said ? ` GitHub said: “${said}”` : ""}`);
  if (r.status === 404) return new GithubError("no-access", `GitHub can't find ${c.repo}, or this key has no access to it. Check the link. If the repository is private, the key has to include it: on GitHub, edit the key and add ${c.repo.split("/")[1]} under Repository access.`);
  if (r.status === 422) return new GithubError("failed", `GitHub did not accept the request.${said ? ` GitHub said: “${said}”` : ""}`);
  if (r.status >= 500) return new GithubError("failed", `GitHub had a problem (${r.status}). Nothing was lost. Try again in a minute.`);
  return new GithubError("failed", `GitHub answered ${r.status}.${said ? ` GitHub said: “${said}”` : ""}`);
}

/* ---- bytes, base64 and git hashes ---- */
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
/** The git blob id of some bytes: sha1("blob <length>\0" + bytes). */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const head = enc.encode(`blob ${bytes.length}\0`), all = new Uint8Array(head.length + bytes.length);
  all.set(head); all.set(bytes, head.length);
  return hex(await crypto.subtle.digest("SHA-1", all));
}
export const textBlobSha = (text: string) => gitBlobSha(enc.encode(text));
function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
function fromBase64(text: string): Uint8Array {
  const bin = atob(text.replace(/\s+/g, "")), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]); } }));
  return out;
}

/* ---- the repository ---- */
export type RepoInfo = { fullName: string; isPrivate: boolean; defaultBranch: string };
export type BranchState = "found" | "empty" | "missing";
const conn = (token: string, repo: string, fetch: FetchLike, dir = ""): Conn => {
  if (!parseRepo(repo)) throw new GithubError("bad-input", "Use the form owner/repository.");
  const folder = cleanFolder(dir);
  if (folder === null) throw new GithubError("bad-input", "Folder names can use letters, numbers, spaces, dots, dashes and underscores, separated by slashes.");
  if (!validKey(token)) throw new GithubError("bad-key", "That does not look like a GitHub key. Paste the whole key, starting with github_pat_.");
  return { token, repo, fetch, dir: folder };
};

/** Can this key read and write the repository? Errors are plain GithubErrors. */
export async function checkRepo(token: string, repo: string, fetch: FetchLike): Promise<RepoInfo> {
  const c = conn(token, repo, fetch);
  const { data } = await call(c, "GET", `/repos/${repo}`);
  if (!data?.permissions || data.permissions.push !== true) throw new GithubError("read-only", `This key can read ${repo} but not write to it. Make a new key with Contents set to Read and write.`);
  return { fullName: String(data.full_name ?? repo), isPrivate: data.private === true, defaultBranch: String(data.default_branch ?? "main") };
}

/** A "Sign in with GitHub" key (ghu_…) reaches only the repositories the RPG Tools GitHub App was added to. */
export const isAppToken = (token: string) => token.startsWith("ghu_");
/** Has the RPG Tools GitHub App been added to this repository (for the signed-in person)? */
export async function appCanReach(token: string, repo: string, fetch: FetchLike): Promise<boolean> {
  const c = conn(token, repo, fetch), [owner] = repo.toLowerCase().split("/");
  const { data } = await call(c, "GET", "/user/installations?per_page=100");
  for (const inst of Array.isArray(data?.installations) ? data.installations : []) {
    if (String(inst?.account?.login ?? "").toLowerCase() !== owner || typeof inst.id !== "number") continue;
    if (inst.repository_selection === "all") return true;
    for (let page = 1; page <= 10; page++) {
      const list = await call(c, "GET", `/user/installations/${inst.id}/repositories?per_page=100&page=${page}`);
      const repos: Json[] = Array.isArray(list.data?.repositories) ? list.data.repositories : [];
      if (repos.some(r => String(r?.full_name ?? "").toLowerCase() === repo.toLowerCase())) return true;
      if (repos.length < 100) break;
    }
  }
  return false;
}

export type Access = { token: string; info: RepoInfo };
/**
 * Tries each key in turn (a pasted one first, then the saved ones) and gives the first that can read and write the repository.
 * When none can, throws the most useful error: a key GitHub turned down matters less than "can't find it" or "read only".
 */
export async function findAccess(tokens: string[], repo: string, fetch: FetchLike): Promise<Access> {
  const rank: Partial<Record<GithubErrorCode, number>> = { "bad-key": 1, "no-access": 2, "read-only": 3, "rate-limit": 4, network: 4 };
  let best: GithubError | null = null;
  for (const token of [...new Set(tokens.filter(Boolean))]) {
    try {
      const info = await checkRepo(token, repo, fetch);
      if (isAppToken(token) && !(await appCanReach(token, repo, fetch))) throw new GithubError("no-app", `RPG Tools hasn't been added to ${info.fullName} on GitHub yet.`);
      return { token, info };
    } catch (e) {
      const err = e instanceof GithubError ? e : new GithubError("failed", "Could not check the repository.");
      if (err.code === "rate-limit" || err.code === "network") throw err;
      if (!best || (rank[err.code] ?? 5) >= (rank[best.code] ?? 5)) best = err;
    }
  }
  throw best ?? new GithubError("bad-key", "Paste a GitHub key, or sign in with GitHub.");
}

/** Does the branch exist, or is the whole repository empty (no commits, so no branches)? */
export async function checkBranch(token: string, repo: string, branch: string, fetch: FetchLike): Promise<BranchState> {
  const c = conn(token, repo, fetch);
  return (await readHead(c, branch)).state;
}

type Head = { state: "found"; commit: string; tree: string } | { state: "empty" } | { state: "missing" };
async function readHead(c: Conn, branch: string): Promise<Head> {
  const ref = await call(c, "GET", `/repos/${c.repo}/git/ref/heads/${refPath(branch)}`, undefined, undefined, [404, 409]);
  if (ref.status === 409) return { state: "empty" };
  if (ref.status === 404) {
    // An empty repository has no branches at all; a missing branch in a repository that has some is a different problem.
    const list = await call(c, "GET", `/repos/${c.repo}/branches?per_page=1`, undefined, undefined, [409]);
    return list.status === 409 || (Array.isArray(list.data) && list.data.length === 0) ? { state: "empty" } : { state: "missing" };
  }
  const sha = ref.data?.object?.sha;
  if (typeof sha !== "string") throw new GithubError("failed", "GitHub returned a branch without a commit.");
  const commit = await call(c, "GET", `/repos/${c.repo}/git/commits/${sha}`);
  const tree = commit.data?.tree?.sha;
  if (typeof tree !== "string") throw new GithubError("failed", "GitHub returned a commit without a tree.");
  return { state: "found", commit: sha, tree };
}

type TreeItem = { path: string; sha: string; size?: number };
/** The files (blobs) of a tree: one recursive call, or when GitHub cuts it short, a walk of only the RP folders. */
async function readTree(c: Conn, rootSha: string): Promise<{ files: Map<string, TreeItem>; truncated: boolean }> {
  const files = new Map<string, TreeItem>();
  // In a folder: its own tree, one level at a time, so the paths come out inside it. A folder not made yet holds nothing.
  let treeSha = rootSha;
  for (const name of c.dir ? c.dir.split("/") : []) {
    const level = await call(c, "GET", `/repos/${c.repo}/git/trees/${treeSha}`);
    const next = (level.data?.tree ?? []).find((t: { type?: string; path?: string }) => t.type === "tree" && t.path === name);
    if (!next || typeof next.sha !== "string") return { files, truncated: false };
    treeSha = next.sha;
  }
  const whole = await call(c, "GET", `/repos/${c.repo}/git/trees/${treeSha}?recursive=1`);
  if (whole.data?.truncated !== true) {
    for (const t of whole.data?.tree ?? []) if (t.type === "blob" && typeof t.path === "string") files.set(t.path, { path: t.path, sha: t.sha, size: t.size });
    return { files, truncated: false };
  }
  const walk = async (sha: string, prefix: string) => {
    const level = await call(c, "GET", `/repos/${c.repo}/git/trees/${sha}`);
    const dirs: [string, string][] = [];
    for (const t of level.data?.tree ?? []) {
      const path = prefix + t.path;
      if (t.type === "blob") { if (prefix || isLayoutPath(path)) files.set(path, { path, sha: t.sha, size: t.size }); }
      else if (t.type === "tree" && (prefix || FOLDERS_LIST.includes(t.path) || t.path === ".rpg-tools" || t.path === "world-manager")) dirs.push([t.sha, `${path}/`]);
    }
    await pool(dirs, 4, ([s, p]) => walk(s, p));
  };
  await walk(treeSha, "");
  return { files, truncated: true };
}

async function readBlob(c: Conn, item: TreeItem, limit = 5_000_000): Promise<Uint8Array> {
  if ((item.size ?? 0) > limit) throw new GithubError("too-big", `${item.path} is too big to read (${Math.round((item.size ?? 0) / 1024 / 1024)} MB).`);
  const { data } = await call(c, "GET", `/repos/${c.repo}/git/blobs/${item.sha}`);
  if (data?.encoding !== "base64" || typeof data.content !== "string") throw new GithubError("failed", `GitHub returned ${item.path} in a form this app cannot read.`);
  return fromBase64(data.content);
}
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

/* ---- planning a push ---- */
export type Change = { path: string; kind: "new" | "edit"; text: string; sha: string };
export type Removal = { path: string; reason: "gm" | "stale" | "moved" };
export type Skipped = { path: string; reason: "edited" | "unowned" | "template" };
/** Files RPG Tools rewrites on every export. They go along with a push but are not counted as changes you made. */
export const isHousekeeping = (path: string) => path === "8-Archive/Export-Log.md" || path === ".rpg-tools/files.json";
export type Prepared = {
  repo: string; branch: string; includeGm: boolean;
  /** The campaign's folder in the repository ("" for the top); the paths below are inside it. */
  dir?: string;
  /** Where the branch was when the plan was made. Null for an empty repository. */
  head: { commit: string; tree: string } | null;
  changes: Change[]; removals: Removal[]; skipped: Skipped[]; unchanged: number;
  /** Nothing but the export log and file map would change: not worth a commit. */
  nothingToPush: boolean;
  /** GitHub cut the file list short, so only the RP folders were read. */
  truncated: boolean;
};

/**
 * Reads the branch and decides what a push would do. `build` makes the export files from the existing Export-Log text, so the
 * log line is added to the repository's own log. Only files whose content the decision needs are downloaded: the previous
 * file map, the log, and layout files that differ from both the new text and what the last push recorded.
 */
export async function preparePush(token: string, repo: string, branch: string, includeGm: boolean, build: (exportLog: string | undefined) => RpFile[], fetch: FetchLike, dir = ""): Promise<Prepared> {
  const c = conn(token, repo, fetch, dir);
  const head = await readHead(c, branch);
  if (head.state === "missing") throw new GithubError("no-branch", `The branch “${branch}” does not exist in ${repo}. Create it on GitHub, or connect another branch. RPG Tools does not create branches.`);
  const empty = head.state === "empty";
  const { files: tree, truncated } = empty ? { files: new Map<string, TreeItem>(), truncated: false } : await readTree(c, head.tree);

  let previous: unknown = null, log: string | undefined;
  const mapItem = tree.get(".rpg-tools/files.json"), logItem = tree.get("8-Archive/Export-Log.md");
  if (mapItem) { try { previous = JSON.parse(decode(await readBlob(c, mapItem)).replace(/^﻿/, "")); } catch (e) { if (e instanceof GithubError) throw e; previous = null; } }
  if (logItem) log = decode(await readBlob(c, logItem));
  const prevObj = previous && typeof previous === "object" ? previous as { hashes?: Record<string, unknown>; gitBlobs?: Record<string, unknown>; crlf?: unknown } : {};
  const prevCrlf = new Set(Array.isArray(prevObj.crlf) ? prevObj.crlf.filter((x): x is string => typeof x === "string") : []);
  const prevHash = (p: string) => typeof prevObj.hashes?.[p] === "string" ? prevObj.hashes[p] as string : undefined;
  const prevBlob = (p: string) => typeof prevObj.gitBlobs?.[p] === "string" ? prevObj.gitBlobs[p] as string : undefined;

  const files = build(log);
  for (const f of files) assertSafePath(f.path);
  const byPath = new Map(files.map(f => [f.path, f]));
  const newSha = new Map(await Promise.all(files.map(async f => [f.path, await textBlobSha(f.text)] as const)));

  // A file that uses Windows line endings throughout keeps them: its new text is written the same way, and files.json.crlf remembers it for the next push.
  const crlf = new Set<string>();
  const toCrlf = async (path: string) => { const f = byPath.get(path)!; f.text = f.text.replace(/\r?\n/g, "\r\n"); newSha.set(path, await textBlobSha(f.text)); crlf.add(path); };

  // What each layout file in the repository counts as, in SHA-256 terms, for planWrite.
  const existing = new Map<string, string | null>(), download: TreeItem[] = [];
  for (const [path, item] of tree) {
    if (!isLayoutPath(path)) continue;
    const mine = byPath.get(path);
    if (mine && newSha.get(path) === item.sha) existing.set(path, sha256Hex(enc.encode(mine.text)));
    else if (prevHash(path) !== undefined && prevBlob(path) === item.sha) { if (mine && prevCrlf.has(path)) await toCrlf(path); existing.set(path, prevHash(path)!); }
    else if (!isHousekeeping(path) && !path.startsWith(".rpg-tools/") && (prevHash(path) !== undefined || (mine && path.endsWith(".md") && !isRewrittenPath(path)))) { existing.set(path, null); download.push(item); }
    else existing.set(path, "unknown");
  }
  // A file too big to read cannot be compared, so it counts as not ours: it is left alone rather than blocking the push.
  // A file whose text equals the new export apart from its front matter and the sections the app writes from data (a change brought back into the app, or a new page whose file the AI GM wrote) is ours: it counts as unchanged.
  // The file as the last push wrote it is read too, so an edit a person made to the front matter or a data section is told from the app moving on.
  await pool(download, 6, async item => {
    try {
      const bytes = await readBlob(c, item), mine = byPath.get(item.path), pb = prevBlob(item.path), text = decode(bytes);
      let prev: string | undefined;
      if (mine && pb) { try { prev = decode(await readBlob(c, { path: item.path, sha: pb, size: 0 })); } catch (e) { if (!(e instanceof GithubError)) throw e; } }
      if (mine && sameApartFromOwned(item.path, text, mine.text, prev)) {
        if (/\r\n/.test(text) && !/(?<!\r)\n/.test(text)) await toCrlf(item.path);
        existing.set(item.path, sha256Hex(enc.encode(mine.text)));
      } else existing.set(item.path, sha256Hex(bytes));
    } catch (e) { if (e instanceof GithubError && e.code === "too-big") existing.set(item.path, "unknown"); else throw e; }
  });

  // A page made from a new repository file is exported under its title. When the file's name differs from its title, the repository would hold the text twice: the file is moved.
  const moved: Removal[] = [], dirOf = (p: string) => { const q = p.replace(/^6-GM-Only\//, ""); return q.slice(0, q.lastIndexOf("/")); };
  const orphans = [...tree.values()].filter(i => isLayoutPath(i.path) && i.path.endsWith(".md") && !byPath.has(i.path) && prevHash(i.path) === undefined && !isHousekeeping(i.path) && !i.path.startsWith(".rpg-tools/") && !isRewrittenPath(i.path) && (i.size ?? 0) <= 400_000);
  const homes = files.filter(f => f.path.endsWith(".md") && !tree.has(f.path) && !isRewrittenPath(f.path));
  if (orphans.length && homes.length) await pool(orphans, 6, async item => {
    const dir = dirOf(item.path), near = homes.filter(f => dirOf(f.path) === dir);
    if (!near.length) return;
    let text: string; try { text = decode(await readBlob(c, item)); } catch (e) { if (e instanceof GithubError) return; throw e; }
    if (near.some(f => sameApartFromOwned(f.path, text, f.text))) moved.push({ path: item.path, reason: "moved" });
  });

  const plan = planWrite(existing, previous, files, includeGm);

  // The file map records, for each file now in the repository as RPG Tools wrote it, its SHA-256 and git blob id. A file left alone
  // keeps its old entry (or none), so it still counts as edited next time.
  const written = new Set(plan.write.map(f => f.path));
  const final = new Map(plan.write.map(f => [f.path, f]));
  const mapFile = byPath.get(".rpg-tools/files.json");
  if (mapFile) {
    const map = JSON.parse(mapFile.text) as { hashes: Record<string, string>; gitBlobs?: Record<string, string> };
    for (const s of plan.skip) { const old = prevHash(s.path); if (old !== undefined) map.hashes[s.path] = old; else delete map.hashes[s.path]; }
    const blobs: Record<string, string> = {};
    const crlfNow = [...crlf].filter(p => written.has(p) && map.hashes[p] !== undefined).sort();
    for (const p of crlfNow) map.hashes[p] = sha256Hex(enc.encode(byPath.get(p)!.text));
    if (crlfNow.length) (map as { crlf?: string[] }).crlf = crlfNow;
    for (const p of Object.keys(map.hashes).sort()) if (written.has(p) && newSha.has(p)) blobs[p] = newSha.get(p)!;
    map.gitBlobs = blobs;
    const text = JSON.stringify(map, null, 2);
    final.set(mapFile.path, { path: mapFile.path, text });
    newSha.set(mapFile.path, await textBlobSha(text));
  }

  const changes: Change[] = []; let unchanged = 0;
  for (const f of final.values()) {
    const sha = newSha.get(f.path)!, have = tree.get(f.path);
    if (have && have.sha === sha) unchanged++;
    else changes.push({ path: f.path, kind: have ? "edit" : "new", text: f.text, sha });
  }
  // New pages first, then edits; the machine files (the restore copy, file map, log) come last.
  const rank = (c: Change) => (c.path.startsWith(".rpg-tools/") || isHousekeeping(c.path) ? 2 : 0) + (c.kind === "edit" ? 1 : 0);
  changes.sort((a, b) => rank(a) - rank(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const removals = [...plan.remove.filter(r => tree.has(r.path)), ...moved.sort((a, b) => (a.path < b.path ? -1 : 1))];
  return { repo, branch, includeGm, dir: c.dir, head: empty ? null : { commit: head.commit, tree: head.tree }, changes, removals, skipped: plan.skip.filter(s => tree.has(s.path)), unchanged, nothingToPush: !changes.some(ch => !isHousekeeping(ch.path)) && removals.length === 0, truncated };
}

/* ---- pushing ---- */
export type PushResult = { commit: string; url: string; files: number; commits: number };
/**
 * One commit with the changes, never a force push. If the branch moved since the plan was made, nothing is pushed.
 * An empty repository gets README.md through the Contents API first (git's own blob calls refuse an empty repository), then the rest.
 */
export async function pushFiles(token: string, prepared: Prepared, message: string, fetch: FetchLike, onProgress: (text: string) => void = () => undefined): Promise<PushResult> {
  const { repo, branch } = prepared, c = conn(token, repo, fetch, prepared.dir ?? "");
  const note = message.replace(/\r\n?/g, "\n").trim();
  if (!note) throw new GithubError("bad-input", "Write a commit message first.");
  let changes = prepared.changes, commits = 0, base = prepared.head;
  if (!base) {
    const first = changes.find(ch => ch.path === "README.md") ?? changes[0];
    if (!first) throw new GithubError("bad-input", "There is nothing to push.");
    onProgress("Starting the repository…");
    // Someone may have added commits since the plan was made; a push planned against an empty repository must not land on top of them.
    if ((await readHead(c, branch)).state !== "empty") throw moved();
    const info = await checkRepo(token, repo, fetch);
    if (info.defaultBranch !== branch) throw new GithubError("bad-input", `${repo} is empty, so GitHub can only start it on its default branch (${info.defaultBranch}). Connect that branch, or add a first file on GitHub.`);
    const made = await call(c, "PUT", `/repos/${repo}/contents/${inDir(c, first.path).split("/").map(encodeURIComponent).join("/")}`, { message: note, content: toBase64(enc.encode(first.text)), branch }, undefined, [422]);
    if (made.status === 422) throw new GithubError("failed", "GitHub would not start this repository. Add a first file on GitHub, then push again.");
    commits++; changes = changes.filter(ch => ch !== first);
    const now = await readHead(c, branch);
    if (now.state !== "found") throw new GithubError("failed", "GitHub did not finish starting the repository. Try again in a moment.");
    base = { commit: now.commit, tree: now.tree };
    if (!changes.length && !prepared.removals.length) return { commit: String(made.data?.commit?.sha ?? base.commit), url: commitUrl(repo, String(made.data?.commit?.sha ?? base.commit)), files: 1, commits };
  } else {
    const now = await readHead(c, branch);
    if (now.state !== "found" || now.commit !== base.commit) throw moved();
  }

  const total = changes.length;
  let done = 0;
  const entries = await pool(changes, 4, async ch => {
    const { data } = await call(c, "POST", `/repos/${repo}/git/blobs`, { content: toBase64(enc.encode(ch.text)), encoding: "base64" });
    if (typeof data?.sha !== "string") throw new GithubError("failed", "GitHub did not return an id for an uploaded file.");
    onProgress(`Uploading files… ${++done} of ${total}`);
    return { path: inDir(c, ch.path), mode: "100644", type: "blob", sha: data.sha as string };
  });
  const gone = prepared.removals.map(r => ({ path: inDir(c, r.path), mode: "100644", type: "blob", sha: null as string | null }));
  onProgress("Writing the commit…");
  const tree = await call(c, "POST", `/repos/${repo}/git/trees`, { base_tree: base.tree, tree: [...entries, ...gone] });
  if (typeof tree.data?.sha !== "string") throw new GithubError("failed", "GitHub did not return the new file tree.");
  const commit = await call(c, "POST", `/repos/${repo}/git/commits`, { message: note, tree: tree.data.sha, parents: [base.commit] });
  if (typeof commit.data?.sha !== "string") throw new GithubError("failed", "GitHub did not return the new commit.");
  onProgress(`Updating ${branch}…`);
  const ref = await call(c, "PATCH", `/repos/${repo}/git/refs/heads/${refPath(branch)}`, { sha: commit.data.sha, force: false }, undefined, [422, 409]);
  if (ref.status === 422 || ref.status === 409) {
    const said = String(ref.data?.message ?? "");
    if (/protect|required|review|status check/i.test(said) && !/fast.?forward/i.test(said)) throw new GithubError("protected", `${branch} is protected, so GitHub refused the push. Allow this key to push to it, or connect another branch.`);
    throw moved();
  }
  return { commit: commit.data.sha, url: commitUrl(repo, commit.data.sha), files: total + prepared.removals.length + (prepared.head ? 0 : 1), commits: commits + 1 };
}
const moved = () => new GithubError("moved", "The branch changed on GitHub while you were reviewing. Nothing was pushed, and nothing was changed on GitHub. Review again to see the new state.");
const commitUrl = (repo: string, sha: string) => `https://github.com/${repo}/commit/${sha}`;

/* ---- restore ---- */
export type GithubRestore =
  | { ok: true; workspace: Workspace; files: number; date: string | null; truncated: boolean }
  | { ok: false; kind: ZipKind; error: string };

/** Reads .rpg-tools/campaign.json (or the old world-manager/<id>/campaign.json) from a branch, ready for "Restore as a new campaign". */
export async function readRepoRestore(token: string, repo: string, branch: string, fetch: FetchLike, dir = ""): Promise<GithubRestore> {
  const c = conn(token, repo, fetch, dir);
  const head = await readHead(c, branch);
  if (head.state === "missing") throw new GithubError("no-branch", `The branch “${branch}” does not exist in ${repo}.`);
  if (head.state === "empty") return { ok: false, kind: "unknown", error: `${repo} is empty. There is nothing to restore.` };
  const { files, truncated } = await readTree(c, head.tree);
  const names = [...files.keys()];
  const old = names.filter(n => /^world-manager\/[^/]+\/campaign\.json$/.test(n));
  const pick = files.get(RESTORE_PATH) ?? (old.length === 1 ? files.get(old[0]) : undefined);
  // readRestoreCopy decides what is wrong with a repository; only the file it will parse is downloaded.
  const entries: { name: string; data: Uint8Array }[] = names.map(name => ({ name, data: new Uint8Array(0) }));
  if (pick) {
    if ((pick.size ?? 0) > ZIP_MAX_BYTES) return { ok: false, kind: "restore", error: `${pick.path} is over ${ZIP_MAX_BYTES / 1024 / 1024} MB, which is too big to restore.` };
    entries[names.indexOf(pick.path)].data = await readBlob(c, pick, ZIP_MAX_BYTES);
  }
  const result = readRestoreCopy(entries);
  if (!result.ok) return { ok: false, kind: classifyZip(names), error: result.error };
  const logItem = files.get("8-Archive/Export-Log.md");
  let date: string | null = null;
  if (logItem) { try { date = exportedAt(decode(await readBlob(c, logItem, 1_000_000))); } catch { date = null; } }
  return { ok: true, workspace: result.workspace, files: names.length, date, truncated };
}

/* ---- reading an RP repository to import it as a new campaign ---- */
export type GithubFiles = { ok: true; files: RepoFile[]; truncated: boolean } | { ok: false; error: string };

/**
 * Reads a branch of an RP repository for "Import as a new campaign": every path from the tree, and the text of only the Markdown
 * files that would be imported (never 7-Library or 8-Archive, never pictures). A repository over the import limits is refused
 * before anything is downloaded.
 */
export async function readRepoFiles(token: string, repo: string, branch: string, fetch: FetchLike, onProgress: (text: string) => void = () => undefined, dir = ""): Promise<GithubFiles> {
  const c = conn(token, repo, fetch, dir);
  const head = await readHead(c, branch);
  if (head.state === "missing") throw new GithubError("no-branch", `The branch “${branch}” does not exist in ${repo}.`);
  if (head.state === "empty") return { ok: false, error: `${repo} is empty. There is nothing to import.` };
  const { files: tree, truncated } = await readTree(c, head.tree);
  const items = [...tree.values()];
  const plan = planRead(items.map(i => ({ path: i.path, size: i.size })));
  if (!plan.ok) return plan;
  const wanted = new Set(plan.wanted), texts = new Map<string, string>();
  let done = 0;
  await pool(plan.wanted, 4, async path => {
    texts.set(path, decodeText(await readBlob(c, tree.get(path)!, 500_000), path));
    onProgress(`Reading files… ${++done} of ${wanted.size}`);
  });
  return { ok: true, truncated, files: items.map(i => ({ path: i.path, size: i.size, ...(texts.has(i.path) ? { text: texts.get(i.path) } : {}) })) };
}

/* ---- reading a repository to bring its changes back ---- */
export type GithubChanges = { ok: true; files: RepoFile[]; map: FilesMap; log: string | undefined; truncated: boolean; downloaded: number } | { ok: false; error: string };

/**
 * Reads a branch for "Bring back changes": the tree, .rpg-tools/files.json, the export log, and the text of only the Markdown files whose
 * git blob id differs from the one the last push recorded (all of them when the map has no blob ids). Everything else counts as unchanged.
 */
export async function readRepoChanges(token: string, repo: string, branch: string, fetch: FetchLike, onProgress: (text: string) => void = () => undefined, dir = ""): Promise<GithubChanges> {
  const c = conn(token, repo, fetch, dir);
  const head = await readHead(c, branch);
  if (head.state === "missing") throw new GithubError("no-branch", `The branch “${branch}” does not exist in ${repo}.`);
  if (head.state === "empty") return { ok: false, error: `${repo} is empty. There is nothing to bring back.` };
  const { files: tree, truncated } = await readTree(c, head.tree);
  const mapItem = tree.get(".rpg-tools/files.json");
  if (!mapItem) return { ok: false, error: `${repo} has no .rpg-tools/files.json, so RPG Tools cannot tell what changed since the last push.` };
  const map = parseFilesMap(decode(await readBlob(c, mapItem, 2_000_000)));
  if (!map) return { ok: false, error: ".rpg-tools/files.json could not be read." };
  const wanted = [...tree.values()].filter(i => isCandidate(i.path) && (i.size ?? 0) <= 400_000 && !(map.gitBlobs[i.path] !== undefined && map.gitBlobs[i.path] === i.sha));
  const texts = new Map<string, string>();
  let done = 0;
  await pool(wanted, 4, async item => {
    try { texts.set(item.path, decodeText(await readBlob(c, item, 500_000), item.path)); } catch (e) { if (e instanceof GithubError) throw e; /* not UTF-8: left unread */ }
    onProgress(`Reading files… ${++done} of ${wanted.length}`);
  });
  const logItem = tree.get("8-Archive/Export-Log.md");
  let log: string | undefined;
  if (logItem) { try { log = decode(await readBlob(c, logItem, 1_000_000)); } catch { log = undefined; } }
  return { ok: true, truncated, map, log, downloaded: texts.size, files: [...tree.values()].map(i => ({ path: i.path, size: i.size, ...(texts.has(i.path) ? { text: texts.get(i.path) } : {}) })) };
}
