/**
 * A co-GM opening a campaign in someone else's Maptable: /maptable#m-<ref> (see lib/maptable-co-gm.ts). Every read and
 * save then carries ?member=<ref>, and pictures a co-GM adds go to the GM's storage. The hash stays in the address.
 */
const PATTERN = /^#m-([a-f0-9]{64})$/;
/** The co-GM ref in the address, or "" when this is someone's own Maptable. */
export const mapMemberRef = () => PATTERN.exec(typeof location === "undefined" ? "" : location.hash)?.[1] ?? "";
const withMember = (path: string) => { const ref = mapMemberRef(); return ref ? `${path}?member=${ref}` : path; };
export const mapWorkspaceUrl = () => withMember("/api/workspace");
export const assetsUrl = () => withMember("/api/assets");
export const bookWorkspaceUrl = () => withMember("/api/encyclopedia/workspace");
export const bookImageUrl = (id: string) => { const ref = mapMemberRef(); return "/api/encyclopedia/map-images?id=" + encodeURIComponent(id) + (ref ? `&member=${ref}` : ""); };
