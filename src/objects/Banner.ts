import Phaser from 'phaser';
import { FRAME, TEX } from '../config';

/** Checkpoint: a red/gold house banner that unfurls when touched. */
export class Banner extends Phaser.Physics.Arcade.Sprite {
  private unfurled = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    feetY: number,
    readonly zone: number,
  ) {
    super(scene, x, feetY, TEX.banner, FRAME.banner.furled);
    this.setOrigin(0.5, 1);
    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    this.setDepth(1);
  }

  get isActive(): boolean {
    return this.unfurled;
  }

  /** `animate=false` for banners that are already behind the player when the level starts. */
  activate(animate = true): void {
    if (this.unfurled) return;
    this.unfurled = true;
    this.setFrame(FRAME.banner.unfurled);
    if (animate) {
      this.setScale(1, 0.5);
      this.scene.tweens.add({ targets: this, scaleY: 1, duration: 350, ease: 'Back.easeOut' });
    }
  }
}
