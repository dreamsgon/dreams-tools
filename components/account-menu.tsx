"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { BookOpen, ChevronDown, Eye, LayoutDashboard, LogOut, Settings, UserRound } from "lucide-react";
import { avatarSrc } from "@/lib/avatar";
import { forgetDeviceAi } from "@/lib/ai/device-keys";
import { setViewAsPlayer, useViewAsPlayer } from "@/lib/view-as-player";
import "./account-menu.css";

/*
 * The account menu: your name and picture at the right end of every header. Clicking it opens a small menu with
 * your account settings, the Switch to Player view toggle (lib/view-as-player.ts), the usual places and Sign out.
 * Signed out, it is a plain Sign in link.
 */

export type Me = { name: string; avatar: string; email?: string };
type Loaded = { signedIn: true; name: string; email: string; avatar: string } | { signedIn: false };

let loading: Promise<Loaded | null> | null = null;
/** Who is signed in, read once per page load and shared by every menu on the page. */
function loadMe(): Promise<Loaded | null> {
  loading ??= fetch("/api/account", { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<Loaded> : null).catch(() => null);
  return loading;
}

/** Shows "dr•••••@gmail.com": enough to recognize, not enough to read over a shoulder or on a stream. */
export function maskEmail(email: string) { const at = email.indexOf("@"); if (at < 1) return email; return email.slice(0, Math.min(2, at)) + "•••••" + email.slice(at); }
const initial = (name: string) => (Array.from(name.trim())[0] ?? "?").toUpperCase();

function Picture({ me, size }: { me: Me; size: "s" | "m" }) {
  return <span className={`acct-avatar acct-avatar-${size}`} aria-hidden="true">{me.avatar ? <img alt="" src={avatarSrc(me.avatar)} /> : initial(me.name)}</span>;
}

/**
 * `me` comes from the server where the page has it (the site header); otherwise the menu asks once.
 * `compact` shows only the picture (the campaign bar and tool headers); the site header shows the name too.
 */
export default function AccountMenu({ me: given, compact = false, signedIn: knownSignedIn }: { me?: Me; compact?: boolean; signedIn?: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [open, setOpen] = useState(false), [leaving, setLeaving] = useState(false);
  const player = useViewAsPlayer();
  const wrapper = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // The server-rendered header knows the name and picture; the email is read when the menu first opens.
  const needFetch = !given || (open && given.email === undefined);
  useEffect(() => {
    if (!needFetch || knownSignedIn === false) return;
    let live = true;
    void loadMe().then(l => { if (live) setLoaded(l); });
    return () => { live = false; };
  }, [needFetch, knownSignedIn]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!wrapper.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Focus the first item, as menus do.
    menu.current?.querySelector<HTMLElement>("[role^='menuitem']")?.focus();
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const fetched = loaded?.signedIn ? loaded : null;
  const me: Me | null = given ? { ...given, email: given.email ?? fetched?.email } : fetched;

  if (!me) {
    // Signed out, or still asking: a plain link to the account page, as before.
    const out = knownSignedIn === false || loaded?.signedIn === false || loaded === null;
    return <a href="/account" className="acct-signin tool-account" aria-label={out ? "Sign in" : "Account"} title={out ? "Sign in" : "Account"}>
      {compact ? <UserRound size={17} aria-hidden="true" /> : out ? <>Sign in<span className="acct-long"> / Register</span></> : "Account"}
    </a>;
  }

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []);
  const onMenuKey = (e: ReactKeyboardEvent) => {
    const list = items(), at = list.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "ArrowDown" ? (at + 1) % list.length : e.key === "ArrowUp" ? (at - 1 + list.length) % list.length : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
    if (to >= 0) { e.preventDefault(); list[to]?.focus(); }
    if (e.key === "Tab") setOpen(false);
  };
  async function signOut() {
    setLeaving(true);
    forgetDeviceAi();
    await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).catch(() => null);
    location.assign("/account");
  }

  return <div className={`acct${compact ? " acct-compact" : ""}`} ref={wrapper}>
    <button ref={trigger} type="button" className={`acct-trigger${player ? " acct-player" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      title={player ? `${me.name} · Player view is on` : me.name} onClick={() => setOpen(v => !v)}
      onKeyDown={e => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
      <Picture me={me} size="s" />
      {player && <span className="acct-player-badge" aria-hidden="true"><Eye size={10} strokeWidth={2.5} /></span>}
      {!compact && <span className="acct-name">{me.name}</span>}
      {!compact && <ChevronDown size={14} className="acct-chevron" aria-hidden="true" />}
      <span className="acct-sr">{compact ? `${me.name}: ` : ""}account menu{player ? ", player view is on" : ""}</span>
    </button>
    {/* eslint-disable @next/next/no-html-link-for-pages -- full-page links: each tool has its own layout (AGENTS.md) */}
    {open && <div className="acct-menu" id={menuId} role="menu" aria-label="Account" ref={menu} onKeyDown={onMenuKey}>
      <div className="acct-who">
        <Picture me={me} size="m" />
        <span><strong>{me.name}</strong>{me.email && <small>{maskEmail(me.email)}</small>}</span>
      </div>
      <div className="acct-sep" role="separator" />
      <a role="menuitem" href="/account" className="acct-item"><Settings size={16} aria-hidden="true" />Account settings</a>
      <a role="menuitem" href="/account#profile" className="acct-item"><UserRound size={16} aria-hidden="true" />Profile and picture</a>
      <div className="acct-sep" role="separator" />
      <button role="menuitemcheckbox" aria-checked={player} type="button" className="acct-item acct-toggle" onClick={() => setViewAsPlayer(!player)}>
        <Eye size={16} aria-hidden="true" />
        <span className="acct-toggle-text"><span>View as a player everywhere</span><small>{player ? "You see what your players see. Turn off to get your GM tools back." : "See Maptable, the Wiki and the Forum as your players do."}</small></span>
        <span className="acct-switch" aria-hidden="true"><i /></span>
      </button>
      <div className="acct-sep" role="separator" />
      <a role="menuitem" href="/campaigns" className="acct-item"><LayoutDashboard size={16} aria-hidden="true" />Your campaigns</a>
      <a role="menuitem" href="/guide" className="acct-item"><BookOpen size={16} aria-hidden="true" />Guide and help</a>
      <div className="acct-sep" role="separator" />
      <button role="menuitem" type="button" className="acct-item" disabled={leaving} onClick={() => void signOut()}><LogOut size={16} aria-hidden="true" />{leaving ? "Signing out…" : "Sign out"}</button>
    </div>}
    {/* eslint-enable @next/next/no-html-link-for-pages */}
  </div>;
}
