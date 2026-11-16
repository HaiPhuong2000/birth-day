import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';

/**
 * DOM elements pinned to a point of the game canvas. The canvas renders at a tiny pixel-art resolution and is
 * upscaled, so anything that must stay crisp (text, faces) is a DOM node positioned over it instead.
 */
export class CanvasAnchor {
  private readonly items: { node: HTMLElement; place: (scale: number) => void }[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    const onResize = (): void => this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    window.addEventListener('resize', onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      window.removeEventListener('resize', onResize);
      for (const i of this.items) i.node.remove();
    });
  }

  /** `place(scale)` sets left/top/size from game px using `scale` (screen px per game px); the node is offset to the canvas. */
  add<T extends HTMLElement>(node: T, place: (scale: number) => void): T {
    node.classList.add('canvas-anchor');
    document.body.append(node);
    this.items.push({ node, place });
    this.layout();
    return node;
  }

  layout(): void {
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const scale = rect.width / GAME_WIDTH;
    for (const i of this.items) {
      i.place(scale);
      const s = i.node.style;
      s.left = `${rect.left + parseFloat(s.left || '0')}px`;
      s.top = `${rect.top + parseFloat(s.top || '0')}px`;
    }
  }
}

