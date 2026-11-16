import Phaser from 'phaser';
import { ENEMY, ENEMY_KINDS, TEX } from '../config';
import type { EnemyKind } from '../config';

/** Ground patrol creature (Cornish pixie / niffler): turns at walls and ledges; stomp to defeat. */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  alive = true;
  private dir: 1 | -1 = -1;
  private readonly def: (typeof ENEMY_KINDS)[EnemyKind];

  constructor(
    scene: Phaser.Scene,
    x: number,
    feetY: number,
    kind: EnemyKind,
    private readonly solidAt: (x: number, y: number) => boolean,
  ) {
    const def = ENEMY_KINDS[kind];
    super(scene, x, feetY, TEX.creatures, def.walk[0]);
    this.def = def;
    this.setOrigin(0.5, 1);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body!.setSize(def.bodyW, def.bodyH).setOffset((24 - def.bodyW) / 2, 24 - def.bodyH);
    this.anims.play(`${kind}-walk`);
    this.setDepth(5);
  }

  override update(): void {
    if (!this.alive) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.left) this.dir = 1;
    else if (body.blocked.right) this.dir = -1;
    else if (body.blocked.down && !this.solidAt(this.x + this.dir * (this.def.bodyW / 2 + 2), body.bottom + 2)) this.dir = -this.dir as 1 | -1;
    body.setVelocityX(this.dir * this.def.speed);
    this.setFlipX(this.dir < 0);
  }

  squash(): void {
    this.alive = false;
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.anims.stop();
    this.setFrame(this.def.squash);
    this.scene.tweens.add({ targets: this, alpha: 0, duration: ENEMY.squashTime, delay: ENEMY.squashTime / 2, onComplete: () => this.destroy() });
  }
}
