"use client";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./confirm-dialog.css";

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** The label of the button that goes ahead, such as "Delete tag". */
  confirm?: string;
  cancel?: string;
  /** Shows the go-ahead button in the danger colour and starts on Cancel. */
  danger?: boolean;
};

/**
 * Asks a yes-or-no question in the app's own dialog instead of the browser's confirm box,
 * so it follows the theme and accent. Resolves true only when the person picks the go-ahead button.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    // Mount inside the campaign's look (when there is one) so the dialog uses its accent.
    const host = document.createElement("div");
    (previous?.closest("[data-look-accent],[data-look-surface]") ?? document.body).appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount(); host.remove();
      if (previous?.isConnected) previous.focus();
      resolve(ok);
    };
    root.render(<ConfirmDialog {...options} done={done} />);
  });
}

function ConfirmDialog({ title, message, confirm = "OK", cancel = "Cancel", danger = false, done }: ConfirmOptions & { done: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby={message ? "confirm-dialog-message" : undefined}
    onCancel={e => { e.preventDefault(); done(false); }}
    // Escape is handled here, so dialogs and menus underneath stay open.
    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); done(false); } }}
    onClick={e => { if (e.target === ref.current) done(false); }}>
    <h2 id="confirm-dialog-title">{title}</h2>
    {message && <p id="confirm-dialog-message">{message}</p>}
    <div className="confirm-dialog-actions">
      <button type="button" autoFocus={danger} onClick={() => done(false)}>{cancel}</button>
      <button type="button" autoFocus={!danger} className={danger ? "confirm-dialog-danger" : "confirm-dialog-go"} onClick={() => done(true)}>{confirm}</button>
    </div>
  </dialog>;
}
