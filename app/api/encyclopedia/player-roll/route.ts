import { sameOrigin } from '@/lib/encyclopedia/workspace-server';
import { playerSheetDeps } from '@/lib/encyclopedia/player-links-server';
import { handlePlayerRoll } from '@/lib/encyclopedia/player-sheet-request';
export const dynamic = 'force-dynamic';
// A signed-in member rolling from their own character's sheet: rolled here from the stored formula and posted to Discord.
export const POST = (request: Request) => handlePlayerRoll(request, playerSheetDeps(sameOrigin));
