import Phaser from 'phaser';
import { TOTAL_CANDLES } from '../config';
import { CanvasAnchor } from './canvasAnchor';
import { el } from './dom';

/** Candle counter (top-left), a DOM overlay so the text stays crisp. */
export class Hud {
  private readonly count: HTMLElement;

  constructor(scene: Phaser.Scene, collected: number) {
    this.count = el('span');
    const root = el('div', 'hud-candles');
    root.append(el('span', 'hud-candles__icon', '🕯️'), this.count);
    new CanvasAnchor(scene).add(root, (s) => {
      root.style.left = `${4 * s}px`;
      root.style.top = `${3 * s}px`;
      root.style.fontSize = `${Math.max(14, 11 * s)}px`;
    });
    this.setCandles(collected);
  }

  setCandles(n: number): void {
    this.count.textContent = `${n}/${TOTAL_CANDLES}`;
  }
}
