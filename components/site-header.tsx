import Link from "next/link";
import AppearanceMenu from "./appearance-menu";
import NotificationBell from "./notification-bell";
import { avatarSrc } from "@/lib/avatar";

/** On a campaign's page, `maptableHref` and `encyclopediaHref` open that campaign in each tool instead of the last place you were. */
export default function SiteHeader({ account = false, signedIn = false, active, me, maptableHref = "/maptable", encyclopediaHref = "/encyclopedia" }: { account?: boolean; signedIn?: boolean; active?: "campaigns" | "guide"; me?: { name: string; avatar: string }; maptableHref?: string; encyclopediaHref?: string }) {
  return <header className="site-header">
    <Link href="/" className="brand" aria-label="RPG Tools home"><span className="tool-switch-mark" aria-hidden="true" /><span className="brand-name">RPG Tools</span></Link>
    <nav aria-label="Main navigation">
      <AppearanceMenu />
      <div className="site-links">
        <Link href="/campaigns" className="site-nav-link" aria-current={active === "campaigns" ? "page" : undefined}>Campaigns</Link>
        <a href={maptableHref} className="site-nav-link">Maptable</a>
        <a href={encyclopediaHref} className="site-nav-link">Encyclopedia</a>
        <a href="/guide" className="site-nav-link" aria-current={active === "guide" ? "page" : undefined}>Guide</a>

      </div>
      {signedIn && <NotificationBell />}
      <a href="/account" className={me ? "site-nav-link site-me" : "site-nav-link"} title={me ? "Account settings" : undefined}>
        {me ? <><span className="account-avatar account-avatar-s" aria-hidden="true">{me.avatar ? <img alt="" src={avatarSrc(me.avatar)} /> : (Array.from(me.name.trim())[0] ?? "?").toUpperCase()}</span><span className="site-me-name">{me.name}</span><span className="sr-only"> account</span></>
          : account || signedIn ? "Account" : <>Sign in<span className="site-account-long"> / Register</span></>}
      </a>
    </nav>
  </header>;
}
