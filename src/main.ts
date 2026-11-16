import Phaser from 'phaser';
import './styles.css';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from './config';
import { BootScene } from './scenes/BootScene';
import { BossScene } from './scenes/BossScene';
import { EndingScene } from './scenes/EndingScene';
import { LevelScene } from './scenes/LevelScene';
import { LoginScene } from './scenes/LoginScene';
import { PreloadScene } from './scenes/PreloadScene';
import { setupMobile } from './ui/mobile';

// Text is rasterised at the render scale so it stays crisp.
const TextStyleProto = Phaser.GameObjects.TextStyle.prototype;
const setStyle = TextStyleProto.setStyle;
TextStyleProto.setStyle = function (style, updateText, setDefaults) {
  return setStyle.call(this, { resolution: RENDER_SCALE, ...style }, updateText, setDefaults);
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
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
