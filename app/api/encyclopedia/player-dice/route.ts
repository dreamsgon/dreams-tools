import { sameOrigin } from '@/lib/encyclopedia/workspace-server';
import { playerSheetDeps } from '@/lib/encyclopedia/player-links-server';
import { handlePlayerDice } from '@/lib/encyclopedia/player-sheet-request';
export const dynamic = 'force-dynamic';
// A signed-in member's dice tray: rolled here, then posted to the campaign's Discord when they press Send.
export const POST = (request: Request) => handlePlayerDice(request, playerSheetDeps(sameOrigin));
