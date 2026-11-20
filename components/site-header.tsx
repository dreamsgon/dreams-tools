import Link from "next/link";
import AppearanceMenu from "./appearance-menu";
import NotificationBell from "./notification-bell";
import AccountMenu from "./account-menu";
import "./site-header.css";

/** The slim header outside a campaign (Home, Campaigns, Guide, Account): the mark and the links on the left, so the mark never moves between pages, and the bell and account on the right. A forum only exists inside a campaign, so it has no link here. */
export default function SiteHeader({ account = false, signedIn = false, active, me, maptableHref = "/maptable", encyclopediaHref = "/encyclopedia" }: { account?: boolean; signedIn?: boolean; active?: "campaigns" | "guide"; me?: { name: string; avatar: string }; maptableHref?: string; encyclopediaHref?: string }) {
  return <header className="site-header">
    <Link href="/" className="brand" aria-label="RPG Tools home"><span className="tool-switch-mark" aria-hidden="true" /><span className="brand-name">RPG Tools</span></Link>
    <nav className="site-links" aria-label="Main navigation">
      <Link href="/campaigns" className="site-nav-link" aria-current={active === "campaigns" ? "page" : undefined}>Campaigns</Link>
      <a href={maptableHref} className="site-nav-link">Maptable</a>
      <a href={encyclopediaHref} className="site-nav-link">Wiki</a>
      <a href="/guide" className="site-nav-link" aria-current={active === "guide" ? "page" : undefined}>Guide</a>
    </nav>
    <div className="site-end">
      <AppearanceMenu />
      {signedIn && <NotificationBell />}
      {me ? <AccountMenu me={me} /> : account && !signedIn ? <AccountMenu /> : <a href="/account" className="site-nav-link">{account || signedIn ? "Account" : <>Sign in<span className="site-account-long"> / Register</span></>}</a>}
    </div>
  </header>;
}
