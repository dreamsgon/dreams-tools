import type {Token, Workspace} from './model';

const fields = ['hp','maxHp','ac','dc','passivePerception','tempHp','initiative','initiativeGroup','skipInitiative','showAc','showDc','showPassivePerception','showTempHp','discordHpDisplay','showDiscordConditions','notes','zeroHpStatus'] as const;
/** Update only reusable stats; preserve the gallery identity, portrait, folder and encounter state. */
export function saveTokenStatsToGallery(workspace: Workspace, token: Token, targetId: string) {
  const target = workspace.tokenLibrary.find(t => t.id === targetId);
  if (!target) throw Error('Choose an existing gallery token.');
  for (const field of fields) {
    if (token[field] === undefined) delete target[field];
    else Object.assign(target, { [field]: structuredClone(token[field]) });
  }
}
