/* A member's initial avatar and "2h ago" times. Their own file so the notification bell in the site header
 * can show them without loading the whole Members tab. */
import { when } from "./home-shared";
import "./campaign-members.css";

/** "2h ago", "yesterday" or "Nov 12", to sit mid-sentence. */
export const ago = (iso: string) => { const w = when(iso); return /^[A-Z][a-z]{2} \d/.test(w) ? w : w.toLowerCase(); };
export const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

export function Avatar({ name, seed }: { name: string; seed?: string }) {
  const n = [...(seed ?? name)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  return <span className={`mem-avatar mem-av${n}`} aria-hidden="true">{initial(name)}</span>;
}
