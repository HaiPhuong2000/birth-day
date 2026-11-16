import Phaser from 'phaser';
import { hiRes } from '../util/hires';
import { FRAME, GAME_HEIGHT, GAME_WIDTH, HEAD_SS, MAP_KEYS, PLAYER, SCENES, TEX } from '../config';
import type { SceneKey } from '../config';

const ART = 'assets/art';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Preload);
  }

  preload(): void {
    hiRes(this);
    this.drawLoadingBar();
    const failed: string[] = [];
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => failed.push(file.url as string));
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (failed.length > 0) this.showError(failed);
    });

    const sheet = (key: string, file: string, w: number, h: number) =>
      this.load.spritesheet(key, `${ART}/${file}`, { frameWidth: w, frameHeight: h });
    sheet(TEX.tiles, 'tiles.png', 18, 18);
    sheet(TEX.player, 'player.png', 24, 24);
    sheet(TEX.creatures, 'creatures.png', 24, 24);
    sheet(TEX.candle, 'candle.png', 16, 16);
    sheet(TEX.block, 'block.png', 18, 18);
    sheet(TEX.banner, 'banner.png', 18, 36);
    sheet(TEX.projectiles, 'projectiles.png', 16, 16);
    sheet(TEX.voldemort, 'voldemort.png', 32, 48);
    this.load.image(TEX.door, `${ART}/door.png`);
    this.load.image(TEX.photoFrame, `${ART}/frame.png`);
    this.load.image(TEX.bgFar, `${ART}/bg-far.png`);
    this.load.image(TEX.bgNear, `${ART}/bg-near.png`);

    this.load.image(TEX.face, 'assets/face.webp');
    this.load.json('content', 'assets/content.json');
    this.load.tilemapTiledJSON(MAP_KEYS.level, 'assets/map/level.json');
    this.load.tilemapTiledJSON(MAP_KEYS.arena, 'assets/map/arena.json');
  }

  create(): void {
    hiRes(this);
    if (this.children.getByName('error')) return;
    this.createHead();
    this.createAnimations();
    this.scene.start(this.firstScene());
  }

  private drawLoadingBar(): void {
    const w = 240;
    const x = (GAME_WIDTH - w) / 2;
    const y = GAME_HEIGHT / 2;
    this.add.text(GAME_WIDTH / 2, y - 22, 'Đang tải...', { fontFamily: 'monospace', fontSize: '12px', color: '#f2d27a' }).setOrigin(0.5);
    this.add.rectangle(x, y, w, 10, 0x1a1633).setOrigin(0, 0.5).setStrokeStyle(1, 0xf2d27a);
    const fill = this.add.rectangle(x + 1, y, 0, 6, 0xc0392b).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => (fill.width = (w - 2) * p));
  }

  private showError(urls: string[]): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, `Thiếu file:\n${urls.join('\n')}\n\nchạy: npm run assets && npm run art && npm run map`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ff8888',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setName('error');
  }

  /** Trang's face, circle-cropped with a dark outline, at the in-game head size. */
  private createHead(): void {
    const d = PLAYER.headSize * HEAD_SS;
    const src = this.textures.get(TEX.face).getSourceImage() as HTMLImageElement;
    const canvas = this.textures.createCanvas(TEX.head, d, d);
    if (!canvas) throw new Error("head texture already exists");
    const ctx = canvas.getContext();
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.beginPath();
    ctx.arc(d / 2, d / 2, d / 2 - HEAD_SS, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(src, 0, 0, d, d);
    ctx.restore();
    ctx.lineWidth = 1.5 * HEAD_SS;
    ctx.strokeStyle = "#1a1020";
    ctx.beginPath();
    ctx.arc(d / 2, d / 2, d / 2 - 0.75 * HEAD_SS, 0, Math.PI * 2);
    ctx.stroke();
    canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  private createAnimations(): void {
    const a = this.anims;
    const loop = (key: string, texture: string, frames: readonly number[], frameRate: number) =>
      a.create({ key, frames: a.generateFrameNumbers(texture, { frames: [...frames] }), frameRate, repeat: -1 });
    loop('player-walk', TEX.player, FRAME.player.walk, 8);
    loop('pixie-walk', TEX.creatures, FRAME.pixie.walk, 8);
    loop('niffler-walk', TEX.creatures, FRAME.niffler.walk, 6);
    loop('candle-flicker', TEX.candle, FRAME.candle, 6);
    loop('block-pulse', TEX.block, [FRAME.block.idle, FRAME.block.glow], 2);
    loop('boss-idle', TEX.voldemort, FRAME.boss.idle, 3);
  }

  /** Dev shortcut: ?scene=Level|Boss|Ending skips the login screen. */
  private firstScene(): SceneKey {
    if (import.meta.env.DEV) {
      const wanted = new URLSearchParams(location.search).get('scene');
      const match = Object.values(SCENES).find((s) => s === wanted);
      if (match && match !== SCENES.Boot && match !== SCENES.Preload) return match;
    }
    return SCENES.Login;
  }
}
