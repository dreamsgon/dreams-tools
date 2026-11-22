export type DockRect = { top: number; right: number };

/**
 * Place the dice dock just above the board tool bar, right-aligned with it,
 * and report how much vertical space the open tray may use.
 */
export function diceDockPosition(toolbar: DockRect, viewportWidth: number, viewportHeight: number, gap = 8, edge = 12) {
  const bottom = Math.max(edge, Math.round(viewportHeight - toolbar.top + gap));
  const right = Math.max(edge, Math.round(viewportWidth - toolbar.right));
  const space = Math.max(160, Math.round(toolbar.top - gap - edge));
  return { bottom: `${bottom}px`, right: `${right}px`, "--dice-dock-space": `${space}px` } as Record<string, string>;
}

/**
 * Place the dice dock just below a button in a top bar, right-aligned with it,
 * and report how much vertical space the open tray may use.
 */
export function diceDockBelow(button: { bottom: number; right: number }, viewportWidth: number, viewportHeight: number, gap = 8, edge = 12) {
  const top = Math.max(edge, Math.round(button.bottom + gap));
  const right = Math.max(edge, Math.round(viewportWidth - button.right));
  const space = Math.max(160, Math.round(viewportHeight - top - edge));
  return { top: `${top}px`, bottom: "auto", right: `${right}px`, "--dice-dock-space": `${space}px` } as Record<string, string>;
}
