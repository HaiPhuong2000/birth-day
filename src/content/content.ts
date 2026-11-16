import type Phaser from 'phaser';
import type { Content } from '../types/content';

/** Content produced by `npm run assets`, loaded by PreloadScene under the 'content' cache key. */
export function getContent(scene: Phaser.Scene): Content {
  return scene.cache.json.get('content') as Content;
}
