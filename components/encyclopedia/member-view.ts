/**
 * A co-GM opening a campaign someone else runs: /encyclopedia#m-<ref> (see lib/members-server.ts). The Encyclopedia
 * then reads that one campaign with ?member=<ref>, and pictures and maps load from the owner's images the same way.
 */
let ref = '', edit = false;
export const memberRefFromHash = () => /^#m-([a-f0-9]{64})$/.exec(typeof location === 'undefined' ? '' : location.hash)?.[1] ?? '';
export const setMemberRef = (value: string) => { ref = value; };
export const memberRef = () => ref;
/** Set from the campaign's member list: true when this co-GM's groups say Yes to "Edit Encyclopedia pages". */
export const setMemberEdit = (value: boolean) => { edit = value; };
/** A co-GM who may look but not change anything. */
export const memberReadOnly = () => !!ref && !edit;
export const workspaceUrl = () => '/api/encyclopedia/workspace' + (ref ? `?member=${ref}` : '');
export const imageSrc = (id: string) => '/api/encyclopedia/map-images?id=' + encodeURIComponent(id) + (ref ? `&member=${ref}` : '');
