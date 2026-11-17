import { collectionPath, type Collection } from "./model.ts";

/** Wording for the question asked before a Maptable scene changes campaign or folder. */
export function sceneMoveQuestion(collections: Collection[], names: string[], target: string | null) {
  const where = target ? collectionPath(collections, target) : "no campaign (All campaigns & scenes)";
  const what = names.length === 1 ? `“${names[0]}”` : `${names.length} scenes`;
  return { title: `Move ${what}?`, message: `${names.length === 1 ? "It moves" : "They move"} to ${where}, with ${names.length === 1 ? "its" : "their"} tokens, fog, drawings and settings. Undo moves ${names.length === 1 ? "it" : "them"} back.`, confirm: names.length === 1 ? "Move scene" : "Move scenes" };
}

/** Wording for the question asked before a Maptable scene is deleted. */
export function sceneDeleteQuestion(name: string) {
  return { title: `Delete “${name}”?`, message: "Its tokens, fog, drawings and markers are deleted with it. Undo right away brings it back.", confirm: "Delete scene", danger: true };
}
