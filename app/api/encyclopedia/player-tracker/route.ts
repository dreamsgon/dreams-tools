import { sameOrigin } from '@/lib/encyclopedia/workspace-server';
import { playerSheetDeps } from '@/lib/encyclopedia/player-links-server';
import { handlePlayerCharacter } from '@/lib/encyclopedia/player-sheet-request';
export const dynamic = 'force-dynamic';
// A signed-in member's own character: its shown trackers (Shields, Stress…), and with ?items its inventory, spells,
// giving and stores. One route for both keeps the number of deployed functions (and Functions Storage) down.
export const POST = (request: Request) => handlePlayerCharacter(request, playerSheetDeps(sameOrigin));
