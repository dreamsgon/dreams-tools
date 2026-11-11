export type PoiFolder = { id: string; name: string; parentId: string | null };

export function canMovePoiFolder(folders: PoiFolder[], id: string, parentId: string | null): boolean {
  if (!folders.some(folder => folder.id === id)) return false;
  const seen = new Set([id]);
  while (parentId !== null) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = folders.find(folder => folder.id === parentId);
    if (!parent) return false;
    parentId = parent.parentId;
  }
  return true;
}

export function movePoiFolder(folders: PoiFolder[], id: string, parentId: string | null): boolean {
  if (!canMovePoiFolder(folders, id, parentId)) return false;
  folders.find(folder => folder.id === id)!.parentId = parentId;
  return true;
}

/** Remove only this folder, preserving its child folders and markers at root. */
export function deletePoiFolder(scene: { poiFolders: PoiFolder[]; pointsOfInterest: { folderId: string | null }[] }, id: string): void {
  scene.poiFolders = scene.poiFolders.filter(folder => folder.id !== id);
  for (const folder of scene.poiFolders) if (folder.parentId === id) folder.parentId = null;
  for (const point of scene.pointsOfInterest) if (point.folderId === id) point.folderId = null;
}

export function poiFolderPath(folders: PoiFolder[], id: string): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current: string | null = id;
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = folders.find(candidate => candidate.id === current);
    if (!folder) break;
    names.unshift(folder.name);
    current = folder.parentId;
  }
  return names.join(" / ");
}
