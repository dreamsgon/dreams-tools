import Link from "next/link";
import { UserRound } from "lucide-react";

type Tool = "maptable" | "encyclopedia";

/** The RPG Tools wordmark and the Maptable / Encyclopedia tabs, shared by both tools' headers. */
export default function ToolSwitch({ active, encyclopediaHref = "/encyclopedia" }: { active: Tool; encyclopediaHref?: string }) {
  return <div className="tool-switch">
    <Link href="/" className="tool-switch-brand" title="RPG Tools home"><span className="tool-switch-mark" aria-hidden="true" />RPG Tools</Link>
    <nav aria-label="RPG tools">
      <a href="/maptable" aria-current={active === "maptable" ? "page" : undefined}>Maptable</a>
      <a href={encyclopediaHref} aria-current={active === "encyclopedia" ? "page" : undefined}>Encyclopedia</a>
    </nav>
  </div>;
}

/** A small account link for the right end of a tool header. */
export function AccountLink() {
  return <a href="/account" className="tool-account icon-button" aria-label="Account" title="Account"><UserRound size={17} aria-hidden="true" /></a>;
}
