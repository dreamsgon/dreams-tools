/** Profile pictures: the account page shrinks them to a 256 px square WebP; the server accepts only small images it can recognize. */
export const AVATAR_MAX_BYTES=200_000;
export const avatarKey=(prefix:string)=>prefix+"profile/avatar";
/** The image type from its first bytes, or null. Never trusts a declared Content-Type. */
export function avatarType(bytes:Uint8Array):"image/webp"|"image/png"|"image/jpeg"|null{
  const ascii=(from:number,to:number)=>String.fromCharCode(...bytes.subarray(from,to));
  if(bytes.length>=12&&ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP")return "image/webp";
  if(bytes.length>=8&&bytes[0]===0x89&&ascii(1,4)==="PNG"&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return "image/png";
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
  return null;
}
/** The picture's address for a signed-in user's own pages; the version busts the cache after a change. */
export const avatarSrc=(version:string)=>version?`/api/account/avatar?v=${version}`:"";
