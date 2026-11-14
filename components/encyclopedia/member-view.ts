/**
 * A co-GM opening a campaign someone else runs: /encyclopedia#m-<ref> (see lib/members-server.ts). The Encyclopedia
 * then reads that one campaign with ?member=<ref>, and pictures and maps load from the owner's images the same way.
 */
let ref = '', edit = false;
export const memberRefFromHash = () => /^#m-([a-f0-9]{64})$/.exec(typeof location === 'undefined' ? '' : location.hash)?.[1] ?? '';
export const setMemberRef = (value: string) => { if (value !== ref) added.clear(); ref = value; };
export const memberRef = () => ref;
/** Set from the campaign's member list: true when this co-GM's groups say Yes to "Edit Encyclopedia pages". */
export const setMemberEdit = (value: boolean) => { edit = value; };
/** A co-GM who may look but not change anything. */
export const memberReadOnly = () => !!ref && !edit;
export const workspaceUrl = () => '/api/encyclopedia/workspace' + (ref ? `?member=${ref}` : '');
export const imageSrc = (id: string) => '/api/encyclopedia/map-images?id=' + encodeURIComponent(id) + (ref ? `&member=${ref}` : '');
/** The upload address: into the GM's storage for a co-GM, the signed-in user's own otherwise. */
export const uploadUrl = () => '/api/encyclopedia/map-images' + (ref ? `?member=${ref}` : '');
const added = new Set<string>();
/** Pictures this co-GM added this session; the app lets them into the copy before the server has seen them. */
export const addUploaded = (id: string) => { added.add(id); };
export const uploaded = (): ReadonlySet<string> => added;
