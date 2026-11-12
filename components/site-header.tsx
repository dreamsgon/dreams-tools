import AppearanceMenu from "./appearance-menu";

export default function SiteHeader({ account = false, signedIn = false, active }: { account?: boolean; signedIn?: boolean; active?: "campaigns" }) {
  return <header className="site-header">
    <a href="/" className="brand"><span className="tool-switch-mark" aria-hidden="true" />RPG Tools</a>
    <nav aria-label="Main navigation">
      <AppearanceMenu />
      <a href="/campaigns" className="site-nav-link" aria-current={active === "campaigns" ? "page" : undefined}>Campaigns</a>
      <a href="/maptable" className="site-nav-link">Maptable</a>
      <a href="/encyclopedia" className="site-nav-link">Encyclopedia</a>
      <a href="/account" className="site-nav-link">
        {account || signedIn ? "Account" : "Sign in / Register"}
      </a>
    </nav>
  </header>;
}
