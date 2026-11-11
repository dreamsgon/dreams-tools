import { getBucket } from '../storage';
import { EncyclopediaStore } from './store';
export { hashToken } from './store';
export const createPlayerLink = (owner:string,campaign:string) => new EncyclopediaStore(getBucket()).createLink(owner,campaign);
export const revokePlayerLink = (owner:string,campaign:string) => new EncyclopediaStore(getBucket()).revokeLink(owner,campaign);
export const readPlayerLink = (token:string) => new EncyclopediaStore(getBucket()).player(token);
