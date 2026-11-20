import Link from "next/link";
import { UserRound } from "lucide-react";

type Tool = "maptable" | "encyclopedia";

/**
 * The RPG Tools wordmark and the places outside any campaign: Campaigns, Maptable (maps not in a campaign),
 * the Wiki (worlds and their lore) and the Guide. Inside a campaign the campaign bar (campaign-bar.tsx) takes its place.
 */
export default function ToolSwitch({ active, maptableHref = "/maptable", encyclopediaHref = "/encyclopedia" }: { active: Tool; maptableHref?: string; encyclopediaHref?: string }) {
  return <div className="tool-switch">
    <Link href="/" className="tool-switch-brand" title="RPG Tools home"><span className="tool-switch-mark" aria-hidden="true" />RPG Tools</Link>
    <nav aria-label="RPG tools">
      {/* Full-page links: each tool has its own layout. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/campaigns">Campaigns</a>
      <a href={maptableHref} aria-current={active === "maptable" ? "page" : undefined}>Maptable</a>
      <a href={encyclopediaHref} aria-current={active === "encyclopedia" ? "page" : undefined}>Wiki</a>
      <a href="/guide">Guide</a>
    </nav>
  </div>;
}

/** A small account link for the right end of a tool header. */
export function AccountLink() {
  return <a href="/account" className="tool-account icon-button" aria-label="Account" title="Account"><UserRound size={17} aria-hidden="true" /></a>;
}
