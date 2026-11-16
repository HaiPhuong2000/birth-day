import Phaser from 'phaser';
import { CAMERA, GAME_HEIGHT, GAME_WIDTH, PLAYER, RESPAWN, SKY_COLOR, TEX } from '../config';
import { sfx } from '../audio/chiptune';
import { GameInput } from '../input/GameInput';
import { Player } from '../objects/Player';
import { touchControls } from '../ui/TouchControls';

export interface Point {
  x: number;
  y: number;
}

/**
 * Shared side-scroller plumbing for Level and Boss: Tiled map + collision layers, 2-layer parallax,
 * player, camera, and death/respawn (fade -> respawn at `spawn` after RESPAWN.delay).
 * Subclasses create their objects after `buildWorld` + `spawnPlayer`.
 */
export abstract class PlatformerScene extends Phaser.Scene {
  protected map!: Phaser.Tilemaps.Tilemap;
  protected groundLayer!: Phaser.Tilemaps.TilemapLayer;
  protected platformLayer!: Phaser.Tilemaps.TilemapLayer;
  protected player!: Player;
  protected controls!: GameInput;
  /** Respawn point: x and the ground surface y (feet). */
  protected spawn: Point = { x: 0, y: 0 };

  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;

  /** Called just before the player is put back at `spawn`. */
  protected onRespawn(): void {}

  protected buildWorld(mapKey: string): void {
    this.cameras.main.setBackgroundColor(SKY_COLOR);
    this.bgFar = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, TEX.bgFar).setOrigin(0).setScrollFactor(0).setDepth(-30);
    this.bgNear = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, TEX.bgNear).setOrigin(0).setScrollFactor(0).setDepth(-29);

    this.map = this.make.tilemap({ key: mapKey });
    const tileset = this.map.addTilesetImage('castle-tiles', TEX.tiles);
    if (!tileset) throw new Error('tileset castle-tiles missing from map');
    const layer = (name: string, depth: number) => {
      const l = this.map.createLayer(name, tileset);
      if (!l) throw new Error(`tile layer ${name} missing from map`);
      return l.setDepth(depth);
    };
    layer('decor', -5);
    this.groundLayer = layer('ground', 0);
    this.platformLayer = layer('platforms', 0);
    this.groundLayer.setCollisionByExclusion([-1]);
    this.platformLayer.setCollisionByExclusion([-1]);
    // One-way: floating wooden platforms only stop a body landing from above.
    this.platformLayer.forEachTile((t) => {
      t.collideDown = false;
      t.collideLeft = false;
      t.collideRight = false;
    });

    const { widthInPixels: w, heightInPixels: h } = this.map;
    this.physics.world.gravity.y = PLAYER.gravity;
    this.physics.world.setBounds(0, 0, w, h + RESPAWN.pitMargin * 2);
    this.physics.world.setBoundsCollision(true, true, true, false);
    this.cameras.main.setBounds(0, 0, w, h);
  }

  /** `touchAttack`: show the wand button on touch devices (boss arena only). */
  protected spawnPlayer(spawn: Point, touchAttack = false): void {
    this.spawn = spawn;
    this.controls = new GameInput(this);
    touchControls.show(this.controls, touchAttack);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => touchControls.hide());
    this.player = new Player(this, spawn.x, spawn.y - PLAYER.bodyHeight / 2 - 1, this.controls);
    this.physics.add.collider(this.player, this.groundLayer);
    this.physics.add.collider(this.player, this.platformLayer);
    this.player.on('jump', sfx.jump);

    const cam = this.cameras.main;
    cam.startFollow(this.player, true, CAMERA.lerp, CAMERA.lerp);
    cam.setDeadzone(CAMERA.deadzoneWidth, CAMERA.deadzoneHeight);
    cam.centerOn(this.player.x, this.player.y);
    cam.fadeIn(RESPAWN.fadeIn, 0, 0, 0);
  }

  /** True if either tile layer has a tile at this world point (ledge detection for enemies). */
  protected readonly solidAt = (x: number, y: number): boolean =>
    this.groundLayer.hasTileAtWorldXY(x, y) || this.platformLayer.hasTileAtWorldXY(x, y);

  killPlayer(): void {
    if (!this.player.alive) return;
    this.player.die();
    sfx.die();
    this.cameras.main.fadeOut(RESPAWN.fadeOut, 0, 0, 0);
    this.time.delayedCall(RESPAWN.delay, () => this.respawn());
  }

  private respawn(): void {
    this.onRespawn();
    this.player.respawn(this.spawn.x, this.spawn.y, this.time.now, 1200);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.cameras.main.fadeIn(RESPAWN.fadeIn, 0, 0, 0);
  }

  update(time: number, delta: number): void {
    this.controls.poll();
    this.player.update(time, delta);
    if (this.player.alive && this.player.y > this.map.heightInPixels + RESPAWN.pitMargin) this.killPlayer();
    const sx = this.cameras.main.scrollX;
    this.bgFar.tilePositionX = Math.floor(sx * 0.05);
    this.bgNear.tilePositionX = Math.floor(sx * 0.2);
  }

  /** Objects of a Tiled object layer. */
  protected objectsOf(layer: string): Phaser.Types.Tilemaps.TiledObject[] {
    const l = this.map.getObjectLayer(layer);
    if (!l) throw new Error(`object layer ${layer} missing from map`);
    return l.objects;
  }
}

export function numProp(o: Phaser.Types.Tilemaps.TiledObject, name: string): number {
  const props = o.properties as { name: string; value: unknown }[] | undefined;
  const v = props?.find((p) => p.name === name)?.value;
  if (typeof v !== 'number') throw new Error(`object ${o.id} missing int property ${name}`);
  return v;
}

export function strProp(o: Phaser.Types.Tilemaps.TiledObject, name: string): string {
  const props = o.properties as { name: string; value: unknown }[] | undefined;
  const v = props?.find((p) => p.name === name)?.value;
  if (typeof v !== 'string') throw new Error(`object ${o.id} missing string property ${name}`);
  return v;
}
