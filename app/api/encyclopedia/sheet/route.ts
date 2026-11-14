import {ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {handleSheetRead} from '@/lib/encyclopedia/sheet-request';
export const dynamic='force-dynamic';
// A published sheet is read in under 25 s (see sheet-published.ts), well inside the 60 s every API route gets in vercel.json.
export const maxDuration=60;
// Reads a Google Sheet that was published to the web, for the character sheet link. The signed-in GM only; nothing is stored here.
export const POST=(request:Request)=>handleSheetRead(request,{owner:ownerFrom,sameOrigin});
