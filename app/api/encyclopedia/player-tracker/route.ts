import { sameOrigin } from '@/lib/encyclopedia/workspace-server';
import { playerSheetDeps } from '@/lib/encyclopedia/player-links-server';
import { handlePlayerTracker } from '@/lib/encyclopedia/player-sheet-request';
export const dynamic = 'force-dynamic';
// A signed-in member changing the shown trackers (Shields, Stress…) on a character they may edit.
export const POST = (request: Request) => handlePlayerTracker(request, playerSheetDeps(sameOrigin));
