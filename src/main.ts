import Phaser from 'phaser';
import './styles.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { BossScene } from './scenes/BossScene';
import { EndingScene } from './scenes/EndingScene';
import { LevelScene } from './scenes/LevelScene';
import { LoginScene } from './scenes/LoginScene';
import { PreloadScene } from './scenes/PreloadScene';
import { setupMobile } from './ui/mobile';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [BootScene, PreloadScene, LoginScene, LevelScene, BossScene, EndingScene],
});

setupMobile(game);
