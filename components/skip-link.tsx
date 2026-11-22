"use client";
/**
 * The first thing Tab reaches on every page: jumps past the bars and side rails to the page's own content,
 * the element with id="main-content" (the Wiki page, the Maptable board) or else the page's <main>.
 */
export default function SkipLink() {
  return <a className="skip-link" href="#main-content" onClick={e => {
    const target = document.getElementById("main-content") ?? document.querySelector("main");
    if (!(target instanceof HTMLElement)) return;
    e.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  }}>Skip to content</a>;
}
