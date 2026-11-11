/** Snapshot both identity and counters: reload can reset counters to the same value. */
export type SyncSnapshot = {
  state: object | null;
  revision: string | null;
  generation: number;
  savedGeneration: number;
  saving: boolean;
  blocked: boolean;
};

export function workspaceSyncDecision(start: SyncSnapshot, current: SyncSnapshot, incomingRevision: string | null, interacting: boolean): "ignore" | "conflict" | "apply" {
  if (!current.state || current.blocked || current.saving || start.saving ||
      start.state !== current.state || start.revision !== current.revision ||
      start.generation !== current.generation || start.savedGeneration !== current.savedGeneration ||
      incomingRevision === current.revision) return "ignore";
  if (current.generation !== current.savedGeneration) return "conflict";
  return interacting ? "ignore" : "apply";
}

export function preserveActiveScene<T extends { activeId: string; scenes: { id: string }[] }>(incoming: T, activeId: string): T {
  return incoming.scenes.some(scene => scene.id === activeId) ? { ...incoming, activeId } : incoming;
}
