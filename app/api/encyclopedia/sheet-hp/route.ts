import { ownerFrom, readWorkspace, sameOrigin, saveWorkspace } from '@/lib/encyclopedia/workspace-server';
import { handleSheetHp } from '@/lib/encyclopedia/sheet-hp-request';
export const dynamic = 'force-dynamic';
// Maptable storing a character's HP on its sheet copy after the browser wrote it to Google, and the write-back switch. See lib/encyclopedia/sheet-hp-request.ts.
export const POST = (request: Request) => handleSheetHp(request, { owner: ownerFrom, sameOrigin, store: { read: readWorkspace, save: saveWorkspace } });
