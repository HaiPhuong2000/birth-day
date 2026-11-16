import Phaser from 'phaser';
import { FRAME, TEX } from '../config';
import type { PhotoEntry } from '../types/content';

/** Magic box with a glowing "?" rune. Bump it from below to reveal its photo; touch again to re-view. */
export class QuestionBlock extends Phaser.Physics.Arcade.Sprite {
  opened = false;
  private bumping = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly index: number,
    readonly photo: PhotoEntry | undefined,
  ) {
    super(scene, x, y, TEX.block, FRAME.block.idle);
    this.setOrigin(0, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    this.anims.play('block-pulse');
    this.setDepth(2);
  }

  /** Plays the bump. Returns whether this was the first opening, or null while already bumping. */
  bump(): 'first' | 'again' | null {
    if (this.bumping) return null;
    this.bumping = true;
    // Visual only: the static body stays put.
    this.scene.tweens.add({ targets: this, y: this.y - 6, duration: 90, yoyo: true, onComplete: () => (this.bumping = false) });
    if (this.opened) return 'again';
    this.opened = true;
    this.anims.stop();
    this.setFrame(FRAME.block.used);
    return 'first';
  }
}
