/**
 * A member's free dice roll is made on the server. To post it to Discord afterwards without trusting a total from the
 * browser, the server hands back a proof: an HMAC (with the server's existing secret) over who rolled and what came up.
 * Sending it again checks the proof, so only a roll the server made, for that member, a few minutes ago, can be posted. Server only.
 */
import { createHmac, hkdfSync } from 'node:crypto';

export type RollProof = { formula: string; total: number; detail: string; at: number; sig: string };
export const PROOF_MINUTES = 10;
type Who = { owner: string; campaignId: string; userId: string };

function key(env: NodeJS.ProcessEnv) {
  const material = env.AI_KEY_SECRET || env.MAPTABLE_AWS_SECRET_ACCESS_KEY;
  if (!material) throw Error('The server has no secret to hash with. Set AI_KEY_SECRET (see .env.example).');
  return Buffer.from(hkdfSync('sha256', material, 'rpg-tools', 'player-dice-proof', 32));
}
const sign = (who: Who, r: Omit<RollProof, 'sig'>, env: NodeJS.ProcessEnv) =>
  createHmac('sha256', key(env)).update([who.owner, who.campaignId, who.userId, r.formula, String(r.total), r.detail, String(r.at)].join('\n')).digest('hex');

export function proveRoll(who: Who, roll: { formula: string; total: number; detail: string }, at: number, env: NodeJS.ProcessEnv = process.env): RollProof {
  const body = { ...roll, at };
  return { ...body, sig: sign(who, body, env) };
}

/** True for a proof this server made for this member, at most PROOF_MINUTES old and not from the future. */
export function checkProof(who: Who, proof: RollProof, now: number, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!Number.isFinite(proof.at) || proof.at > now + 5_000 || now - proof.at > PROOF_MINUTES * 60_000) return false;
  const expected = sign(who, proof, env);
  return expected.length === proof.sig.length && Buffer.from(expected).equals(Buffer.from(proof.sig));
}
