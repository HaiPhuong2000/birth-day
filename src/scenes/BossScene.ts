import Phaser from 'phaser';
import { BOSS_BGM, playLoop, sfx, stop } from '../audio/chiptune';
import { BOSS, FRAME, GAME_HEIGHT, GAME_WIDTH, MAP_KEYS, PLAYER, SCENES, TEX, UI_OX, UI_OY } from '../config';
import { Banner } from '../objects/Banner';
import { Boss } from '../objects/Boss';
import { Bolt } from '../objects/Bolt';
import { BossBar } from '../ui/BossBar';
import { MuteButton } from '../ui/MuteButton';
import { isTouchDevice } from '../ui/touchDevice';
import { PlatformerScene } from './PlatformerScene';

/** One-screen arena: defeat Voldemort with the wand, then go to the cake room. */
export class BossScene extends PlatformerScene {
  private boss!: Boss;
  private bar!: BossBar;
  private playerBolts!: Phaser.Physics.Arcade.Group;
  private bossBolts!: Phaser.Physics.Arcade.Group;
  private won = false;

  constructor() {
    super(SCENES.Boss);
  }

  create(): void {
    this.won = false;
    this.buildWorld(MAP_KEYS.arena);
    const entrance = this.objectsOf('checkpoints')[0]!;
    this.spawnPlayer({ x: entrance.x!, y: entrance.y! }, true);
    this.player.canCast = true;
    new Banner(this, entrance.x!, entrance.y!, 0).activate(false);

    const points = this.objectsOf('bossPoints').map((o) => ({ x: o.x!, y: o.y! }));
    this.boss = new Boss(this, points, this.player);
    this.bar = new BossBar(this);
    new MuteButton(this);
    playLoop(BOSS_BGM);
    this.playerBolts = this.physics.add.group({ allowGravity: false, runChildUpdate: true });
    this.bossBolts = this.physics.add.group({ allowGravity: false, runChildUpdate: true });

    this.player.on('cast', (x: number, y: number, facing: 1 | -1) => {
      const bolt = new Bolt(this, x, y, 'player');
      this.playerBolts.add(bolt);
      sfx.spell();
      bolt.launch(facing > 0 ? 0 : Math.PI, PLAYER.boltSpeed);
    });
    this.boss.on('fire', (x: number, y: number, angle: number, speed: number) => {
      const bolt = new Bolt(this, x, y, 'boss');
      this.bossBolts.add(bolt);
      bolt.launch(angle, speed);
    });
    this.boss.on('defeated', () => this.onVictory());

    this.physics.add.collider(this.playerBolts, this.groundLayer, (bolt) => (bolt as unknown as Bolt).destroy());
    this.physics.add.collider(this.bossBolts, this.groundLayer, (bolt) => (bolt as unknown as Bolt).destroy());
    this.physics.add.overlap(this.playerBolts, this.boss, (_boss, bolt) => {
      if (!this.boss.takeHit()) return;
      sfx.bossHit();
      this.bar.set(this.boss.hp);
      const b = bolt as unknown as Bolt;
      this.burst(b.x, b.y, 8, 0xff6b6b);
      b.destroy();
    });
    this.physics.add.overlap(this.player, this.bossBolts, (_p, bolt) => {
      (bolt as unknown as Bolt).destroy();
      this.hitPlayer();
    });
    this.physics.add.overlap(this.player, this.boss, () => this.hitPlayer());

    this.add
      .text(GAME_WIDTH / 2 + UI_OX, GAME_HEIGHT - 24 + UI_OY, isTouchDevice() ? 'Chạm nút ✦ để phóng bùa Expelliarmus!' : 'Nhấn J hoặc X để phóng bùa Expelliarmus!', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffe9a8',
        stroke: '#1a1020',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100)
      .setName('hint');
    this.tweens.add({ targets: this.children.getByName('hint'), alpha: 0, delay: 6000, duration: 800 });
  }

  protected override onRespawn(): void {
    this.boss.reset();
    this.bar.set(this.boss.hp);
    this.playerBolts.clear(true, true);
    this.bossBolts.clear(true, true);
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);
    this.boss.update(time, delta);
  }

  private hitPlayer(): void {
    if (this.won || this.player.isInvulnerable(this.time.now)) return;
    this.killPlayer();
  }

  /** Small spark burst at a point (hit feedback / dissolve). */
  private burst(x: number, y: number, count: number, tint: number): void {
    const emitter = this.add.particles(x, y, TEX.projectiles, {
      frame: FRAME.bolt.spark,
      speed: { min: 30, max: 130 },
      lifespan: { min: 500, max: 1100 },
      scale: { start: 1, end: 0 },
      tint,
      emitting: false,
    });
    emitter.setDepth(12);
    emitter.explode(count);
    this.time.delayedCall(1300, () => emitter.destroy());
  }

  private onVictory(): void {
    this.won = true;
    stop();
    sfx.bossDefeat();
    this.player.canCast = false;
    this.playerBolts.clear(true, true);
    this.bossBolts.clear(true, true);
    this.bar.set(0);
    this.burst(this.boss.x, this.boss.y, 70, 0x7dff7d);
    this.burst(this.boss.x, this.boss.y, 30, 0xffffff);

    const text = this.add
      .text(GAME_WIDTH / 2 + UI_OX, GAME_HEIGHT / 2 - 20 + UI_OY, 'Voldemort bị đánh bại!', {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ffe9a8',
        stroke: '#1a1020',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(0.2);
    this.tweens.add({ targets: text, scale: 1, duration: 500, ease: 'Back.easeOut' });

    this.time.delayedCall(BOSS.victoryDelay, () => {
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        stop(); // Ending plays its own music
        this.scene.start(SCENES.Ending);
      });
    });
  }
}
