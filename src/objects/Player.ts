import Phaser from 'phaser';
import { FRAME, HEAD_SS, PLAYER, TEX } from '../config';
import type { GameInput } from '../input/GameInput';

type Facing = 1 | -1;

/**
 * Container (pixel body + circular face head) with an Arcade body centred on the container.
 * Emits `jump` and `cast` (x, y, facing) when the wand fires.
 */
export class Player extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;
  alive = true;
  /** Wand attack is only enabled in the boss arena. */
  canCast = false;
  facing: Facing = 1;

  private readonly art: Phaser.GameObjects.Sprite;
  private readonly head: Phaser.GameObjects.Image;
  private coyote = 0;
  private jumpBuffer = 0;
  private rising = false;
  private nextCast = 0;
  private invulnerableUntil = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly controls: GameInput,
  ) {
    super(scene, x, y);
    this.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight);
    this.art = scene.add.sprite(0, PLAYER.bodyHeight / 2, TEX.player, FRAME.player.idle).setOrigin(0.5, 1);
    this.head = scene.add.image(0, PLAYER.headOffsetY, TEX.head).setScale(1 / HEAD_SS);
    this.add([this.art, this.head]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setCollideWorldBounds(true).setMaxVelocityY(PLAYER.maxFallSpeed);
    this.setDepth(10);
  }

  isInvulnerable(now: number): boolean {
    return now < this.invulnerableUntil;
  }

  update(time: number, delta: number): void {
    if (!this.alive) return;
    const c = this.controls;
    const b = this.body;
    const dt = delta / 1000;
    const onFloor = b.blocked.down;

    this.coyote = onFloor ? PLAYER.coyoteTime : Math.max(0, this.coyote - delta);
    this.jumpBuffer = c.jumpPressed ? PLAYER.jumpBuffer : Math.max(0, this.jumpBuffer - delta);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      b.setVelocityY(-PLAYER.jumpVelocity);
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.rising = true;
      this.emit('jump');
    }
    if (this.rising && !c.jumpHeld && b.velocity.y < -PLAYER.jumpReleaseVelocity) {
      b.setVelocityY(-PLAYER.jumpReleaseVelocity);
    }
    if (b.velocity.y >= 0) this.rising = false;

    const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    if (dir !== 0) {
      this.facing = dir as Facing;
      const accel = onFloor ? PLAYER.groundAccel : PLAYER.airAccel;
      b.setVelocityX(approach(b.velocity.x, dir * PLAYER.maxSpeed, accel * dt));
    } else {
      b.setVelocityX(approach(b.velocity.x, 0, (onFloor ? PLAYER.groundDecel : PLAYER.airDecel) * dt));
    }

    this.animate(onFloor);

    if (this.canCast && c.attackPressed && time >= this.nextCast) {
      this.nextCast = time + PLAYER.castCooldown;
      this.emit('cast', this.x + this.facing * 13, this.y + 4, this.facing);
    }

    this.setAlpha(this.isInvulnerable(time) && Math.floor(time / 90) % 2 === 0 ? 0.4 : 1);
  }

  /** Bounce after stomping an enemy; higher when jump is held. */
  bounce(): void {
    this.body.setVelocityY(-(this.controls.jumpHeld ? PLAYER.stompBounceHeld : PLAYER.stompBounce));
    this.rising = true;
    this.coyote = 0;
  }

  die(): void {
    this.alive = false;
    this.body.checkCollision.none = true;
    this.body.setVelocity(0, -220);
    this.art.setTint(0xff6666);
  }

  /** `feetY` = ground surface at the spawn point. */
  respawn(x: number, feetY: number, now: number, invulnerableMs: number): void {
    this.body.reset(x, feetY - PLAYER.bodyHeight / 2 - 1);
    this.body.checkCollision.none = false;
    this.alive = true;
    this.rising = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.art.clearTint();
    this.invulnerableUntil = now + invulnerableMs;
  }

  private animate(onFloor: boolean): void {
    this.art.setFlipX(this.facing < 0);
    this.head.x = this.facing;
    if (!onFloor) {
      this.art.anims.stop();
      this.art.setFrame(FRAME.player.jump);
    } else if (Math.abs(this.body.velocity.x) > 12) {
      this.art.anims.play('player-walk', true);
    } else {
      this.art.anims.stop();
      this.art.setFrame(FRAME.player.idle);
    }
  }
}

function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(value + step, target);
  return Math.max(value - step, target);
}
