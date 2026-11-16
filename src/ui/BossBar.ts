import Phaser from 'phaser';
import { BOSS, GAME_WIDTH, UI_OX, UI_OY } from '../config';

/** Boss health bar, top centre. */
export class BossBar {
  private readonly fill: Phaser.GameObjects.Rectangle;
  private static readonly WIDTH = 160;

  constructor(scene: Phaser.Scene) {
    const x = (GAME_WIDTH - BossBar.WIDTH) / 2 + UI_OX;
    scene.add
      .text(GAME_WIDTH / 2 + UI_OX, 6 + UI_OY, 'Voldemort', { fontFamily: 'monospace', fontSize: '9px', color: '#9dff9d', stroke: '#101010', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
    scene.add.rectangle(x, 20 + UI_OY, BossBar.WIDTH, 7, 0x101010).setOrigin(0, 0.5).setStrokeStyle(1, 0x9dff9d).setScrollFactor(0).setDepth(100);
    this.fill = scene.add.rectangle(x + 1, 20 + UI_OY, BossBar.WIDTH - 2, 5, 0x4cd964).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
  }

  set(hp: number): void {
    this.fill.width = ((BossBar.WIDTH - 2) * Math.max(0, hp)) / BOSS.hp;
  }
}
