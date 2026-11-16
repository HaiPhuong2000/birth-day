import Phaser from 'phaser';
import { SCENES } from '../config';

/** Nothing to load yet: exists so Preload can rely on a ready canvas and scale manager. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Boot);
  }

  create(): void {
    this.scene.start(SCENES.Preload);
  }
}
