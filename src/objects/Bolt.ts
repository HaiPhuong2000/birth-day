import Phaser from 'phaser';
import { FRAME, TEX } from '../config';

export type BoltOwner = 'player' | 'boss';

/** Spell bolt: red "Expelliarmus" from the player, green curse from the boss. */
export class Bolt extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number, owner: BoltOwner) {
    super(scene, x, y, TEX.projectiles, owner === 'player' ? FRAME.bolt.player : FRAME.bolt.boss);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const size = owner === 'player' ? { w: 12, h: 6 } : { w: 8, h: 8 };
    this.body!.setSize(size.w, size.h);
    this.setDepth(8);
  }

  /** Call after adding to a physics group (groups reset velocity on add). */
  launch(angleRad: number, speed: number): void {
    this.setRotation(angleRad);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).setVelocity(Math.cos(angleRad) * speed, Math.sin(angleRad) * speed);
  }

  override update(): void {
    const { width, height } = this.scene.physics.world.bounds;
    if (this.x < -20 || this.x > width + 20 || this.y < -20 || this.y > height + 20) this.destroy();
  }
}
