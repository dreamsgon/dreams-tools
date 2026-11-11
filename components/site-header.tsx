import { Map as MapIcon } from "lucide-react";
import ThemeToggle from "./theme-toggle";

export default function SiteHeader({ account = false, signedIn = false }: { account?: boolean; signedIn?: boolean }) {
  return <header className="site-header">
    <a href="/" className="brand"><MapIcon size={25} aria-hidden="true" />RPG Tools</a>
    <nav aria-label="Main navigation">
      <ThemeToggle />
      <a href="/maptable" className="site-nav-link">Maptable</a>
      <a href="/encyclopedia" className="site-nav-link">Encyclopedia</a>
      <a href="/account" className="site-nav-link">
        {account || signedIn ? "Account" : "Sign in / Register"}
      </a>
    </nav>
  </header>;
}
