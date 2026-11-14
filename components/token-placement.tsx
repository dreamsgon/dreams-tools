"use client";
import "./token-ui.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { uiZoom } from "@/lib/appearance";
import { libraryTokenDropTarget, placeOnMap } from "@/lib/library-token-drop";
import type { ArmedToken } from "@/lib/token-arming";

/**
 * Click-to-arm and drag-to-place for gallery tiles. A plain click arms the token (the board's pill and ghost take over),
 * a drag of more than a few pixels carries it onto the map. Escape cancels a drag.
 */
export function usePlacementGesture(arm: (token: ArmedToken) => void) {
  const drag = useRef<{ pointerId: number; id: string; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ name: string; x: number; y: number; ready: boolean } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) { suppressClick.current = true; drag.current = null; setPreview(null); setMessage("Placement cancelled."); }
    };
    const blur = () => { drag.current = null; setPreview(null); };
    window.addEventListener("keydown", cancel); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", blur); };
  }, []);
  const reset = () => { drag.current = null; setPreview(null); };
  const bind = (token: ArmedToken) => ({
    style: { touchAction: "none" } as const,
    onDragStart: (event: React.DragEvent) => event.preventDefault(),
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !event.isPrimary) return;
      suppressClick.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, id: token.id, x: event.clientX, y: event.clientY, active: false };
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointerId !== event.pointerId) return;
      if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) >= 6) { d.active = true; suppressClick.current = true; setMessage(""); }
      if (d.active) { event.preventDefault(); setPreview({ name: token.name, x: event.clientX, y: event.clientY, ready: !!libraryTokenDropTarget(event.clientX, event.clientY, d.id) }); }
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointerId !== event.pointerId) return;
      if (d.active) setMessage(placeOnMap(event.clientX, event.clientY, d.id) ? `Placed ${token.name} on map.` : "Not placed. Drop onto the map to place a token.");
      reset();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => { suppressClick.current = true; reset(); },
    onLostPointerCapture: () => { if (drag.current?.active) suppressClick.current = true; reset(); },
    onClick: (event: React.MouseEvent) => {
      if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
      suppressClick.current = false; setMessage(""); arm(token);
    },
  });
  const ghost = preview && createPortal(<div aria-hidden="true" className="token-drag-preview" data-ready={preview.ready ? "true" : "false"}
    style={{ left: preview.x / uiZoom() + 14, top: preview.y / uiZoom() + 14 }}>{preview.name || "Token"} · {preview.ready ? "Release to place" : "Drag onto map"}</div>, document.body);
  return { bind, ghost, message };
}

/** One compact tile: a ~32px token circle over a one-line name. Tools appear on hover or focus. */
export function TokenTile({ face, name, title, armed, gesture, tools, tint }: {
  face: ReactNode; name: string; title: string; armed: boolean; gesture: ReturnType<ReturnType<typeof usePlacementGesture>["bind"]>; tools?: ReactNode; tint?: string;
}) {
  return <div className="token-tile" data-armed={armed || undefined} data-side={tint}>
    <button type="button" className="token-tile-main" aria-pressed={armed} title={title} aria-label={`${armed ? "Stop placing" : "Place"} ${name}`} {...gesture}>
      {face}<span className="token-tile-name">{name || "Unnamed"}</span>
    </button>
    {tools && <div className="token-tile-tools">{tools}</div>}
  </div>;
}

/**
 * Over the map while a token is armed: the pill that says what a click does, and a ghost that follows the pointer.
 * A click on the board places through the same drop channel as dragging; Shift keeps the token armed. Escape or Stop disarms.
 */
export function ArmedPlacement({ armed, disarm, face }: { armed: ArmedToken | null; disarm: () => void; face: ReactNode }) {
  const ghost = useRef<HTMLDivElement>(null);
  const armedId = armed?.id ?? null;
  useEffect(() => {
    if (!armedId) return;
    const onBoard = (target: EventTarget | null) => target instanceof HTMLCanvasElement && target.dataset.libraryTokenDrop === "true";
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !onBoard(event.target)) return;
      if (!placeOnMap(event.clientX, event.clientY, armedId)) return;
      event.preventDefault(); event.stopPropagation();
      if (!event.shiftKey) disarm();
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); disarm(); } };
    const move = (event: PointerEvent) => {
      const node = ghost.current; if (!node) return;
      const over = onBoard(event.target);
      node.style.display = over ? "flex" : "none";
      if (over) node.style.transform = `translate3d(${event.clientX / uiZoom() + 10}px, ${event.clientY / uiZoom() + 10}px, 0)`;
    };
    const leave = () => { if (ghost.current) ghost.current.style.display = "none"; };
    window.addEventListener("pointerdown", down, true); window.addEventListener("keydown", key, true);
    window.addEventListener("pointermove", move); document.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key, true); window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, [armedId, disarm]);
  if (!armed) return null;
  return <>
    <div className="armed-pill" role="status">
      <span>Click the map to place <strong>{armed.name || "token"}</strong></span>
      <span className="armed-pill-keys"><kbd>Shift</kbd> keeps placing</span>
      <button type="button" onClick={disarm}>Stop · Esc</button>
    </div>
    {createPortal(<div ref={ghost} className="armed-ghost" aria-hidden="true" style={{ display: "none" }}>{face}</div>, document.body)}
  </>;
}
