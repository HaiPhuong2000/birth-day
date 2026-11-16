import Phaser from 'phaser';
import { TEX, TOTAL_CANDLES } from '../config';

const STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '10px',
  color: '#ffe9a8',
  stroke: '#1a1020',
  strokeThickness: 3,
};

/** Candle counter (top-left). */
export class Hud {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, collected: number) {
    scene.add.image(10, 14, TEX.candle, 0).setScrollFactor(0).setDepth(100);
    this.text = scene.add.text(20, 8, '', STYLE).setScrollFactor(0).setDepth(100);
    this.setCandles(collected);
  }

  setCandles(n: number): void {
    this.text.setText(`${n}/${TOTAL_CANDLES}`);
  }
}
