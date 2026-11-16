/**
 * Generates public/assets/map/level.json (Tiled JSON, orthogonal, 18px tiles) from reusable chunks.
 * Run with: npm run map
 *
 * Tile layers:   decor (background), ground (solid), platforms (one-way, floating)
 * Object layers: blocks (TOTAL_MILESTONES = 12 ?-block slots), frames (TOTAL_FRAMES = 16 photo-frame slots),
 *                candles (TOTAL_CANDLES = 23), enemies, checkpoints (1 per zone), goal (door to the cake room)
 *
 * Zone i = [checkpoint][calm photo-frame stretch][challenges][?-block i]. The frame layout is derived
 * from public/assets/content.json (run `npm run assets` first): frames before block 0 sit in zone 0,
 * frames between milestone i-1 and i sit right after checkpoint i, frames after the last milestone sit
 * after the last block. Slots sorted by x therefore match the photo order for ANY choice of 12 milestones,
 * e.g. F F B0 B1 F B2 ... B11 F F F.
 *
 * Length budget: the whole level is ~1050 tiles (~18.9k px, ~3 min of pure travel). Zones are short and
 * their challenge stretches grow 42 -> 71 tiles so the difficulty still ramps. The frame stretches
 * (TOTAL_FRAMES x 9 tiles) are a fixed cost, wherever the milestones fall.
 *
 * Jump budget (see src/config.ts PLAYER): apex ~3.4 tiles, ~4.3 tiles of airtime at full speed.
 * Rules enforced below: pits <= 3 tiles, single step up <= 2 tiles, ?-blocks 4 tiles above ground.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { MAP_ROWS, TILE_SIZE as T, TOTAL_CANDLES, TOTAL_FRAMES, TOTAL_MILESTONES, TOTAL_PHOTOS } from '../src/config';
import type { Content } from '../src/types/content';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(root, 'public', 'assets', 'map');

const BASE = 11; // row of the ground surface on flat terrain
const MAX_PIT = 3;
const ZONES = TOTAL_MILESTONES;
/** One entry per zone, sums to TOTAL_CANDLES; the hardest (last) zone has the fewest. */
const CANDLES_PER_ZONE = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1];
if (CANDLES_PER_ZONE.length !== ZONES || CANDLES_PER_ZONE.reduce((a, b) => a + b, 0) !== TOTAL_CANDLES) {
  throw new Error(`CANDLES_PER_ZONE must have ${ZONES} entries summing to ${TOTAL_CANDLES}`);
}

// Tile indices in art/tiles.png (18px, 10 columns; see scripts/build-art.ts). Tiled gid = index + 1.
const TILE = {
  platform: { single: 0, left: 1, mid: 2, right: 3 },
  top: { single: 4, left: 5, mid: 6, right: 7 },
  body: { single: 8, left: 9, mid: 10, right: 11 },
  decor: [12, 13, 14, 15],
  sign: 16,
} as const;

type Prop = Record<string, string | number | boolean>;
interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0;
  visible: true;
  point?: true;
  properties: { name: string; type: string; value: string | number | boolean }[];
}

function props(p: Prop): TiledObject['properties'] {
  return Object.entries(p).map(([name, value]) => ({
    name,
    type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string',
    value,
  }));
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class LevelBuilder {
  /** Ground surface row per column, -1 = pit. */
  readonly top: number[] = [];
  readonly platforms: { col: number; row: number; len: number }[] = [];
  readonly layers: Record<'blocks' | 'frames' | 'candles' | 'enemies' | 'checkpoints' | 'goal' | 'bossPoints', TiledObject[]> = {
    blocks: [],
    frames: [],
    candles: [],
    enemies: [],
    checkpoints: [],
    goal: [],
    bossPoints: [],
  };
  g = BASE;
  zone = 0;
  private nextId = 1;
  private readonly zoneCandles = new Array<number>(ZONES).fill(0);

  /** `frameCounts[z]` = photo frames placed after zone z's checkpoint (before its block). */
  constructor(private readonly frameCounts: readonly number[] = []) {}

  get cursor(): number {
    return this.top.length;
  }

  // ---- terrain primitives -------------------------------------------------

  run(len: number): number {
    const start = this.cursor;
    for (let i = 0; i < len; i++) this.top.push(this.g);
    return start;
  }

  pit(len: number): number {
    if (len > MAX_PIT) throw new Error(`pit ${len} > ${MAX_PIT}`);
    const start = this.cursor;
    for (let i = 0; i < len; i++) this.top.push(-1);
    return start;
  }

  /** A pit wider than a jump, crossed with one-way platforms at row `g + dRow`. */
  platformPit(spans: { gap: number; dRow: number }[], width = 2): void {
    this.pit(spans[0]!.gap);
    for (let i = 0; i < spans.length; i++) {
      const { dRow } = spans[i]!;
      this.platforms.push({ col: this.cursor, row: this.g + dRow, len: width });
      for (let k = 0; k < width; k++) this.top.push(-1);
      const next = spans[i + 1];
      this.pit(next ? next.gap : 0);
    }
  }

  up(n: number): void {
    if (n > 2) throw new Error('step up > 2 tiles');
    this.g -= n;
  }

  down(n: number): void {
    this.g += n;
  }

  /** Raised block of ground: step up h tiles, w wide, step back down. */
  bump(w: number, h: number): number {
    this.up(h);
    const c = this.run(w);
    this.down(h);
    return c;
  }

  // ---- object helpers -----------------------------------------------------

  private surfaceY(col: number): number {
    const row = this.top[col];
    if (row === undefined || row < 0) throw new Error(`no ground at col ${col}`);
    return row * T;
  }

  private add(layer: keyof LevelBuilder['layers'], name: string, o: Omit<TiledObject, 'id' | 'name' | 'type' | 'rotation' | 'visible'>): void {
    this.layers[layer].push({ id: this.nextId++, name, type: layer, rotation: 0, visible: true, ...o });
  }

  /** Candle with its feet `h` tiles above the surface at `col` (h=0 on the path, >=2 needs a jump). */
  candle(col: number, h: number, surfaceRow?: number): void {
    const y = (surfaceRow === undefined ? this.surfaceY(col) : surfaceRow * T) - h * T;
    this.zoneCandles[this.zone]!++;
    this.add('candles', 'candle', {
      x: col * T + T / 2,
      y,
      width: 0,
      height: 0,
      point: true,
      properties: props({ zone: this.zone, needsJump: h >= 2 }),
    });
  }

  enemy(col: number, kind: 'pixie' | 'niffler'): void {
    this.add('enemies', kind, {
      x: col * T + T / 2,
      y: this.surfaceY(col),
      width: 0,
      height: 0,
      point: true,
      properties: props({ kind, zone: this.zone }),
    });
  }

  checkpoint(col: number): void {
    this.add('checkpoints', 'checkpoint', {
      x: col * T + T / 2,
      y: this.surfaceY(col),
      width: 0,
      height: 0,
      point: true,
      properties: props({ zone: this.zone }),
    });
  }

  /** ?-block slot: 1 tile, 4 tiles above ground (3 free tiles beneath, walkable underneath). */
  block(col: number): void {
    this.add('blocks', 'block', {
      x: col * T,
      y: this.surfaceY(col) - 4 * T,
      width: T,
      height: T,
      properties: props({ zone: this.zone, index: this.layers.blocks.length }),
    });
  }

  /** Photo-frame slot: 2x2 tiles hung on the background, bottom 3 tiles above ground. */
  frame(col: number): void {
    this.add('frames', 'frame', {
      x: col * T,
      y: this.surfaceY(col) - 5 * T,
      width: 2 * T,
      height: 2 * T,
      properties: props({ zone: this.zone, index: this.layers.frames.length }),
    });
  }

  /** Great Hall door: 2x3 tiles, leads to the boss arena. */
  goal(col: number): void {
    this.add('goal', 'goal', {
      x: col * T,
      y: this.surfaceY(col) - 3 * T,
      width: 2 * T,
      height: 3 * T,
      properties: props({}),
    });
  }

  /** Boss teleport point; (x, y) = centre of the boss. `floorRow` is the arena floor surface row. */
  bossPoint(name: string, col: number, aboveFloor: number): void {
    this.add('bossPoints', name, {
      x: col * T + T / 2,
      y: this.surfaceY(col) - aboveFloor,
      width: 0,
      height: 0,
      point: true,
      properties: props({}),
    });
  }

  // ---- reusable chunks (every chunk ends at the same ground height it started) ----

  /** Flat ground. `candle` = column offset of a path candle. */
  flat(len: number, candle?: number): void {
    const c = this.run(len);
    if (candle !== undefined) this.candle(c + candle, 0);
  }

  /** Pit crossed by one jump; optional candle hovering at the arc's apex. */
  jumpPit(len: number, candle = false): void {
    const c = this.pit(len);
    if (candle) this.candle(c + Math.floor(len / 2), 2.5, this.g);
  }

  /** 1-high hurdle(s). Optional candle on top (path) or floating above (needs a jump). */
  hurdle(w: number, candle?: 'path' | 'jump'): void {
    const c = this.bump(w, 1);
    if (candle === 'path') this.candle(c + Math.floor(w / 2), 0, this.g - 1);
    if (candle === 'jump') this.candle(c + Math.floor(w / 2), 2);
  }

  /** Stairs up and back down, `n` steps of `w` columns. */
  stairs(n: number, w = 2, candle?: 'path' | 'jump'): void {
    let top = 0;
    for (let i = 0; i < n; i++) {
      this.up(1);
      top = this.run(w);
    }
    if (candle === 'path') this.candle(top, 0);
    if (candle === 'jump') this.candle(top, 2);
    for (let i = 0; i < n; i++) {
      this.down(1);
      this.run(w);
    }
  }

  /** Flat run patrolled by enemies, spread evenly. */
  patrol(len: number, kinds: ('pixie' | 'niffler')[], candle?: number): void {
    if (len < kinds.length * 5 + 1) throw new Error(`patrol of ${len} too short for ${kinds.length} enemies`);
    const c = this.run(len);
    kinds.forEach((k, i) => this.enemy(c + Math.round(((i + 0.5) * len) / kinds.length), k));
    if (candle !== undefined) this.candle(c + candle, 0);
  }

  /** Optional upper route: one-way platforms at +2 and +4 tiles over flat ground, candle on the top one. */
  upperRoute(len: number): void {
    const c = this.run(len);
    const mid = c + Math.floor(len / 2);
    this.platforms.push({ col: mid - 4, row: this.g - 2, len: 3 });
    this.platforms.push({ col: mid, row: this.g - 4, len: 3 });
    this.candle(mid + 1, 0, this.g - 4);
  }

  /** Series of narrow pillars separated by 2-tile pits. */
  pillars(n: number, pillarW = 2): void {
    for (let i = 0; i < n; i++) {
      this.pit(2);
      this.run(pillarW);
    }
  }

  // ---- zone scaffolding ---------------------------------------------------

  startZone(zone: number): void {
    this.zone = zone;
    const c = this.run(6);
    this.checkpoint(c + 2);
    this.frameStretch(this.frameCounts[zone] ?? 0);
    this.run(2);
  }

  /** Calm flat stretch with `n` photo frames. */
  frameStretch(n: number): void {
    for (let i = 0; i < n; i++) {
      const f = this.run(9);
      this.frame(f + 3);
    }
  }

  endZone(): void {
    const c = this.run(8);
    this.block(c + 4);
  }

  /** Total candles placed in a zone so far (checked against the quota). */
  candlesIn(zone: number): number {
    return this.zoneCandles[zone]!;
  }
}

// ---- zone recipes: difficulty rises (wider pits, more enemies, tighter platforming) ----

function buildZone(b: LevelBuilder, z: number): void {
  b.startZone(z);
  switch (z) {
    case 0: // "Hồi bé": gentle intro
      b.flat(6, 3);
      b.hurdle(2);
      b.flat(4);
      b.jumpPit(2, true);
      b.flat(5);
      b.patrol(12, ['pixie']);
      b.flat(3);
      b.stairs(2);
      break;
    case 1:
      b.flat(5, 3);
      b.jumpPit(2);
      b.flat(4);
      b.patrol(14, ['pixie', 'pixie'], 11);
      b.flat(3);
      b.jumpPit(3);
      b.flat(4);
      b.stairs(2);
      b.flat(3);
      break;
    case 2:
      b.flat(4, 2);
      b.jumpPit(3, true);
      b.flat(3);
      b.patrol(14, ['pixie', 'pixie']);
      b.flat(3);
      b.platformPit([{ gap: 2, dRow: 0 }, { gap: 2, dRow: 0 }]);
      b.flat(4);
      b.hurdle(3);
      b.flat(5);
      break;
    case 3:
      b.flat(4, 2);
      b.stairs(2, 2, 'jump');
      b.flat(3);
      b.jumpPit(3);
      b.flat(3);
      b.patrol(16, ['pixie', 'niffler']);
      b.flat(3);
      b.platformPit([{ gap: 2, dRow: 0 }, { gap: 3, dRow: -1 }]);
      b.flat(4);
      break;
    case 4:
      b.flat(4);
      b.jumpPit(3, true);
      b.flat(3);
      b.patrol(16, ['pixie', 'pixie', 'niffler']);
      b.flat(3);
      b.pillars(2);
      b.flat(3, 1);
      b.hurdle(2);
      b.platformPit([{ gap: 3, dRow: 0 }, { gap: 2, dRow: -1 }]);
      b.flat(4);
      break;
    case 5:
      b.flat(4, 2);
      b.hurdle(2);
      b.flat(3);
      b.patrol(16, ['niffler', 'pixie', 'niffler']);
      b.flat(3);
      b.jumpPit(3, true);
      b.flat(2);
      b.jumpPit(3);
      b.flat(4);
      b.platformPit([{ gap: 3, dRow: 0 }, { gap: 3, dRow: -1 }, { gap: 2, dRow: 0 }]);
      b.flat(3);
      break;
    case 6:
      b.flat(4);
      b.pillars(3);
      b.flat(4, 2);
      b.patrol(18, ['pixie', 'niffler', 'niffler']);
      b.flat(3);
      b.upperRoute(14);
      b.flat(3);
      b.hurdle(2);
      break;
    case 7:
      b.flat(4);
      b.stairs(2, 2, 'jump');
      b.flat(3, 1);
      b.patrol(18, ['pixie', 'niffler', 'niffler']);
      b.flat(3);
      b.platformPit([{ gap: 3, dRow: 0 }, { gap: 3, dRow: -1 }, { gap: 3, dRow: 0 }]);
      b.flat(4);
      b.jumpPit(3);
      b.flat(2);
      break;
    case 8:
      b.flat(4);
      b.pillars(3);
      b.flat(3, 1);
      b.patrol(18, ['niffler', 'pixie', 'niffler']);
      b.flat(3);
      b.jumpPit(3, true);
      b.flat(2);
      b.platformPit([{ gap: 3, dRow: 0 }, { gap: 3, dRow: -1 }, { gap: 3, dRow: 0 }, { gap: 2, dRow: 0 }]);
      break;
    case 9:
      b.flat(4);
      b.upperRoute(14);
      b.flat(3);
      b.patrol(20, ['pixie', 'niffler', 'niffler']);
      b.flat(3);
      b.platformPit([{ gap: 3, dRow: 0 }, { gap: 3, dRow: -1 }, { gap: 3, dRow: 0 }, { gap: 3, dRow: -1 }]);
      b.flat(2, 1);
      break;
    case 10:
      b.flat(4, 2);
      b.pillars(3);
      b.flat(3);
      b.patrol(20, ['niffler', 'pixie', 'niffler']);
      b.flat(3);
      b.stairs(3, 2, 'jump');
      b.flat(3);
      b.jumpPit(3);
      b.flat(2);
      b.jumpPit(3);
      b.flat(3);
      break;
    case 11: // final stretch: the hardest bit, then the door
      b.flat(4);
      b.pillars(3);
      b.flat(3);
      b.patrol(20, ['niffler', 'pixie', 'niffler']);
      b.flat(3);
      b.jumpPit(3, true);
      b.flat(2);
      b.platformPit([{ gap: 3, dRow: 0 }, { gap: 3, dRow: -1 }, { gap: 3, dRow: 0 }, { gap: 3, dRow: -1 }, { gap: 2, dRow: 0 }]);
      break;
    default:
      throw new Error(`no recipe for zone ${z}`);
  }
  b.endZone();
}

/**
 * Frames per zone from the photo sequence: entry k (0..TOTAL_MILESTONES-1) = non-milestone photos before milestone k,
 * entry TOTAL_MILESTONES = non-milestone photos after the last milestone.
 */
function frameCountsFrom(content: Content): number[] {
  const counts: number[] = [];
  let gap = 0;
  for (const p of content.photos) {
    if (p.milestone) {
      counts.push(gap);
      gap = 0;
    } else {
      gap += 1;
    }
  }
  counts.push(gap);
  if (counts.length !== TOTAL_MILESTONES + 1) {
    throw new Error(`content.json has ${counts.length - 1} milestones, expected ${TOTAL_MILESTONES}`);
  }
  return counts;
}

async function loadContent(): Promise<Content> {
  const file = path.join(root, 'public', 'assets', 'content.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Content;
  } catch {
    throw new Error(`${path.relative(root, file)} not found: run \`npm run assets\` first.`);
  }
}

function buildLevel(content: Content): LevelBuilder {
  const frameCounts = frameCountsFrom(content);
  const b = new LevelBuilder(frameCounts);
  b.run(6); // spawn pad before zone 0's checkpoint
  for (let z = 0; z < ZONES; z++) {
    buildZone(b, z);
    if (b.g !== BASE) throw new Error(`zone ${z} ended at row ${b.g}`);
    if (b.candlesIn(z) !== CANDLES_PER_ZONE[z]) {
      throw new Error(`zone ${z}: ${b.candlesIn(z)} candles, expected ${CANDLES_PER_ZONE[z]}`);
    }
  }
  // Photos after the last milestone hang between the last block and the door.
  b.frameStretch(frameCounts[ZONES]!);
  const doorCol = b.run(6) + 3;
  b.goal(doorCol);
  b.run(9);

  const L = b.layers;
  if (L.blocks.length !== TOTAL_MILESTONES) throw new Error(`blocks: ${L.blocks.length}`);
  const nonMilestones = content.photos.filter((p) => !p.milestone).length;
  if (content.photos.length !== TOTAL_PHOTOS || nonMilestones !== TOTAL_FRAMES) {
    throw new Error(`content.json has ${content.photos.length} photos / ${nonMilestones} non-milestones, expected ${TOTAL_PHOTOS} / ${TOTAL_FRAMES} (run \`npm run assets\`)`);
  }
  if (L.frames.length !== TOTAL_FRAMES) throw new Error(`frames: ${L.frames.length}, expected ${TOTAL_FRAMES}`);
  if (L.candles.length !== TOTAL_CANDLES) throw new Error(`candles: ${L.candles.length}`);
  if (L.checkpoints.length !== ZONES) throw new Error(`checkpoints: ${L.checkpoints.length}`);
  // Candles were created in x order; number them so game code can rely on `index`.
  L.candles.forEach((o, i) => o.properties.push(...props({ index: i })));
  return b;
}

/**
 * One-screen boss arena (27 cols = 486px): castle walls, flat floor, three side/centre platforms.
 * Boss points: left & right hover just above the floor, centre hovers above the middle platform.
 */
function buildArena(): LevelBuilder {
  const b = new LevelBuilder();
  b.g = 0;
  b.run(2);
  b.g = BASE;
  b.run(23);
  b.g = 0;
  b.run(2);
  b.g = BASE;
  b.platforms.push({ col: 3, row: BASE - 3, len: 3 });
  b.platforms.push({ col: 12, row: BASE - 3, len: 3 });
  b.platforms.push({ col: 21, row: BASE - 3, len: 3 });
  b.checkpoint(4);
  b.bossPoint('left', 8, 26);
  b.bossPoint('center', 13, 78);
  b.bossPoint('right', 19, 26);
  return b;
}

function toTiled(b: LevelBuilder, objectLayers: (keyof LevelBuilder['layers'])[]): unknown {
  const cols = b.top.length;
  const L = b.layers;

  // ---- rasterise tile layers ----
  const solid = (c: number, r: number): boolean => {
    if (c < 0 || c >= cols) return true; // map borders count as solid: no exposed edge art
    if (r >= MAP_ROWS) return true;
    const t = b.top[c]!;
    return t >= 0 && r >= t;
  };
  const ground = new Array<number>(cols * MAP_ROWS).fill(0);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < MAP_ROWS; r++) {
      if (!solid(c, r)) continue;
      const l = !solid(c - 1, r);
      const rt = !solid(c + 1, r);
      const set = r === 0 || !solid(c, r - 1) ? TILE.top : TILE.body;
      const idx = l && rt ? set.single : l ? set.left : rt ? set.right : set.mid;
      ground[r * cols + c] = idx + 1;
    }
  }

  const platforms = new Array<number>(cols * MAP_ROWS).fill(0);
  for (const p of b.platforms) {
    for (let k = 0; k < p.len; k++) {
      const set = TILE.platform;
      const idx = p.len === 1 ? set.single : k === 0 ? set.left : k === p.len - 1 ? set.right : set.mid;
      platforms[p.row * cols + p.col + k] = idx + 1;
    }
  }

  // Decor: sprinkle plants on flat surfaces, away from slots/objects.
  const rnd = mulberry32(2311);
  const decor = new Array<number>(cols * MAP_ROWS).fill(0);
  const occupied = new Set<number>();
  for (const key of ['candles', 'enemies', 'checkpoints', 'goal', 'blocks'] as const) {
    for (const o of L[key]) {
      const first = Math.floor(o.x / T);
      for (let c = first; c <= Math.floor((o.x + Math.max(o.width - 1, 0)) / T); c++) occupied.add(c);
    }
  }
  for (let c = 2; c < cols - 2; c++) {
    const t = b.top[c]!;
    if (t < 1 || occupied.has(c) || b.top[c - 1] !== t || b.top[c + 1] !== t) continue;
    if (rnd() < 0.12) decor[(t - 1) * cols + c] = TILE.decor[Math.floor(rnd() * TILE.decor.length)]! + 1;
  }
  for (const cp of L.checkpoints) {
    const c = Math.floor(cp.x / T) - 2;
    decor[(b.top[c]! - 1) * cols + c] = TILE.sign + 1;
  }

  const tileLayer = (id: number, name: string, data: number[]) => ({
    id,
    name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: cols,
    height: MAP_ROWS,
    opacity: 1,
    visible: true,
    data,
  });
  const objLayer = (id: number, name: keyof LevelBuilder['layers']) => ({
    id,
    name,
    type: 'objectgroup',
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    draworder: 'topdown',
    objects: L[name],
  });

  const json = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    compressionlevel: -1,
    width: cols,
    height: MAP_ROWS,
    tilewidth: T,
    tileheight: T,
    nextlayerid: 10,
    nextobjectid: 1000,
    tilesets: [
      {
        firstgid: 1,
        name: 'castle-tiles',
        image: '../art/tiles.png',
        imagewidth: 180,
        imageheight: 36,
        tilewidth: T,
        tileheight: T,
        tilecount: 20,
        columns: 10,
        margin: 0,
        spacing: 0,
      },
    ],
    layers: [
      tileLayer(1, 'decor', decor),
      tileLayer(2, 'ground', ground),
      tileLayer(3, 'platforms', platforms),
      ...objectLayers.map((name, i) => objLayer(4 + i, name)),
    ],
  };
  return json;
}


async function write(name: string, b: LevelBuilder, objectLayers: (keyof LevelBuilder['layers'])[]): Promise<void> {
  const file = path.join(OUT_DIR, `${name}.json`);
  await writeFile(file, JSON.stringify(toTiled(b, objectLayers)));
  const L = b.layers;
  const counts = objectLayers.map((n) => `${L[n].length} ${n}`).join(', ');
  console.log(`Wrote ${path.relative(root, file)}: ${b.cursor} cols (${b.cursor * T}px), ${counts}`);
}

await mkdir(OUT_DIR, { recursive: true });
const level = buildLevel(await loadContent());
await write('level', level, ['blocks', 'frames', 'candles', 'enemies', 'checkpoints', 'goal']);
console.log(
  `  ${level.layers.candles.filter((o) => o.properties.some((p) => p.name === 'needsJump' && p.value === true)).length} candles need a jump; ` +
    `zone starts at cols ${level.layers.checkpoints.map((c) => Math.round(c.x / T)).join(', ')}`,
);
await write('arena', buildArena(), ['checkpoints', 'bossPoints']);
