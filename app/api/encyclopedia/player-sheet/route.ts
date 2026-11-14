import { sameOrigin } from '@/lib/encyclopedia/workspace-server';
import { playerSheetDeps } from '@/lib/encyclopedia/player-links-server';
import { handlePlayerSheet } from '@/lib/encyclopedia/player-sheet-request';
export const dynamic = 'force-dynamic';
// A published sheet is read in under 25 s (see sheet-published.ts), well inside the 60 s every API route gets in vercel.json.
export const maxDuration = 60;
// A signed-in member reading, linking, refreshing or unlinking their own character's sheet. See lib/encyclopedia/player-sheet.ts.
export const POST = (request: Request) => handlePlayerSheet(request, playerSheetDeps(sameOrigin));
