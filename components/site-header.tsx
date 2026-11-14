import Link from "next/link";
import AppearanceMenu from "./appearance-menu";
import NotificationBell from "./notification-bell";

export default function SiteHeader({ account = false, signedIn = false, active }: { account?: boolean; signedIn?: boolean; active?: "campaigns" }) {
  return <header className="site-header">
    <Link href="/" className="brand" aria-label="RPG Tools home"><span className="tool-switch-mark" aria-hidden="true" /><span className="brand-name">RPG Tools</span></Link>
    <nav aria-label="Main navigation">
      <AppearanceMenu />
      <div className="site-links">
        <Link href="/campaigns" className="site-nav-link" aria-current={active === "campaigns" ? "page" : undefined}>Campaigns</Link>
        <a href="/maptable" className="site-nav-link">Maptable</a>
        <a href="/encyclopedia" className="site-nav-link">Encyclopedia</a>
      </div>
      {signedIn && <NotificationBell />}
      <a href="/account" className="site-nav-link">
        {account || signedIn ? "Account" : <>Sign in<span className="site-account-long"> / Register</span></>}
      </a>
    </nav>
  </header>;
}
