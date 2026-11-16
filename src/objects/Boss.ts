import Phaser from 'phaser';
import { BOSS, FRAME, TEX } from '../config';

type BossState = 'idle' | 'telegraph' | 'recover' | 'vanish' | 'appear' | 'dead';
interface Point {
  x: number;
  y: number;
}

/**
 * Voldemort: floats between fixed points, telegraphs, then casts slow green bolts
 * (aimed x2, then a 3-way spread). Emits `fire` (x, y, angleRad, speed) and `defeated`.
 */
export class Boss extends Phaser.Physics.Arcade.Sprite {
  hp: number = BOSS.hp;

  private phase: BossState = 'idle';
  private timer = 0;
  private pointIndex: number;
  private patternIndex = 0;
  private baseY = 0;
  private glow?: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    private readonly points: readonly Point[],
    private readonly target: Point,
  ) {
    super(scene, 0, 0, TEX.voldemort, FRAME.boss.idle[0]);
    this.pointIndex = points.length - 1;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body!.setSize(BOSS.bodyWidth, BOSS.bodyHeight).setOffset((32 - BOSS.bodyWidth) / 2, (48 - BOSS.bodyHeight) / 2);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.setDepth(9);
    this.reset();
  }

  get enraged(): boolean {
    return this.hp / BOSS.hp < BOSS.enrageBelow;
  }

  /** Back to full HP at the starting point (used on every player respawn). */
  reset(): void {
    this.glow?.destroy();
    this.glow = undefined;
    this.scene.tweens.killTweensOf(this);
    this.hp = BOSS.hp;
    this.patternIndex = 0;
    this.pointIndex = this.points.length - 1;
    this.moveToPoint();
    this.setAlpha(1).setScale(1).clearTint();
    (this.body as Phaser.Physics.Arcade.Body).enable = true;
    this.anims.play('boss-idle', true);
    this.phase = 'idle';
    this.timer = BOSS.idleTime * 1.5;
  }

  /** Returns true if the bolt connected (he can't be hit while teleporting or dead). */
  takeHit(): boolean {
    if (this.phase === 'dead' || this.phase === 'vanish' || this.phase === 'appear') return false;
    this.hp -= 1;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(BOSS.hitFlash, () => {
      if (this.phase !== 'dead') this.clearTint();
    });
    if (this.hp <= 0) this.defeat();
    return true;
  }

  override update(time: number, delta: number): void {
    if (this.phase === 'dead') return;
    const scale = this.enraged ? BOSS.enrageTimeScale : 1;
    this.y = this.baseY + Math.sin((time / BOSS.bobPeriod) * Math.PI * 2) * BOSS.bobAmplitude;
    this.setFlipX(this.target.x > this.x);
    this.timer -= delta;

    switch (this.phase) {
      case 'idle':
        if (this.timer <= 0) this.beginTelegraph(scale);
        break;
      case 'telegraph':
        this.glow?.setPosition(this.wandX(), this.y - 8);
        if (this.timer <= 0) this.cast(scale);
        break;
      case 'recover':
        if (this.timer <= 0) this.beginVanish(scale);
        break;
      case 'vanish':
        this.setAlpha(Math.max(0, this.timer / (BOSS.teleportFade * scale)));
        if (this.timer <= 0) this.beginAppear(scale);
        break;
      case 'appear':
        this.setAlpha(Math.min(1, 1 - this.timer / (BOSS.teleportFade * scale)));
        if (this.timer <= 0) this.endAppear(scale);
        break;
    }
  }

  private wandX(): number {
    return this.x + (this.flipX ? 14 : -14);
  }

  private beginTelegraph(scale: number): void {
    this.phase = 'telegraph';
    this.timer = BOSS.telegraphTime * scale;
    this.anims.stop();
    this.setFrame(FRAME.boss.cast);
    this.glow = this.scene.add.circle(this.wandX(), this.y - 8, 5, 0x66ff66, 0.8).setDepth(10).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: this.glow, scale: 2.6, alpha: 0.35, duration: BOSS.telegraphTime * scale, ease: 'Sine.easeIn' });
  }

  private cast(scale: number): void {
    this.glow?.destroy();
    this.glow = undefined;
    const attack = BOSS.pattern[this.patternIndex++ % BOSS.pattern.length];
    const speed = BOSS.boltSpeed * (this.enraged ? BOSS.enrageBoltScale : 1);
    const x = this.wandX();
    const y = this.y - 8;
    const aim = Math.atan2(this.target.y - y, this.target.x - x);
    if (attack === 'spread') {
      for (let i = 0; i < BOSS.spreadCount; i++) {
        const offset = (i - (BOSS.spreadCount - 1) / 2) * BOSS.spreadAngle;
        this.emit('fire', x, y, aim + Phaser.Math.DegToRad(offset), speed);
      }
    } else {
      this.emit('fire', x, y, aim, speed);
    }
    this.phase = 'recover';
    this.timer = BOSS.recoverTime * scale;
  }

  private beginVanish(scale: number): void {
    this.phase = 'vanish';
    this.timer = BOSS.teleportFade * scale;
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  private beginAppear(scale: number): void {
    const others = this.points.map((_, i) => i).filter((i) => i !== this.pointIndex);
    this.pointIndex = Phaser.Math.RND.pick(others);
    this.moveToPoint();
    this.anims.play('boss-idle', true);
    this.phase = 'appear';
    this.timer = BOSS.teleportFade * scale;
  }

  private endAppear(scale: number): void {
    (this.body as Phaser.Physics.Arcade.Body).enable = true;
    this.setAlpha(1);
    this.phase = 'idle';
    this.timer = BOSS.idleTime * scale;
  }

  private moveToPoint(): void {
    const p = this.points[this.pointIndex]!;
    this.baseY = p.y;
    this.setPosition(p.x, p.y);
  }

  private defeat(): void {
    this.phase = 'dead';
    this.glow?.destroy();
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.anims.stop();
    this.setFrame(FRAME.boss.cast);
    this.scene.tweens.add({ targets: this, alpha: 0, scaleY: 1.15, scaleX: 0.7, duration: 1100, ease: 'Sine.easeIn' });
    this.emit('defeated');
  }
}
