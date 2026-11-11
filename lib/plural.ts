/** "1 token", "2 tokens", "0 effects". Pass `plural` when adding "s" is wrong. */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
