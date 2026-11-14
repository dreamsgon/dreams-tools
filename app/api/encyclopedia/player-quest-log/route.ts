import { sameOrigin } from '@/lib/encyclopedia/workspace-server';
import { playerSheetDeps } from '@/lib/encyclopedia/player-links-server';
import { handlePlayerQuestLog } from '@/lib/encyclopedia/player-sheet-request';
export const dynamic = 'force-dynamic';
// A signed-in member adding to, rewriting or removing their own entries in a shared quest's Log.
export const POST = (request: Request) => handlePlayerQuestLog(request, playerSheetDeps(sameOrigin));
