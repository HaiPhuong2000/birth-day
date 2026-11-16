import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, UI_OX, UI_OY } from '../config';
import { CanvasAnchor } from './canvasAnchor';

export interface CandlePos {
  index: number;
  x: number;
  y: number;
}

const BAR_W = 170;
const BAR_X = (GAME_WIDTH - BAR_W) / 2;
const BAR_Y = 13;
const EDGE = 12;
/** Face marker diameter in game px. */
const FACE_D = 13;
/** Before the first door touch, only candles this far behind the player's furthest point are shown as missed. */
const MISSED_MARGIN = 120;

/**
 * Level progress bar (face dot = player, yellow dots = missing candles) and an edge arrow
 * towards the nearest missing candle. The arrow and look-ahead dots stay hidden until the
 * player has touched the locked door once, so exploring isn't spoiled.
 */
export class CandleGuide {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly anchor: CanvasAnchor;
  private faceX = BAR_X;
  private readonly arrow: Phaser.GameObjects.Triangle;
  private reach = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly candles: CandlePos[],
    private readonly worldWidth: number,
  ) {
    this.bar = scene.add.graphics({ x: UI_OX, y: UI_OY }).setScrollFactor(0).setDepth(100);
    this.anchor = new CanvasAnchor(scene);
    const face = document.createElement("img");
    face.src = "assets/face.webp";
    face.className = "progress-face";
    face.alt = "";
    this.anchor.add(face, (s) => {
      face.style.left = `${this.faceX * s}px`;
      face.style.top = `${BAR_Y * s}px`;
      face.style.width = face.style.height = `${FACE_D * s}px`;
    });
    this.arrow = scene.add
      .triangle(0, 0, 0, -7, 11, 0, 0, 7, 0xffd36a)
      .setStrokeStyle(1, 0x1a1020)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    scene.tweens.add({ targets: this.arrow, alpha: 0.45, duration: 450, yoyo: true, repeat: -1 });
  }

  update(playerX: number, camera: Phaser.Cameras.Scene2D.Camera, collected: ReadonlySet<number>, gateTouched: boolean): void {
    this.reach = Math.max(this.reach, playerX);
    const toBar = (x: number) => BAR_X + (Math.min(x, this.worldWidth) / this.worldWidth) * BAR_W;
    const missing = this.candles.filter((c) => !collected.has(c.index));

    this.bar.clear();
    this.bar.fillStyle(0x1a1020, 0.8).fillRect(BAR_X - 4, BAR_Y - 5, BAR_W + 8, 10);
    this.bar.fillStyle(0x4a4478, 1).fillRect(BAR_X, BAR_Y - 1, BAR_W, 2);
    for (const c of missing) {
      if (gateTouched || c.x < this.reach - MISSED_MARGIN) this.bar.fillStyle(0xffd36a, 1).fillRect(toBar(c.x) - 1, BAR_Y - 3, 2, 6);
    }
    this.faceX = toBar(playerX);
    this.anchor.layout();

    const target = gateTouched ? nearest(missing, playerX) : undefined;
    const view = camera.worldView;
    if (!target || (target.x > view.left && target.x < view.right)) {
      this.arrow.setVisible(false);
      return;
    }
    const right = target.x > view.right;
    const screenY = Phaser.Math.Clamp(target.y - view.top, 30, GAME_HEIGHT - 30);
    this.arrow.setVisible(true).setPosition((right ? GAME_WIDTH - EDGE : EDGE) + UI_OX, screenY + UI_OY).setRotation(right ? 0 : Math.PI);
  }
}

function nearest(list: CandlePos[], x: number): CandlePos | undefined {
  let best: CandlePos | undefined;
  for (const c of list) if (!best || Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
  return best;
}
