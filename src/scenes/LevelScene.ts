import Phaser from 'phaser';
import { BGM, playLoop, sfx } from '../audio/chiptune';
import { ENEMY_KINDS, MAP_KEYS, SCENES, TEX, TOTAL_CANDLES, TOTAL_FRAMES, TOTAL_MILESTONES } from '../config';
import type { EnemyKind } from '../config';
import { assignPhotos } from '../content/assignPhotos';
import { getContent } from '../content/content';
import { PhotoLoader, photoKey, photoUrl } from '../content/PhotoLoader';
import { Banner } from '../objects/Banner';
import { Candle } from '../objects/Candle';
import { Enemy } from '../objects/Enemy';
import { PhotoFrame } from '../objects/PhotoFrame';
import type { Player } from '../objects/Player';
import { QuestionBlock } from '../objects/QuestionBlock';
import { gameState } from '../state';
import type { PhotoEntry } from '../types/content';
import { CandleGuide } from '../ui/CandleGuide';
import type { CandlePos } from '../ui/CandleGuide';
import { GateDialog } from '../ui/GateDialog';
import { Hud } from '../ui/Hud';
import { MuteButton } from '../ui/MuteButton';
import { touchControls } from '../ui/TouchControls';
import { PhotoModal } from '../ui/PhotoModal';
import { numProp, PlatformerScene, strProp } from './PlatformerScene';

type TiledObject = Phaser.Types.Tilemaps.TiledObject;

/** Frames react when the player is within this many px horizontally. */
const FRAME_NEAR = 44;
/** ms of grace after closing the gate dialog before the door reacts again. */
const GATE_COOLDOWN = 2000;
const BLOCK_COOLDOWN = 1000;

interface CandleInfo extends CandlePos {
  zone: number;
}

/** The long chronological level: TOTAL_MILESTONES (11) zones, each starting at a banner checkpoint and ending at a ?-block. */
export class LevelScene extends PlatformerScene {
  private hud!: Hud;
  private guide!: CandleGuide;
  private modal!: PhotoModal;
  private gate!: GateDialog;
  private photos!: PhotoLoader;
  private banners: Banner[] = [];
  private frames: PhotoFrame[] = [];
  private candleInfo: CandleInfo[] = [];
  private zoneFiles = new Map<number, string[]>();
  private currentZone = -1;
  private door!: Phaser.GameObjects.Image;
  private overlayOpen = false;
  private blockCooldown = 0;
  private gateCooldown = 0;

  constructor() {
    super(SCENES.Level);
  }

  init(): void {
    // The scene instance is reused on replay: reset everything create() fills.
    this.banners = [];
    this.frames = [];
    this.candleInfo = [];
    this.zoneFiles = new Map();
    this.overlayOpen = false;
    this.currentZone = -1;
    this.blockCooldown = 0;
    this.gateCooldown = 0;
    if (import.meta.env.DEV) {
      // Dev shortcuts: ?cp=N (start at zone N), ?candles=N (pre-collect N), ?x=PX (spawn at world x).
      const q = new URLSearchParams(location.search);
      const cp = Number(q.get('cp'));
      if (Number.isInteger(cp) && cp > 0) gameState.checkpoint = cp;
      const n = Number(q.get('candles'));
      if (Number.isInteger(n) && n > 0) for (let i = 0; i < Math.min(n, TOTAL_CANDLES); i++) gameState.candles.add(i);
    }
  }

  create(): void {
    this.buildWorld(MAP_KEYS.level);
    const content = getContent(this);
    this.photos = new PhotoLoader(this);
    this.modal = new PhotoModal();
    this.gate = new GateDialog();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.modal.destroy();
      this.gate.destroy();
    });

    const checkpoints = this.objectsOf('checkpoints');
    const door = this.objectsOf('goal')[0]!;
    const start = checkpoints.find((o) => numProp(o, 'zone') === gameState.checkpoint) ?? checkpoints[0]!;
    let spawn = { x: start.x!, y: start.y! };
    const devX = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('x')) : 0;
    if (devX > 0) spawn = { x: devX, y: door.y! + door.height! }; // dev: ?x=PX spawns on flat ground at world x
    this.spawnPlayer(spawn);

    const blockObjs = this.objectsOf('blocks').sort((a, b) => numProp(a, 'index') - numProp(b, 'index'));
    const frameObjs = this.objectsOf('frames').sort((a, b) => numProp(a, 'index') - numProp(b, 'index'));
    if (blockObjs.length !== TOTAL_MILESTONES || frameObjs.length !== TOTAL_FRAMES) {
      console.warn(`Map has ${blockObjs.length} blocks / ${frameObjs.length} frames, expected ${TOTAL_MILESTONES} / ${TOTAL_FRAMES} (run \`npm run assets\`)`);
    }
    const assigned = assignPhotos(
      [
        ...blockObjs.map((o) => ({ kind: 'block' as const, x: o.x! })),
        ...frameObjs.map((o) => ({ kind: 'frame' as const, x: o.x! })),
      ],
      content.photos,
    );

    this.createBanners(checkpoints);
    this.createBlocks(blockObjs, assigned.slice(0, blockObjs.length));
    this.createFrames(frameObjs, assigned.slice(blockObjs.length));
    this.createCandles();
    this.createEnemies();
    this.createDoor(door);

    this.hud = new Hud(this, gameState.candles.size);
    this.guide = new CandleGuide(this, this.candleInfo, this.map.widthInPixels);
    new MuteButton(this);
    playLoop(BGM);
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);
    const px = this.player.x;
    const zone = this.zoneAt(px);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.prefetch(zone);
      this.prefetch(zone + 1);
    }
    for (const f of this.frames) {
      f.setFocused(this.player.alive && Math.abs(px - f.x) < FRAME_NEAR && Math.abs(this.player.y - f.y) < 90);
    }
    this.guide.update(px, this.cameras.main, gameState.candles, gameState.gateTouched);
  }

  // ---- world objects ------------------------------------------------------

  private createBanners(checkpoints: TiledObject[]): void {
    const group = this.physics.add.staticGroup();
    for (const o of checkpoints) {
      const banner = new Banner(this, o.x!, o.y!, numProp(o, 'zone'));
      group.add(banner);
      if (banner.zone <= gameState.checkpoint) banner.activate(false);
      this.banners.push(banner);
    }
    this.physics.add.overlap(this.player, group, (_p, b) => {
      const banner = b as unknown as Banner;
      if (banner.zone <= gameState.checkpoint && banner.isActive) return;
      if (!banner.isActive) sfx.checkpoint();
      banner.activate();
      gameState.checkpoint = Math.max(gameState.checkpoint, banner.zone);
      if (banner.zone === gameState.checkpoint) this.spawn = { x: banner.x, y: banner.y };
    });
  }

  private createBlocks(objs: TiledObject[], photos: (PhotoEntry | undefined)[]): void {
    const group = this.physics.add.staticGroup();
    objs.forEach((o, i) => {
      group.add(new QuestionBlock(this, o.x!, o.y!, numProp(o, 'index'), photos[i]));
      this.addZoneFile(numProp(o, 'zone'), photos[i]);
    });
    this.physics.add.collider(this.player, group, (p, b) => {
      if ((p as unknown as Player).body.touching.up) this.onBlockHit(b as unknown as QuestionBlock);
    });
  }

  private createFrames(objs: TiledObject[], photos: (PhotoEntry | undefined)[]): void {
    objs.forEach((o, i) => {
      this.frames.push(new PhotoFrame(this, o.x!, o.y!, numProp(o, 'index'), photos[i]));
      this.addZoneFile(numProp(o, 'zone'), photos[i]);
    });
  }

  private createCandles(): void {
    const group = this.physics.add.group({ allowGravity: false, immovable: true });
    for (const o of this.objectsOf('candles')) {
      const info = { index: numProp(o, 'index'), x: o.x!, y: o.y!, zone: numProp(o, 'zone') };
      this.candleInfo.push(info);
      if (!gameState.candles.has(info.index)) group.add(new Candle(this, info.x, info.y, info.index));
    }
    this.physics.add.overlap(this.player, group, (_p, c) => {
      const candle = c as unknown as Candle;
      gameState.candles.add(candle.index);
      this.hud.setCandles(gameState.candles.size);
      sfx.candle();
      candle.collect();
    });
    if (this.candleInfo.length !== TOTAL_CANDLES) console.warn(`Map has ${this.candleInfo.length} candles, expected ${TOTAL_CANDLES}`);
  }

  private createEnemies(): void {
    const enemies = this.physics.add.group({ runChildUpdate: true });
    for (const o of this.objectsOf('enemies')) {
      const kind = strProp(o, 'kind');
      if (!(kind in ENEMY_KINDS)) throw new Error(`unknown enemy kind ${kind}`);
      enemies.add(new Enemy(this, o.x!, o.y!, kind as EnemyKind, this.solidAt));
    }
    this.physics.add.collider(enemies, this.groundLayer);
    this.physics.add.collider(enemies, this.platformLayer);
    this.physics.add.overlap(this.player, enemies, (p, e) => this.onEnemyContact(p as unknown as Player, e as unknown as Enemy));
  }

  private createDoor(door: TiledObject): void {
    this.door = this.add.image(door.x!, door.y!, TEX.door).setOrigin(0).setDepth(1);
    const exit = this.add.zone(door.x! + door.width! / 2, door.y! + door.height! / 2, door.width!, door.height!);
    this.physics.add.existing(exit, true);
    this.physics.add.overlap(this.player, exit, () => this.onDoorTouch());
  }

  private onEnemyContact(player: Player, enemy: Enemy): void {
    if (!enemy.alive || !player.alive) return;
    const stomped = player.body.velocity.y >= 0 && player.body.prev.y + player.body.height <= enemy.body!.top + 4;
    if (stomped) {
      enemy.squash();
      player.bounce();
    } else if (!player.isInvulnerable(this.time.now)) {
      this.killPlayer();
    }
  }

  // ---- photos -------------------------------------------------------------

  private addZoneFile(zone: number, photo: PhotoEntry | undefined): void {
    if (!photo) return;
    const list = this.zoneFiles.get(zone) ?? [];
    list.push(photo.file);
    this.zoneFiles.set(zone, list);
  }

  private zoneAt(x: number): number {
    let zone = 0;
    for (const b of this.banners) if (b.x <= x) zone = Math.max(zone, b.zone);
    return zone;
  }

  /** Lazy-load a zone's photos, then fill its frame thumbnails. */
  private prefetch(zone: number): void {
    const files = this.zoneFiles.get(zone);
    if (!files) return;
    void this.photos.ensure(files).then(() => {
      if (this.sys.isActive() || this.sys.isPaused()) for (const f of this.frames) f.showThumbnail();
    });
  }

  private onBlockHit(block: QuestionBlock): void {
    if (this.overlayOpen || this.time.now < this.blockCooldown) return;
    const kind = block.bump();
    if (!kind) return;
    sfx.block();
    if (block.photo) void this.revealPhoto(block, block.photo, kind === 'first');
  }

  private async revealPhoto(block: QuestionBlock, photo: PhotoEntry, first: boolean): Promise<void> {
    this.overlayOpen = true;
    await this.photos.ensure([photo.file]);
    if (first) await this.popOut(block, photo);
    this.pauseWith((done) =>
      this.modal.show({ src: photoUrl(photo.file), label: photo.label, caption: photo.caption, width: photo.width, height: photo.height }, () => {
        this.blockCooldown = this.time.now + BLOCK_COOLDOWN;
        done();
      }),
    );
  }

  /** The photo flies out of the box before the modal opens. */
  private popOut(block: QuestionBlock, photo: PhotoEntry): Promise<void> {
    const key = photoKey(photo.file);
    if (!this.textures.exists(key)) return Promise.resolve();
    const img = this.add.image(block.x + 9, block.y + 9, key).setDepth(11);
    const fit = 22 / Math.max(img.width, img.height);
    return new Promise((resolve) => {
      this.tweens.add({
        targets: img,
        y: block.y - 28,
        scale: { from: fit * 0.3, to: fit },
        angle: { from: -15, to: 0 },
        duration: 450,
        ease: 'Back.easeOut',
        onComplete: () => {
          img.destroy();
          resolve();
        },
      });
    });
  }

  // ---- candle gate --------------------------------------------------------

  private onDoorTouch(): void {
    if (!this.player.alive || this.overlayOpen || this.time.now < this.gateCooldown) return;
    const missing = TOTAL_CANDLES - gameState.candles.size;
    this.overlayOpen = true;
    if (missing <= 0) {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.Boss));
      return;
    }
    gameState.gateTouched = true;
    this.tweens.add({ targets: this.door, x: this.door.x + 2, duration: 50, yoyo: true, repeat: 5 });
    this.time.delayedCall(450, () => {
      this.pauseWith((done) =>
        this.gate.show(
          missing,
          () => {
            done();
            this.teleportToFirstMissing();
          },
          () => {
            this.player.body.setVelocityX(-120);
            this.gateCooldown = this.time.now + GATE_COOLDOWN;
            done();
          },
        ),
      );
    });
  }

  /** "Dẫn đường": jump back to the banner of the zone holding the first missing candle. */
  private teleportToFirstMissing(): void {
    const first = this.candleInfo.filter((c) => !gameState.candles.has(c.index)).sort((a, b) => a.index - b.index)[0];
    const banner = first && this.banners.find((b) => b.zone === first.zone);
    if (!banner) {
      this.overlayOpen = false;
      return;
    }
    this.overlayOpen = true;
    this.gateCooldown = this.time.now + GATE_COOLDOWN;
    const cam = this.cameras.main;
    cam.fadeOut(250, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      banner.activate();
      gameState.checkpoint = banner.zone;
      this.spawn = { x: banner.x, y: banner.y };
      this.player.respawn(banner.x, banner.y, this.time.now, 800);
      cam.centerOn(this.player.x, this.player.y);
      cam.fadeIn(250, 0, 0, 0);
      this.overlayOpen = false;
    });
  }

  /** Pause the scene while a DOM overlay is open; `open` receives the callback that resumes. */
  private pauseWith(open: (done: () => void) => void): void {
    touchControls.releaseAll();
    this.scene.pause();
    open(() => {
      this.scene.resume();
      this.input.keyboard?.resetKeys();
      this.overlayOpen = false;
    });
  }
}
