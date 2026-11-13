import { stageTransfer } from "./transfer-client.ts";
import type { Workspace } from "./model";
type Ref<T> = { current: T };
type SaveState = {
  state: Ref<Workspace | null>; revision: Ref<string | null>;
  acknowledged?: Ref<Workspace | null>; loadEpoch?: Ref<number>;
  generation: Ref<number>; savedGeneration: Ref<number>;
  saving: Ref<boolean>; blocked: Ref<boolean>; savePromise: Ref<Promise<boolean> | null>;
  setSaveStatus: (status: string) => void; setSaveError: (error: string) => void;
  request?: typeof fetch;
  /** Takes in a save made somewhere else since, joined with this tab's edits. True when it did, so saving can go on. */
  rebase?: () => Promise<boolean>;
};
export type WorkspacePatch = Partial<Omit<Workspace, 'scenes'>> & {scenes?:{upsert:Workspace['scenes'];remove:string[];order?:string[]}};
/** Compare with the last acknowledged snapshot, never with the current in-flight draft. */
export function workspacePatch(before:Workspace, after:Workspace):WorkspacePatch {
  const patch:WorkspacePatch={};
  const previous=new Map(before.scenes.map(scene=>[scene.id,scene]));
  const nextIds=new Set(after.scenes.map(scene=>scene.id));
  const upsert=after.scenes.filter(scene=>JSON.stringify(previous.get(scene.id))!==JSON.stringify(scene));
  const remove=before.scenes.filter(scene=>!nextIds.has(scene.id)).map(scene=>scene.id);
  const order=after.scenes.map(scene=>scene.id);
  const reordered=JSON.stringify(before.scenes.map(scene=>scene.id))!==JSON.stringify(order);
  if(upsert.length||remove.length||reordered)patch.scenes={upsert,remove,...(reordered?{order}:{})};
  for(const key of Object.keys(after) as (keyof Workspace)[])if(key!=='scenes'&&JSON.stringify(before[key])!==JSON.stringify(after[key]))Object.assign(patch,{[key]:after[key]});
  return patch;
}
export function saveWorkspace({state, revision, acknowledged, loadEpoch, generation, savedGeneration, saving, blocked, savePromise, setSaveStatus, setSaveError, request = fetch, rebase}: SaveState): Promise<boolean> {
    if (savePromise.current) return savePromise.current;
    if (blocked.current || !state.current) return Promise.resolve(false);
    if (savedGeneration.current === generation.current) return Promise.resolve(true);
    saving.current = true;
    const sessionEpoch=loadEpoch?.current;
    setSaveStatus("Saving…");
    const pending = Promise.resolve().then(async () => {
      try {
        let rebases = 0;
        while (savedGeneration.current !== generation.current && !blocked.current) {
          const gen = generation.current;
          const epoch=loadEpoch?.current;
          const snapshot=structuredClone(state.current!);
          const patch=acknowledged?.current?workspacePatch(acknowledged.current,snapshot):null;
          if(patch&&Object.keys(patch).length===0){savedGeneration.current=gen;continue;}
          const payload = JSON.stringify(patch?{patch,revision:revision.current}:{workspace:snapshot,revision:revision.current});
          const blob = new Blob([payload], {type: "application/json"});
          const body = blob.size > 3_000_000 ? JSON.stringify({transferId: await stageTransfer(blob, "workspace", request)}) : payload;
          const response = await request("/api/workspace", {
            method: patch ? "PATCH" : "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          });
          const result = (await response.json()) as { error?: string; revision: string };
          // A reload starts a new editing session; its baseline wins over an old request.
          if(loadEpoch&&loadEpoch.current!==epoch)return false;
          // Saved somewhere else since (an AI running the table, another device): join the two and save again.
          if (response.status === 409 && rebase && rebases < 3) { rebases++; if (await rebase()) continue; }
          if (!response.ok) {
            if (response.status === 409) blocked.current = true;
            throw new Error(result.error || "Cloud save failed.");
          }
          if(typeof result.revision!=="string"||!result.revision.trim())throw new Error("Cloud save acknowledgement is incomplete. Retry before leaving this page.");
          revision.current = result.revision;
          if(acknowledged)acknowledged.current=snapshot;
          savedGeneration.current = gen;
        }
        if (blocked.current) return false;
        setSaveStatus("Saved to cloud");
        setSaveError("");
        return true;
      } catch (e) {
        if(loadEpoch&&loadEpoch.current!==sessionEpoch)return false;
        setSaveStatus("Not saved");
        setSaveError((e as Error).message);
        return false;
      } finally {
        saving.current = false;
        savePromise.current = null;
      }
    });
    savePromise.current = pending;
    return pending;
}
