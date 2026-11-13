/** Which of the save chip's states Maptable is in, from its save status text, error and conflict flag. */
export type SavePhase = "saved" | "unsaved" | "saving" | "failed" | "conflict" | "loading" | "offline";

export function savePhase(status: string, error: string, conflict: boolean): SavePhase {
  if (conflict && error) return "conflict";
  if (status === "Saving…") return "saving";
  if (error || status === "Not saved") return "failed";
  if (status === "Unsaved changes") return "unsaved";
  if (status === "Loading") return "loading";
  if (status === "Unavailable") return "offline";
  return "saved";
}
