import Phaser from 'phaser';
import { TEX } from '../config';
import { photoKey } from '../content/PhotoLoader';
import type { PhotoEntry } from '../types/content';

/** Interior opening of frame.png (x/y 5..30). */
const INTERIOR = 26;
const ZOOM = 1.5;
const CAPTION_MAX = 90;

/** Moving-portrait slot: gold frame with a photo thumbnail; zooms and shows its caption when the player is near. */
export class PhotoFrame extends Phaser.GameObjects.Container {
  private focused = false;
  private thumb?: Phaser.GameObjects.Image;
  private readonly caption: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    slotX: number,
    slotY: number,
    readonly index: number,
    readonly photo: PhotoEntry | undefined,
  ) {
    super(scene, slotX + 18, slotY + 18);
    this.add(scene.add.image(0, 0, TEX.photoFrame));
    this.setDepth(-2);
    scene.add.existing(this);

    this.caption = scene.add
      .text(this.x, this.y + 18 * ZOOM + 3, truncate(photo?.caption ?? ''), {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffe9a8',
        stroke: '#1a1020',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: 140 },
      })
      .setOrigin(0.5, 0)
      .setDepth(-1)
      .setAlpha(0);
  }

  /** Call once the photo texture is loaded. */
  showThumbnail(): void {
    if (!this.photo || this.thumb) return;
    const key = photoKey(this.photo.file);
    if (!this.scene.textures.exists(key)) return;
    this.thumb = this.scene.add.image(0, 0, key);
    this.thumb.setScale(INTERIOR / Math.max(this.thumb.width, this.thumb.height));
    this.add(this.thumb);
  }

  setFocused(on: boolean): void {
    if (on === this.focused) return;
    this.focused = on;
    this.scene.tweens.add({ targets: this, scale: on ? ZOOM : 1, duration: 180, ease: 'Sine.easeOut' });
    this.scene.tweens.add({ targets: this.caption, alpha: on ? 1 : 0, duration: 180 });
  }

  override destroy(fromScene?: boolean): void {
    this.caption.destroy();
    super.destroy(fromScene);
  }
}

function truncate(s: string): string {
  return s.length > CAPTION_MAX ? `${s.slice(0, CAPTION_MAX - 1)}…` : s;
}
