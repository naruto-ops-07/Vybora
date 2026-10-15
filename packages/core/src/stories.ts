/** Display time for an image story segment. */
export const IMAGE_STORY_MS = 5_000;

export interface StoryPosition {
  group: number;
  item: number;
}

/**
 * Advance through story groups (one per author). Returns null when the viewer
 * reached the end of the last group.
 */
export function nextStory(pos: StoryPosition, groupSizes: readonly number[]): StoryPosition | null {
  const size = groupSizes[pos.group] ?? 0;
  if (pos.item + 1 < size) return { group: pos.group, item: pos.item + 1 };
  for (let g = pos.group + 1; g < groupSizes.length; g++) {
    if ((groupSizes[g] ?? 0) > 0) return { group: g, item: 0 };
  }
  return null;
}

export function previousStory(pos: StoryPosition, groupSizes: readonly number[]): StoryPosition {
  if (pos.item > 0) return { group: pos.group, item: pos.item - 1 };
  for (let g = pos.group - 1; g >= 0; g--) {
    const size = groupSizes[g] ?? 0;
    if (size > 0) return { group: g, item: size - 1 };
  }
  return { group: pos.group, item: 0 };
}

/** Remaining lifetime label, e.g. "23h left". Expiry itself is enforced server-side. */
export function storyTimeLeft(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}
