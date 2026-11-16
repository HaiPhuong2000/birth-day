import Phaser from 'phaser';
import { TEX } from '../config';

/** Floating Great-Hall candle with a flickering flame and a soft glow. */
export class Candle extends Phaser.Physics.Arcade.Sprite {
  private readonly glow: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    x: number,
    feetY: number,
    readonly index: number,
  ) {
    super(scene, x, feetY, TEX.candle, 0);
    this.setOrigin(0.5, 1);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body!.setSize(14, 18).setOffset(1, -2);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.anims.play('candle-flicker');
    this.setDepth(6);

    this.glow = scene.add.circle(x, feetY - 8, 11, 0xffd36a, 0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
    scene.tweens.add({ targets: this.glow, scale: { from: 0.85, to: 1.25 }, alpha: { from: 0.15, to: 0.3 }, duration: 700, yoyo: true, repeat: -1 });
    scene.tweens.add({ targets: [this, this.glow], y: '-=3', duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  collect(): void {
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.tweens.killTweensOf([this, this.glow]);
    this.scene.tweens.add({
      targets: [this, this.glow],
      y: '-=14',
      scale: 1.6,
      alpha: 0,
      duration: 260,
      onComplete: () => {
        this.glow.destroy();
        this.destroy();
      },
    });
  }
}
