import type { PhotoEntry } from '../types/content';

export interface PhotoSlot {
  kind: 'block' | 'frame';
  x: number;
}

/**
 * Splits photos (chronological) between slots: milestone photos fill the blocks in order, the rest fill the frames.
 * Returns one entry per slot, in the same order as `slots` (blocks first, then frames, as LevelScene passes them).
 * Warns if the slot and photo counts do not match.
 */
export function assignPhotos(slots: PhotoSlot[], photos: PhotoEntry[]): (PhotoEntry | undefined)[] {
  const milestones = photos.filter((p) => p.milestone);
  const others = photos.filter((p) => !p.milestone);
  const blocks = slots.filter((s) => s.kind === 'block').length;
  const frames = slots.length - blocks;
  if (blocks !== milestones.length || frames !== others.length) {
    console.warn(`Photo/slot mismatch: ${blocks} blocks vs ${milestones.length} milestones, ${frames} frames vs ${others.length} photos`);
  }
  let b = 0;
  let f = 0;
  return slots.map((s) => (s.kind === 'block' ? milestones[b++] : others[f++]));
}
