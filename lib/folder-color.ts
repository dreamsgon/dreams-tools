/** Folder and campaign colours: mid tones that read on light and dark surfaces, with white lettering on the tiles. */
export const folderColors = ["#3d63c9", "#2f7d4f", "#b0651a", "#8a4fb0", "#b8453a", "#1f8a95", "#6b7a1e"] as const;
const hashOf = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Always the same colour for the same id. */
export const folderColor = (id: string): string => folderColors[hashOf(id) % folderColors.length];
