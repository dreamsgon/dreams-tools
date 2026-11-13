/*
 * Page text for the player view, read the same way the GM's page is: headings, lists, tasks, quotes, code,
 * **bold** and [[links]]. The server has already taken out secrets, rolls, notes and Maptable links
 * (playerCampaign), so this only lays out what players may read.
 */
export type ProseBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "bullet"; indent: number; text: string }
  | { type: "task"; indent: number; done: boolean; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "gap" };
export type ProsePart =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; target: string; label: string };

export function proseBlocks(text: string): ProseBlock[] {
  const out: ProseBlock[] = [];
  let fenced = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("```")) { fenced = !fenced; continue; }
    if (fenced) { out.push({ type: "code", text: line }); continue; }
    const task = line.match(/^(\s*)- \[([ xX])\] (.*)$/);
    if (task) { out.push({ type: "task", indent: Math.min(task[1]!.length, 40), done: task[2]!.toLowerCase() === "x", text: task[3]! }); continue; }
    const h = line.match(/^(#{1,6}) (.*)$/);
    if (h) { out.push({ type: "heading", level: Math.min(h[1]!.length + 1, 6), text: h[2]! }); continue; }
    const bullet = line.match(/^(\s*)[-*] (.*)$/);
    if (bullet) { out.push({ type: "bullet", indent: Math.min(bullet[1]!.length, 40), text: bullet[2]! }); continue; }
    if (line.startsWith("> ")) { out.push({ type: "quote", text: line.slice(2) }); continue; }
    out.push(line.trim() ? { type: "paragraph", text: line } : { type: "gap" });
  }
  return out;
}

const TOKENS = /(\[\[[^\]\n]+\]\]|\*\*[^*]+\*\*|`[^`]+`)/g;
export function proseParts(text: string): ProsePart[] {
  return text.split(TOKENS).filter(Boolean).map((part): ProsePart => {
    if (part.startsWith("[[") && part.endsWith("]]")) {
      const [target = "", label] = part.slice(2, -2).split("|");
      return { type: "link", target: target.trim(), label: (label ?? target).trim() };
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return { type: "bold", text: part.slice(2, -2) };
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return { type: "code", text: part.slice(1, -1) };
    return { type: "text", text: part };
  });
}

/** The page a [[link]] goes to, by title, among the pages players can read. */
export function playerLink<T extends { id: string; title: string }>(entries: readonly T[], target: string): T | null {
  const want = target.trim().toLowerCase();
  return entries.find(e => e.id === target) ?? entries.find(e => e.title.trim().toLowerCase() === want) ?? null;
}
