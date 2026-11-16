/**
 * Original pixel-art generator ("Hogwarts at night" mood, all art hand-authored in code).
 * Run with: npx tsx scripts/build-art.ts   ->  public/assets/art/*.png
 *
 * Deterministic: no clock, no Math.random (seeded mulberry32 only).
 * Crisp pixels only: alpha is always 0 or 255, no antialiasing.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { Sharp } from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'assets', 'art');

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const P = {
  K: '#0d0b1a', // universal outline
  woodD: '#3b2416',
  woodM: '#5a3a22',
  woodL: '#8a5a30',
  ironD: '#4a4f66',
  ironL: '#9aa3c4',
  stoneD: '#2c3048',
  stoneM: '#444a68',
  stoneL: '#5f6788',
  stoneH: '#8890b0',
  moss: '#3f6b45',
  mossL: '#6aa65c',
  frost: '#cfe6f8',
  gold: '#f2c64b',
  goldD: '#b8862a',
  goldL: '#fff0a0',
  red: '#b01e2a',
  redD: '#6e1220',
  redL: '#e0453f',
  cream: '#f2e6c4',
  creamD: '#c9b78f',
  flameO: '#ff8a2e',
  flameY: '#ffe066',
  white: '#ffffff',
  skin: '#f0c9a0',
  skinD: '#c8946a',
  pixie: '#2f9bff',
  pixieD: '#1b56c8',
  pixieL: '#a6dcff',
  green: '#41e070',
  greenM: '#1f9a48',
  greenD: '#0f4a2a',
  pale: '#dcdfd2',
  paleD: '#9ea39a',
  eye: '#ff2b2b',
  robeD: '#15111f',
  robeM: '#262038',
  robeL: '#3d3660',
  wand: '#b08a5a',
  pink: '#ffd0e0',
} as const;

/** One-letter legend used by the ASCII sprites. '.' is transparent. */
const LEGEND: Record<string, string> = {
  K: P.K,
  '1': P.woodD,
  '2': P.woodM,
  '3': P.woodL,
  i: P.ironD,
  I: P.ironL,
  a: P.stoneD,
  b: P.stoneM,
  c: P.stoneL,
  d: P.stoneH,
  m: P.moss,
  M: P.mossL,
  f: P.frost,
  g: P.gold,
  G: P.goldD,
  y: P.goldL,
  r: P.red,
  R: P.redD,
  q: P.redL,
  u: P.cream,
  U: P.creamD,
  o: P.flameO,
  e: P.flameY,
  w: P.white,
  h: P.skin,
  H: P.skinD,
  p: P.pixie,
  P: P.pixieD,
  l: P.pixieL,
  n: P.green,
  z: P.greenM,
  N: P.greenD,
  t: P.pale,
  T: P.paleD,
  E: P.eye,
  k: P.robeD,
  j: P.robeM,
  J: P.robeL,
  x: P.wand,
  s: P.pink,
};

// ---------------------------------------------------------------------------
// Tiny pixel toolkit
// ---------------------------------------------------------------------------

type Rgba = readonly [number, number, number, number];
const rgbaCache = new Map<string, Rgba>();

function hex(c: string): Rgba {
  let v = rgbaCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    rgbaCache.set(c, v);
  }
  return v;
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const f = (u: number, v: number) => Math.round(u + (v - u) * t);
  return '#' + [f(ar, br), f(ag, bg), f(ab, bb)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
/** Ordered-dither threshold in [0,1) for pixel (x,y). */
const bayer = (x: number, y: number) => (BAYER4[y & 3]![x & 3]! + 0.5) / 16;

class Img {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    /** When true, x wraps around (used for seamless backgrounds). */
    readonly wrapX = false,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }

  private index(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.wrapX) x = ((x % this.w) + this.w) % this.w;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }

  /** Set one pixel (null clears it). Out-of-bounds writes are ignored. */
  px(x: number, y: number, c: string | null): void {
    const i = this.index(x, y);
    if (i < 0) return;
    if (c === null) {
      this.data.fill(0, i, i + 4);
      return;
    }
    const [r, g, b, a] = hex(c);
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  get(x: number, y: number): Rgba {
    const i = this.index(x, y);
    if (i < 0) return [0, 0, 0, 0];
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  opaque(x: number, y: number): boolean {
    return this.get(x, y)[3] > 0;
  }

  rect(x: number, y: number, w: number, h: number, c: string | null): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  /** Filled circle; (cx,cy) in pixel-centre space, so cx=8 is the middle of column 7/8 edge. */
  disc(cx: number, cy: number, r: number, c: string | null): void {
    this.ellipse(cx, cy, r, r, c);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string | null): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    }
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: string | null): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** A line "brushed" with discs of radius r. */
  thickLine(x0: number, y0: number, x1: number, y1: number, r: number, c: string | null): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.disc(x0 + (x1 - x0) * t + 0.5, y0 + (y1 - y0) * t + 0.5, r, c);
    }
  }

  /** Horizontal runs: rows[k] = list of [x0,x1] inclusive spans for row top+k. */
  spans(top: number, rows: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, c: string): void {
    rows.forEach((row, k) => {
      for (const [a, b] of row) for (let x = a; x <= b; x++) this.px(x, top + k, c);
    });
  }

  pts(c: string | null, list: ReadonlyArray<readonly [number, number]>): void {
    for (const [x, y] of list) this.px(x, y, c);
  }

  flipH(): Img {
    const out = new Img(this.w, this.h, this.wrapX);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const s = (y * this.w + x) * 4;
        const d = (y * this.w + (this.w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) out.data[d + k] = this.data[s + k]!;
      }
    }
    return out;
  }

  /** Composite src onto this at (dx,dy); fully transparent src pixels are skipped. */
  blit(src: Img, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const s = (y * src.w + x) * 4;
        if (src.data[s + 3] === 0) continue;
        const i = this.index(dx + x, dy + y);
        if (i < 0) continue;
        for (let k = 0; k < 4; k++) this.data[i + k] = src.data[s + k]!;
      }
    }
  }

  /** Add a 1px 4-neighbour outline on transparent pixels touching opaque ones. */
  outline(c: string): void {
    const add: Array<[number, number]> = [];
    for (let y = -1; y <= this.h; y++) {
      for (let x = -1; x <= this.w; x++) {
        if (this.opaque(x, y)) continue;
        if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) {
          add.push([x, y]);
        }
      }
    }
    for (const [x, y] of add) this.px(x, y, c);
  }

  async save(file: string): Promise<void> {
    await sharp(Buffer.from(this.data.buffer), { raw: { width: this.w, height: this.h, channels: 4 } })
      .png()
      .toFile(path.join(outDir, file));
    console.log(`wrote public/assets/art/${file} ${this.w}x${this.h}`);
  }
}

/** Lay equally sized frames out left-to-right with no spacing. */
function strip(frames: Img[]): Img {
  const f0 = frames[0]!;
  const out = new Img(f0.w * frames.length, f0.h);
  frames.forEach((f, i) => {
    if (f.w !== f0.w || f.h !== f0.h) throw new Error(`frame ${i} is ${f.w}x${f.h}, expected ${f0.w}x${f0.h}`);
    out.blit(f, i * f0.w, 0);
  });
  return out;
}

/**
 * Build a w*h sprite from ASCII rows (bottom-aligned: missing top rows are transparent).
 * `custom` can override a character per-pixel (used for striped scarves).
 */
function art(
  rows: string[],
  w: number,
  h: number,
  custom?: (ch: string, x: number, y: number) => string | undefined,
): Img {
  const img = new Img(w, h);
  const top = h - rows.length;
  if (top < 0) throw new Error('too many rows');
  rows.forEach((row, k) => {
    if (row.length !== w) throw new Error(`ascii row ${k} has width ${row.length}, expected ${w}: "${row}"`);
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      if (ch === '.') continue;
      const c = custom?.(ch, x, top + k) ?? LEGEND[ch];
      if (!c) throw new Error(`unknown legend char "${ch}"`);
      img.px(x, top + k, c);
    }
  });
  return img;
}

// ---------------------------------------------------------------------------
// 1. tiles.png  (180x36, 18x18 tiles)
// ---------------------------------------------------------------------------

const TILE = 18;

const stoneNoise: number[] = (() => {
  const rnd = mulberry32(1701);
  return Array.from({ length: TILE * TILE }, () => rnd());
})();

/** Periodic (18x18) castle-brick texel: 3 brick rows of 6px, 9px bricks shifted by thirds. */
function stoneTexel(x: number, y: number): string {
  const row = Math.floor(y / 6) % 3;
  const off = [0, 3, 6][row]!;
  const ry = y % 6;
  const vx = (((x - off) % 9) + 9) % 9;
  if (ry === 5) return P.stoneD;
  if (vx === 0) return P.stoneD;
  const n = stoneNoise[(y % TILE) * TILE + (x % TILE)]!;
  if (ry === 0 || vx === 1) return n < 0.5 ? P.stoneL : P.stoneM;
  if (n < 0.1) return P.stoneD;
  if (n > 0.93) return P.stoneL;
  return P.stoneM;
}

function woodTile(left: boolean, right: boolean): Img {
  const t = new Img(TILE, TILE);
  for (let x = 0; x < TILE; x++) {
    t.px(x, 0, P.woodL);
    t.px(x, 1, P.woodL);
    for (let y = 2; y <= 4; y++) t.px(x, y, P.woodM);
    t.px(x, 5, P.woodM);
    t.px(x, 6, P.woodD);
    t.px(x, 7, P.K);
  }
  // plank seams + grain, all periodic in 18px so the middle tile repeats cleanly
  for (const sx of [6, 15]) for (let y = 2; y <= 5; y++) t.px(sx, y, P.woodD);
  t.pts(P.woodD, [[2, 3], [3, 3], [10, 4], [11, 4], [12, 4], [16, 2], [9, 2]]);
  t.pts(P.woodL, [[7, 3], [8, 3], [13, 4], [14, 4], [1, 4]]);
  const cap = (mirror: boolean) => {
    const X = (x: number) => (mirror ? TILE - 1 - x : x);
    t.px(X(0), 0, null);
    for (let y = 1; y <= 7; y++) t.px(X(0), y, P.K);
    for (let y = 1; y <= 6; y++) {
      t.px(X(1), y, P.ironD);
      t.px(X(2), y, P.ironD);
    }
    t.px(X(1), 1, P.ironL);
    t.px(X(2), 1, P.ironL);
    t.px(X(1), 3, P.ironL);
    t.px(X(2), 3, P.ironL);
    t.px(X(1), 6, P.K);
    t.px(X(2), 6, P.K);
    t.px(X(3), 1, P.woodD);
    t.px(X(3), 6, P.woodD);
  };
  if (left) cap(false);
  if (right) cap(true);
  return t;
}

function stoneTile(top: boolean, left: boolean, right: boolean): Img {
  const t = new Img(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) t.px(x, y, stoneTexel(x, y));
  if (top) {
    for (let x = 0; x < TILE; x++) {
      t.px(x, 0, P.stoneH);
      t.px(x, 1, P.stoneL);
      t.px(x, 2, P.stoneD);
    }
    // moss tufts + drips (periodic), frost sparkles
    for (const x of [3, 4, 5, 6, 12, 13]) {
      t.px(x, 0, P.mossL);
      t.px(x, 1, P.moss);
    }
    t.pts(P.moss, [[4, 2], [12, 2], [13, 2]]);
    t.pts(P.frost, [[9, 0], [10, 0], [16, 0], [1, 0], [8, 1]]);
  }
  if (left) {
    for (let y = 0; y < TILE; y++) {
      t.px(0, y, P.K);
      t.px(1, y, P.stoneD);
    }
    if (top) t.px(1, 0, P.stoneL);
  }
  if (right) {
    for (let y = 0; y < TILE; y++) {
      t.px(17, y, P.K);
      t.px(16, y, P.stoneD);
    }
    if (top) t.px(16, 0, P.stoneL);
  }
  return t;
}

function decoTorch(): Img {
  return art(
    [
      '.........o........',
      '........oo........',
      '.......ooeo.......',
      '.......oeeo.......',
      '......oeeeeo......',
      '......oeweeo......',
      '.......oeeo.......',
      '......KiIIiK......',
      '......KiIIiK......',
      '.......KiiK.......',
      '.....KKK32KKK.....',
      '.....KiI32IiK.....',
      '.....KIi32iIK.....',
      '.....KKK32KKK.....',
      '........32........',
      '........32........',
      '........32........',
      '.......K32K.......',
    ],
    TILE,
    TILE,
  );
}

function decoIvy(): Img {
  const t = new Img(TILE, TILE);
  t.rect(0, 0, 18, 2, P.moss);
  t.pts(P.mossL, [[2, 0], [3, 0], [7, 0], [8, 0], [11, 0], [14, 0], [15, 0]]);
  t.pts(P.moss, [[0, 1], [17, 1], [4, 2], [9, 2], [13, 2], [16, 2]]);
  const vines: Array<[number, number]> = [[3, 10], [6, 15], [9, 7], [12, 13], [15, 9]];
  for (const [vx, len] of vines) {
    for (let y = 2; y <= len; y++) t.px(vx, y, P.moss);
    for (let y = 4; y <= len; y += 3) {
      const side = (y / 3) % 2 === 0 ? -1 : 1;
      t.px(vx + side, y, P.mossL);
      t.px(vx + side * 2, y + 1, P.mossL);
      t.px(vx + side, y + 1, P.moss);
    }
    t.rect(vx - 1, len, 2, 2, P.mossL);
    t.px(vx, len + 2, P.moss);
  }
  t.outline(P.K);
  return t;
}

function decoBooks(): Img {
  const t = new Img(TILE, TILE);
  // bottom book (red, wide)
  t.rect(2, 13, 13, 4, P.red);
  t.rect(14, 13, 1, 4, P.cream);
  t.rect(2, 13, 12, 1, P.redL);
  t.rect(4, 14, 1, 2, P.gold);
  t.rect(10, 14, 1, 2, P.gold);
  // middle book (green)
  t.rect(4, 9, 10, 4, P.greenM);
  t.rect(13, 9, 1, 4, P.cream);
  t.rect(4, 9, 9, 1, P.green);
  t.rect(6, 10, 4, 1, P.gold);
  // top book (blue, small, tilted a hair)
  t.rect(5, 5, 8, 4, P.pixieD);
  t.rect(12, 5, 1, 4, P.cream);
  t.rect(5, 5, 7, 1, P.pixie);
  t.rect(7, 7, 2, 1, P.goldL);
  t.outline(P.K);
  return t;
}

function decoCauldron(): Img {
  const t = new Img(TILE, TILE);
  t.rect(4, 15, 3, 2, P.robeM); // feet
  t.rect(12, 15, 3, 2, P.robeM);
  t.ellipse(9, 11.5, 7.5, 5.5, P.robeM);
  t.pts(P.robeL, [[4, 10], [4, 11], [5, 9], [5, 8], [6, 14], [7, 14]]);
  t.rect(2, 6, 15, 2, P.ironD); // rim
  t.rect(2, 6, 15, 1, P.ironL);
  t.ellipse(9, 6.5, 6, 1.5, P.green); // brew
  t.pts(P.greenM, [[6, 6], [7, 7], [12, 6], [13, 7]]);
  t.pts(P.goldL, [[9, 6]]);
  t.pts(P.green, [[7, 3], [11, 4], [10, 2], [8, 5]]);
  t.pts(P.greenM, [[7, 4], [11, 3], [10, 1]]);
  t.outline(P.K);
  return t;
}

function decoSign(): Img {
  const t = new Img(TILE, TILE);
  t.rect(7, 8, 4, 9, P.woodM);
  t.rect(7, 8, 1, 9, P.woodL);
  t.rect(10, 8, 1, 9, P.woodD);
  t.spans(
    2,
    [
      [[1, 12]],
      [[1, 13]],
      [[1, 15]],
      [[1, 16]],
      [[1, 15]],
      [[1, 13]],
      [[1, 12]],
    ],
    P.woodL,
  );
  t.rect(1, 2, 12, 1, P.cream);
  t.rect(1, 8, 12, 1, P.woodM);
  t.line(3, 5, 12, 5, P.woodD);
  t.pts(P.woodD, [[11, 4], [11, 6], [12, 4], [12, 6]]);
  t.pts(P.ironL, [[2, 3], [2, 7]]);
  t.rect(5, 17, 8, 1, P.moss);
  t.pts(P.mossL, [[6, 16], [11, 16]]);
  t.outline(P.K);
  return t;
}

function tilesSheet(): Img {
  const sheet = new Img(180, 36);
  const put = (i: number, img: Img) => sheet.blit(img, (i % 10) * TILE, Math.floor(i / 10) * TILE);
  put(0, woodTile(true, true));
  put(1, woodTile(true, false));
  put(2, woodTile(false, false));
  put(3, woodTile(false, true));
  put(4, stoneTile(true, true, true));
  put(5, stoneTile(true, true, false));
  put(6, stoneTile(true, false, false));
  put(7, stoneTile(true, false, true));
  put(8, stoneTile(false, true, true));
  put(9, stoneTile(false, true, false));
  put(10, stoneTile(false, false, false));
  put(11, stoneTile(false, false, true));
  put(12, decoTorch());
  put(13, decoIvy());
  put(14, decoBooks());
  put(15, decoCauldron());
  put(16, decoSign());
  return sheet;
}

// ---------------------------------------------------------------------------
// 2. player.png  (96x24, 4 frames: idle, walk A, walk B, jump). Faces right.
//    Body only: the game draws a round face disc over (12,8) r=8 (rows 0-16).
// ---------------------------------------------------------------------------

/** 'S' = scarf pixel: diagonal 2px red/gold stripes. */
function scarf(ch: string, x: number, y: number): string | undefined {
  if (ch !== 'S') return undefined;
  return ((x + y) >> 1) % 2 === 0 ? P.red : P.gold;
}

function playerFrame(rows: string[]): Img {
  const img = art(rows, 24, 24, scarf);
  // moon rim light so the black robe still reads: left edges and hem
  const robe = hex(P.robeD);
  const isRobe = (x: number, y: number) => {
    const c = img.get(x, y);
    return c[0] === robe[0] && c[1] === robe[1] && c[2] === robe[2] && c[3] > 0;
  };
  for (let y = 17; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      if (!isRobe(x, y)) continue;
      if (!img.opaque(x - 1, y)) img.px(x, y, P.robeL);
      else if (!img.opaque(x, y + 1) && y < 23) img.px(x, y, P.robeM);
    }
  }
  img.px(12, 19, P.gold); // clasp
  img.outline(P.K);
  return img;
}

function playerSheet(): Img {
  const idle = playerFrame([
    '......SSSSSSSSSSSSS.....', // y14
    '......SSSSSSSSSSSSS.....',
    '......SSSSSSSSSSSSS.....',
    '....SSSSSSSSSSSSSSS....w', // y17 (wand tip)
    '....SSSkkkkkkkkkjjj..xx.', // y18
    '....SSkkkkkkkkkkjjjhx...', // y19
    '....Skkkkkkkjkkkkkkk....', // y20
    '.....kkkkkkkjkkkkkk.....', // y21
    '........kkk..kkk........', // y22
    '........2222.2222.......', // y23
  ]);
  const walkA = playerFrame([
    '......SSSSSSSSSSSSS.....',
    '......SSSSSSSSSSSSS.....',
    '......SSSSSSSSSSSSS.....',
    '....SSSSSSSSSSSSSSS....w',
    '....SSSkkkkkkkkkjjj..xx.',
    '....SSkkkkkkkkkkjjjhx...',
    '....Skkkkkkkjkkkkkkk....',
    '.....kkkkkkkjkkkkkk.....',
    '.......kk.......kk......',
    '.....2222......2222.....',
  ]);
  const walkB = playerFrame([
    '......SSSSSSSSSSSSS.....',
    '......SSSSSSSSSSSSS.....',
    '......SSSSSSSSSSSSS.....',
    '....SSSSSSSSSSSSSSS....w',
    '....SSSkkkkkkkkkjjj..xx.',
    '....SSkkkkkkkkkkjjjhx...',
    '....Skkkkkkkjkkkkkkk....',
    '.....kkkkkkkjkkkkkk.....',
    '.........kkk..2222......',
    '.........2222...........',
  ]);
  const jump = playerFrame([
    '......................w.', // y12
    '......................x.',
    '......SSSSSSSSSSSSS..x..',
    '......SSSSSSSSSSSSS.x...',
    '......SSSSSSSSSSSSSh....',
    '....SSSSSSSSSSSSSSSj....',
    '....SSSkkkkkkkkkkkkj....',
    '....SSkkkkkkkkkkkkk.....',
    '....Skkkkkkkkjkkkkkkk...',
    '.....kkkkkkkjkkkkkkkk...',
    '....2222kk..kkk.........',
    '............2222........',
  ]);
  return strip([idle, walkA, walkB, jump]);
}

// ---------------------------------------------------------------------------
// 3. creatures.png (144x24, 6 frames): pixie wings-up, wings-down, squashed,
//    niffler walk A, walk B, squashed. All face right, bottom-aligned.
// ---------------------------------------------------------------------------

function pixieWings(up: boolean): Img {
  const w = new Img(24, 24);
  if (up) {
    w.thickLine(8, 16, 4, 8, 1.1, P.pixieL);
    w.thickLine(9, 15, 8, 4, 1.1, P.pixieL);
    w.outline(P.pixieD);
    w.pts(P.white, [[5, 10], [8, 7]]);
  } else {
    w.thickLine(8, 17, 3, 20, 1.1, P.pixieL);
    w.thickLine(8, 18, 4, 22, 1.1, P.pixieL);
    w.outline(P.pixieD);
    w.pts(P.white, [[5, 19], [5, 21]]);
  }
  return w;
}

function pixieBody(): Img {
  const b = new Img(24, 24);
  b.spans(
    12,
    [
      [[8, 16]],
      [[7, 17]],
      [[7, 17]],
      [[7, 17]],
      [[8, 17]],
      [[9, 16]],
      [[10, 15]],
      [[10, 15]],
      [[10, 14]],
      [[10, 14]],
      [[10, 11], [13, 14]],
      [[9, 11], [13, 15]],
    ],
    P.pixie,
  );
  // spiky hair
  b.pts(P.pixieD, [[9, 10], [12, 9], [15, 10], [9, 11], [10, 11], [11, 11], [12, 11], [13, 11], [14, 11], [15, 11], [16, 11]]);
  b.rect(8, 12, 9, 1, P.pixieD);
  // pointy ears
  b.pts(P.pixie, [[6, 14], [5, 13], [18, 13], [19, 12]]);
  // eyes: white with pupils looking right, slanted mischievous brows
  b.rect(11, 14, 2, 2, P.white);
  b.rect(14, 14, 2, 2, P.white);
  b.pts(P.K, [[12, 15], [15, 15], [11, 13], [12, 13], [15, 13], [16, 13]]);
  b.pts(P.white, [[12, 14]]);
  // grin
  b.rect(11, 17, 5, 1, P.K);
  b.pts(P.white, [[12, 17], [14, 17]]);
  b.pts(P.pixieL, [[9, 15], [9, 14]]);
  // feet
  b.pts(P.pixieD, [[11, 23], [12, 23], [15, 23], [16, 23]]);
  return b;
}

function pixieFrame(wingsUp: boolean): Img {
  const f = new Img(24, 24);
  f.blit(pixieWings(wingsUp), 0, 0);
  const body = pixieBody();
  body.outline(P.K);
  f.blit(body, 0, 0);
  return f;
}

function pixieSquashed(): Img {
  const f = new Img(24, 24);
  f.ellipse(12, 21, 8, 2.9, P.pixie);
  f.rect(5, 19, 14, 1, P.pixieD); // flattened hair
  f.pts(P.pixieL, [[4, 20], [20, 20]]);
  // dizzy X eyes
  f.pts(P.K, [[9, 20], [11, 20], [10, 21], [9, 22], [11, 22], [14, 20], [16, 20], [15, 21], [14, 22], [16, 22]]);
  f.rect(12, 22, 2, 1, P.K);
  // drooping wings and tiny legs poking out sideways
  f.pts(P.pixieL, [[3, 22], [4, 22], [2, 23], [3, 23], [20, 22], [21, 22], [21, 23], [22, 23]]);
  f.pts(P.pixieD, [[6, 23], [7, 23], [16, 23], [17, 23]]);
  f.outline(P.K);
  // little stars above head
  f.pts(P.goldL, [[8, 16], [12, 15], [16, 16]]);
  return f;
}

function nifflerFrame(step: 0 | 1): Img {
  const f = new Img(24, 24);
  // body silhouette (fluffy, ragged back)
  f.spans(
    10,
    [
      [[14, 15]],
      [[8, 11], [13, 17]],
      [[6, 18]],
      [[4, 19]],
      [[3, 19]],
      [[3, 19], [20, 22]],
      [[2, 19], [20, 22]],
      [[2, 20]],
      [[2, 19]],
      [[3, 19]],
      [[3, 19]],
    ],
    P.robeD,
  );
  // belly + fur highlights
  f.rect(6, 18, 9, 2, P.robeM);
  f.pts(P.robeL, [[8, 11], [9, 11], [6, 12], [4, 13], [3, 15], [14, 10], [15, 10], [13, 11]]);
  f.pts(P.robeL, [[5, 16], [7, 17], [11, 16], [10, 14]]);
  // snout (long, duck-bill-ish), nose tip, eye, ear
  f.pts(P.skinD, [[19, 15], [20, 15], [21, 15], [22, 15], [19, 16], [20, 16], [21, 16], [22, 16], [19, 17], [20, 17]]);
  f.pts(P.K, [[22, 15], [22, 16]]);
  f.pts(P.skin, [[19, 15], [20, 15]]);
  f.pts(P.white, [[17, 13], [17, 14]]);
  f.pts(P.K, [[18, 14]]);
  f.pts(P.pink, [[15, 11]]);
  // legs: the two planted feet reach y=23, the lifted pair stops a pixel short
  const leg = (x: number, planted: boolean) => f.rect(x, 21, 3, planted ? 3 : 2, P.robeD);
  if (step === 0) {
    leg(4, true);
    leg(9, false);
    leg(13, false);
    leg(17, true);
  } else {
    leg(4, false);
    leg(8, true);
    leg(14, true);
    leg(18, false);
  }
  f.pts(P.robeL, [[4, 23], [8, 23], [17, 23], [18, 23], [14, 23], [15, 23]]);
  // big front paw (right) holding a coin
  f.rect(18, 20, 3, 2, P.robeM);
  f.rect(21, 19, 2, 2, P.gold);
  f.pts(P.goldL, [[21, 19]]);
  f.pts(P.goldD, [[22, 20]]);
  f.outline(P.K);
  return f;
}

function nifflerSquashed(): Img {
  const f = new Img(24, 24);
  f.ellipse(11, 21, 10, 2.9, P.robeD);
  f.rect(18, 20, 5, 2, P.skinD); // flattened snout
  f.pts(P.K, [[22, 20], [22, 21]]);
  f.pts(P.robeL, [[4, 19], [6, 19], [9, 19], [12, 19], [7, 20]]);
  f.pts(P.robeM, [[5, 22], [8, 22], [12, 22], [15, 22]]);
  // dizzy eyes
  f.pts(P.white, [[14, 20], [15, 21], [16, 20], [14, 21], [16, 21]]);
  f.pts(P.K, [[15, 20]]);
  // coin popped out
  f.rect(1, 22, 2, 2, P.gold);
  f.pts(P.goldL, [[1, 22]]);
  f.pts(P.robeD, [[3, 23], [4, 23], [19, 23], [20, 23]]);
  f.outline(P.K);
  f.pts(P.goldL, [[8, 16], [12, 15], [16, 16]]);
  return f;
}

function creaturesSheet(): Img {
  return strip([
    pixieFrame(true),
    pixieFrame(false),
    pixieSquashed(),
    nifflerFrame(0),
    nifflerFrame(1),
    nifflerSquashed(),
  ]);
}

// ---------------------------------------------------------------------------
// 4. candle.png (32x16, 2 frames)
// ---------------------------------------------------------------------------

function candleFrame(flicker: boolean): Img {
  const c = new Img(16, 16);
  // wax body x5..10, y7..15
  c.rect(5, 7, 6, 9, P.cream);
  c.rect(9, 7, 2, 9, P.creamD);
  c.rect(5, 7, 6, 1, P.white); // lit rim
  c.pts(P.creamD, [[5, 11], [5, 12], [6, 15]]);
  c.pts(P.cream, [[4, 9], [4, 10], [4, 11], [11, 12], [11, 13]]); // drips
  c.pts(P.creamD, [[11, 14]]);
  c.pts(P.K, [[7, 6], [8, 6]]); // wick
  c.outline(P.K);
  // flame
  if (!flicker) {
    c.spans(
      1,
      [[[8, 8]], [[7, 8]], [[7, 9]], [[7, 9]], [[7, 8]]],
      P.flameO,
    );
    c.pts(P.flameY, [[8, 3], [8, 4], [7, 4], [8, 5]]);
    c.pts(P.white, [[8, 5]]);
  } else {
    c.spans(
      2,
      [[[9, 9]], [[8, 9]], [[7, 9]], [[7, 8]]],
      P.flameO,
    );
    c.pts(P.flameY, [[8, 4], [8, 5], [7, 5]]);
    c.pts(P.white, [[8, 5]]);
  }
  return c;
}

function candleSheet(): Img {
  return strip([candleFrame(false), candleFrame(true)]);
}

// ---------------------------------------------------------------------------
// 5. block.png (54x18, 3 frames): magic box, pulse, used. Fully opaque.
// ---------------------------------------------------------------------------

const QUESTION = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'];

function blockFrame(state: 0 | 1 | 2): Img {
  const b = new Img(18, 18);
  const used = state === 2;
  const goldC = used ? '#6a5a3a' : P.gold;
  const goldDark = used ? '#4a3d28' : P.goldD;
  b.rect(0, 0, 18, 18, P.K);
  // wooden body with vertical planks
  b.rect(1, 1, 16, 16, P.woodM);
  for (let x = 1; x < 17; x += 4) b.rect(x, 1, 1, 16, P.woodD);
  for (let x = 2; x < 17; x += 4) b.rect(x, 1, 1, 16, P.woodL);
  // top and bottom bands
  b.rect(1, 1, 16, 2, goldC);
  b.rect(1, 1, 16, 1, used ? '#8a7a50' : P.goldL);
  b.rect(1, 15, 16, 2, goldDark);
  // corner brackets
  for (const [cx, cy] of [[1, 1], [14, 1], [1, 14], [14, 14]] as const) {
    b.rect(cx, cy, 3, 3, goldC);
    b.px(cx + 1, cy + 1, goldDark);
  }
  // dark rune panel
  b.rect(3, 4, 12, 10, used ? P.woodD : P.robeD);
  b.rect(3, 4, 12, 1, P.K);
  b.rect(3, 13, 12, 1, P.K);
  // rune
  const rune = state === 1 ? P.goldL : used ? P.woodM : P.gold;
  const shadow = used ? P.K : P.goldD;
  QUESTION.forEach((row, j) => {
    for (let i = 0; i < 5; i++) {
      if (row[i] === '#') {
        b.px(6 + i + 1, 5 + j + 1, shadow);
      }
    }
  });
  QUESTION.forEach((row, j) => {
    for (let i = 0; i < 5; i++) {
      if (row[i] === '#') b.px(6 + i, 5 + j, rune);
    }
  });
  if (state === 1) {
    b.pts(P.white, [[4, 5], [13, 6], [5, 11], [12, 11]]);
    b.pts(P.goldL, [[4, 6], [4, 4], [3, 5], [5, 5], [13, 5], [13, 7], [12, 6], [14, 6], [11, 12], [13, 12]]);
  }
  // lock plate
  b.rect(8, 15, 2, 2, used ? '#8a7a50' : P.goldL);
  b.px(8, 16, P.K);
  return b;
}

function blockSheet(): Img {
  return strip([blockFrame(0), blockFrame(1), blockFrame(2)]);
}

// ---------------------------------------------------------------------------
// 6. banner.png (36x36, 2 frames of 18x36): furled / unfurled house banner
// ---------------------------------------------------------------------------

function bannerFrame(unfurled: boolean): Img {
  const b = new Img(18, 36);
  // pole + base
  b.rect(8, 4, 2, 31, P.woodM);
  b.rect(8, 4, 1, 31, P.woodL);
  b.rect(9, 4, 1, 31, P.woodD);
  b.rect(6, 33, 6, 3, P.stoneM);
  b.rect(6, 33, 6, 1, P.stoneL);
  b.rect(6, 35, 6, 1, P.stoneD);
  // crossbar and gold finials
  b.rect(1, 4, 16, 2, P.woodM);
  b.rect(1, 4, 16, 1, P.woodL);
  b.disc(1.5, 4.5, 1.6, P.gold);
  b.disc(16.5, 4.5, 1.6, P.gold);
  b.pts(P.goldL, [[1, 3], [16, 3]]);
  b.disc(9, 2.5, 1.6, P.gold);
  b.px(8, 1, P.goldL);
  if (!unfurled) {
    // rolled-up dull cloth under the bar
    b.rect(3, 6, 12, 4, '#6b6f88');
    b.rect(3, 6, 12, 1, '#9aa0b8');
    b.rect(3, 9, 12, 1, '#454a63');
    b.pts('#454a63', [[5, 7], [8, 8], [11, 7], [13, 8]]);
    b.rect(8, 6, 2, 4, P.ironD); // tie
    b.pts(P.ironL, [[8, 6]]);
    b.pts('#6b6f88', [[2, 7], [2, 8], [15, 7], [15, 8]]);
    b.pts('#454a63', [[10, 10], [10, 11], [9, 12]]);
  } else {
    // hanging red banner (x3..14, y6..29) with gold border and swallow tail
    const left = 3;
    const right = 14;
    for (let y = 6; y <= 29; y++) b.rect(left, y, right - left + 1, 1, P.red);
    for (let i = 0; i < 4; i++) b.rect(8 - i, 29 - i, 2 + 2 * i, 1, null); // V-notch tail
    b.rect(left, 6, right - left + 1, 1, P.goldD);
    for (let y = 7; y <= 28; y++) {
      b.px(left, y, P.redD);
      b.px(right, y, P.redD);
      b.px(left + 1, y, P.gold);
      b.px(right - 1, y, P.gold);
    }
    b.rect(left + 1, 7, right - left - 1, 1, P.gold);
    b.rect(left + 1, 11, right - left - 1, 1, P.gold);
    b.rect(left + 1, 24, 3, 1, P.gold);
    b.rect(right - 3, 24, 3, 1, P.gold);
    // cloth folds
    b.pts(P.redD, [[7, 9], [7, 10], [10, 9], [10, 10], [6, 22], [11, 22], [7, 23], [10, 23]]);
    b.pts(P.redL, [[5, 8], [5, 9], [12, 8], [12, 10]]);
    // original emblem: a bold gold star
    const star = ['...gg...', '...gg...', '..gyyg..', 'gggggggg', '.gggggg.', '..gggg..', '.gg..gg.', 'gg....gg'];
    star.forEach((row, j) => {
      for (let i = 0; i < 8; i++) {
        const ch = row[i];
        if (ch === 'g') b.px(5 + i, 13 + j, P.gold);
        else if (ch === 'y') b.px(5 + i, 13 + j, P.goldL);
      }
    });
    // hanging tabs under the crossbar
    b.pts(P.gold, [[3, 6], [14, 6]]);
  }
  b.outline(P.K);
  return b;
}

function bannerSheet(): Img {
  return strip([bannerFrame(false), bannerFrame(true)]);
}

// ---------------------------------------------------------------------------
// 7. door.png (36x54): Great-Hall double door in a pointed arch + sconces
// ---------------------------------------------------------------------------

/** Pointed (equilateral-ish) arch: straight sides below yS, two arcs of radius r above it. */
function inPointed(px: number, py: number, xl: number, xr: number, yS: number, r: number): boolean {
  if (px < xl || px > xr) return false;
  if (py >= yS) return true;
  return (px - xr) ** 2 + (py - yS) ** 2 <= r * r && (px - xl) ** 2 + (py - yS) ** 2 <= r * r;
}

function sconce(d: Img, side: 'L' | 'R'): void {
  const X = (x: number) => (side === 'L' ? x : 35 - x);
  const o = new Img(36, 54);
  // wall plate + arm
  o.rect(X(3), 36, 1, 4, P.ironD);
  o.rect(X(1), 37, 3, 1, P.ironL);
  o.rect(X(0), 30, 4, 2, P.ironD); // cup
  o.rect(X(0), 30, 4, 1, P.ironL);
  o.rect(X(1), 32, 2, 6, P.woodM); // torch handle
  o.rect(X(1), 32, 1, 6, P.woodL);
  // flame
  o.pts(P.flameO, [[X(1), 24], [X(1), 25], [X(2), 25], [X(0), 26], [X(1), 26], [X(2), 26], [X(3), 26], [X(0), 27], [X(3), 27], [X(0), 28], [X(3), 28], [X(1), 29], [X(2), 29]]);
  o.pts(P.flameY, [[X(1), 27], [X(2), 27], [X(1), 28], [X(2), 28]]);
  o.pts(P.white, [[X(1), 28]]);
  o.outline(P.K);
  d.blit(o, 0, 0);
}

function doorImage(): Img {
  const d = new Img(36, 54);
  const outer = { xl: 4, xr: 32, yS: 26, r: 28 };
  const inner = { xl: 7, xr: 29, yS: 26, r: 22 };
  for (let y = 0; y < 54; y++) {
    for (let x = 0; x < 36; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (!inPointed(cx, cy, outer.xl, outer.xr, outer.yS, outer.r)) continue;
      if (inPointed(cx, cy, inner.xl, inner.xr, inner.yS, inner.r)) {
        // wooden leaves: vertical planks with shading toward the seam
        const px = x - 7;
        let c: string = P.woodM;
        if (px % 4 === 0) c = P.woodD;
        else if (px % 4 === 1) c = P.woodL;
        if (y > 50) c = P.woodD;
        d.px(x, y, c);
      } else {
        // stone arch with radial-ish joints
        let c: string = stoneTexel(x, y);
        if (y < 32) {
          const ang = Math.atan2(26 - cy, cx - 18);
          if (Math.floor(ang * 14) % 2 === 0 && (x + y) % 3 === 0) c = P.stoneL;
        }
        d.px(x, y, c);
      }
    }
  }
  // keystone
  d.rect(16, 0, 4, 7, P.stoneL);
  d.rect(16, 0, 4, 1, P.stoneH);
  d.pts(P.stoneD, [[16, 6], [19, 6], [16, 3], [19, 3]]);
  // iron straps with studs on both leaves
  for (const sy of [20, 34, 46]) {
    for (let x = 7; x <= 28; x++) {
      if (!inPointed(x + 0.5, sy + 0.5, inner.xl, inner.xr, inner.yS, inner.r)) continue;
      d.px(x, sy, P.ironL);
      d.px(x, sy + 1, P.ironD);
      d.px(x, sy + 2, P.K);
    }
    for (const sx of [9, 13, 22, 26]) {
      if (inPointed(sx + 0.5, sy + 0.5, inner.xl, inner.xr, inner.yS, inner.r)) d.px(sx, sy + 1, P.white);
    }
    d.rect(7, sy - 1, 3, 4, P.ironD); // hinge flare
    d.rect(26, sy - 1, 3, 4, P.ironD);
    d.px(7, sy - 1, P.ironL);
    d.px(28, sy - 1, P.ironL);
  }
  // studs sprinkled on the upper arch leaves
  d.pts(P.ironL, [[11, 12], [14, 10], [21, 10], [24, 12], [12, 15], [23, 15]]);
  // ring handles
  for (const hx of [14, 20]) {
    d.rect(hx, 38, 3, 3, P.ironL);
    d.px(hx + 1, 39, P.woodD);
  }
  // sill
  d.rect(7, 52, 22, 2, P.stoneD);
  // glowing seam between the leaves (x=17,18) with a warm halo
  for (let y = 0; y < 52; y++) {
    if (!inPointed(18, y + 0.5, inner.xl, inner.xr, inner.yS, inner.r)) continue;
    d.px(17, y, P.flameY);
    d.px(18, y, P.flameY);
    if (y % 2 === 0) {
      d.px(16, y, P.flameO);
      d.px(19, y, P.flameO);
    }
  }
  d.px(17, 12, P.white);
  d.px(18, 30, P.white);
  d.px(17, 44, P.white);
  // outline the arch
  d.outline(P.K);
  sconce(d, 'L');
  sconce(d, 'R');
  return d;
}

// ---------------------------------------------------------------------------
// 8. frame.png (36x36): gold frame. PHOTO OPENING = x:5..30, y:5..30 (26x26)
//    inclusive. That rectangle contains only a dark painting placeholder;
//    nothing of the frame itself is drawn inside it.
// ---------------------------------------------------------------------------

/** Murky night-garden with a vague wizard silhouette. Drawn only inside the opening. */
function paintPlaceholder(f: Img): void {
  const top = '#161428';
  const mid = '#231c30';
  const low = '#33262e';
  for (let y = 5; y <= 30; y++) {
    for (let x = 5; x <= 30; x++) {
      const t = (y - 5) / 25;
      const dither = (x + y) % 2 === 0;
      let c = t < 0.4 ? top : t < 0.75 ? mid : low;
      if (Math.abs(t - 0.4) < 0.07) c = dither ? mid : top;
      else if (Math.abs(t - 0.75) < 0.07) c = dither ? low : mid;
      f.px(x, y, c);
    }
  }
  const sil = '#0b0914';
  f.disc(18, 15, 4.6, sil); // head
  f.spans(5, [[[19, 20]], [[18, 21]], [[18, 21]], [[17, 22]], [[16, 23]]], sil); // pointed hat
  f.rect(13, 10, 11, 1, sil); // hat brim
  f.ellipse(18, 31, 10, 7.5, sil); // shoulders
  f.pts('#4a3a38', [[21, 14], [22, 20], [11, 22], [8, 12]]); // faint candle glints
}

function drawFrameBorder(f: Img): void {
  const lit = [P.K, P.goldL, P.gold, P.gold, P.goldD]; // top/left sides, ring 0 = outermost
  const shade = [P.K, P.gold, P.goldD, P.goldD, P.K]; // bottom/right sides
  for (let ring = 0; ring < 5; ring++) {
    const z = 35 - ring;
    for (let i = ring; i <= z; i++) {
      f.px(i, ring, lit[ring]!); // top
      f.px(ring, i, lit[ring]!); // left
      f.px(i, z, shade[ring]!); // bottom
      f.px(z, i, shade[ring]!); // right
    }
  }
  // carved beads on the middle ring
  for (let i = 6; i < 30; i += 2) {
    if (Math.abs(i - 17) < 3) continue;
    f.px(i, 2, P.goldL);
    f.px(2, i, P.goldL);
    f.px(i, 33, P.goldD);
    f.px(33, i, P.goldD);
  }
  // carved corner rosettes (5x5 each, kept inside the border)
  const rosette = ['.ggg.', 'gGyGg', 'gyKyg', 'gGyGg', '.ggg.'];
  for (const [cx, cy] of [[0, 0], [31, 0], [0, 31], [31, 31]] as const) {
    rosette.forEach((row, j) => {
      for (let i = 0; i < 5; i++) {
        const ch = row[i]!;
        if (ch !== '.') f.px(cx + i, cy + j, LEGEND[ch]!);
      }
    });
  }
  // hook / ring at top centre
  f.rect(16, 0, 4, 4, P.gold);
  f.rect(17, 1, 2, 1, P.K);
  f.pts(P.goldL, [[16, 0], [17, 0], [16, 1]]);
  f.pts(P.goldD, [[19, 3], [18, 3], [19, 2]]);
  f.pts(P.K, [[15, 0], [20, 0], [15, 1], [20, 1], [15, 2], [20, 2], [16, 3], [17, 3], [18, 3], [19, 3]]);
  f.pts(P.gold, [[17, 2], [18, 2]]);
  // rounded outer corners
  f.pts(null, [[0, 0], [35, 0], [0, 35], [35, 35]]);
}

function frameImage(): Img {
  const f = new Img(36, 36);
  paintPlaceholder(f);
  // the shoulders ellipse spills past the opening: wipe everything outside it
  for (let y = 0; y < 36; y++) {
    for (let x = 0; x < 36; x++) if (x < 5 || x > 30 || y < 5 || y > 30) f.px(x, y, null);
  }
  drawFrameBorder(f);
  return f;
}

// ---------------------------------------------------------------------------
// 9. projectiles.png (48x16, 3 frames): red bolt, green orb, sparkle
// ---------------------------------------------------------------------------

function projectileFrames(): Img {
  const red = new Img(16, 16);
  // half-heights per column x=2..14 (pointing right at x=14)
  const half = [1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1];
  half.forEach((hh, k) => {
    const x = 2 + k;
    for (let y = 8 - hh; y < 8 + hh; y++) red.px(x, y, P.redD);
  });
  half.forEach((hh, k) => {
    const x = 2 + k;
    for (let y = 8 - hh + 1; y < 8 + hh - 1; y++) red.px(x, y, P.redL);
  });
  red.rect(4, 7, 9, 2, P.pink);
  red.rect(7, 7, 5, 2, P.white);
  red.px(14, 7, P.redL);
  red.px(14, 8, P.redL);
  red.pts(P.red, [[1, 7], [0, 9], [1, 5], [0, 11]]);
  red.pts(P.pink, [[0, 7], [1, 10]]);

  const green = new Img(16, 16);
  green.disc(8, 8, 5.2, P.greenM);
  green.disc(8, 8, 4.2, P.green);
  green.disc(8, 8, 3, P.greenD);
  green.pts(P.greenM, [[7, 7], [8, 9], [9, 8]]);
  green.pts(P.green, [[6, 8], [8, 6], [10, 8], [8, 10]]);
  green.pts(P.goldL, [[10, 5]]);
  green.pts(P.white, [[5, 6], [11, 10]]);
  green.outline(P.greenD);

  const spark = new Img(16, 16);
  spark.pts(P.goldL, [[8, 6], [8, 7], [6, 8], [7, 8], [9, 8], [10, 8], [8, 9], [8, 10]]);
  spark.pts(P.gold, [[8, 6], [6, 8], [10, 8], [8, 10]]);
  spark.pts(P.white, [[8, 8], [8, 7], [7, 8], [9, 8], [8, 9]]);

  return strip([red, green, spark]);
}

// ---------------------------------------------------------------------------
// 10. voldemort.png (96x48, 3 frames of 32x48): original dark-wizard villain. FACES LEFT.
// ---------------------------------------------------------------------------

function interp(points: ReadonlyArray<readonly [number, number]>, y: number): number {
  if (y <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [y0, v0] = points[i - 1]!;
    const [y1, v1] = points[i]!;
    if (y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
  }
  return points[points.length - 1]![1];
}

function villainFrame(frame: 0 | 1 | 2): Img {
  const v = new Img(32, 48);
  const bob = frame === 1 ? -1 : 0;
  const cast = frame === 2;
  const cx = 19;
  // robe silhouette (half-widths), hem sways in frame 1
  const prof: Array<[number, number]> = [
    [17 + bob, 4],
    [20 + bob, 7],
    [28 + bob, 8],
    [36, 7],
    [42, 4],
    [47, 1],
  ];
  for (let y = 17 + bob; y <= 47; y++) {
    const hw = interp(prof, y);
    const sway = frame === 1 ? Math.round(((y - 28) / 19) * 2) : 0;
    const x0 = Math.round(cx - hw + sway);
    const x1 = Math.round(cx + hw + sway - 1);
    for (let x = x0; x <= x1; x++) {
      if (y >= 44 && (x + y) % 2 === 0) continue; // ghostly dither at the tail
      v.px(x, y, P.robeD);
    }
    // folds and rim light
    v.px(x0, y, P.robeL);
    if (y % 3 === 0) v.px(x0 + 1, y, P.robeM);
    if (y > 22 && y < 44) {
      v.px(Math.round(cx - 3 + sway * 0.6), y, P.robeM);
      v.px(Math.round(cx + 3 + sway * 0.6), y, P.robeM);
    }
  }
  // far arm (hangs on the right, long pale fingers)
  v.thickLine(cx + 7, 21 + bob, cx + 9, 31 + bob, 1.4, P.robeD);
  v.pts(P.robeM, [[cx + 8, 24 + bob], [cx + 8, 27 + bob]]);
  v.pts(P.pale, [[cx + 9, 32 + bob], [cx + 10, 33 + bob], [cx + 9, 34 + bob], [cx + 11, 32 + bob], [cx + 8, 33 + bob]]);
  v.pts(P.paleD, [[cx + 9, 33 + bob]]);
  // neck
  v.rect(16, 16 + bob, 4, 4, P.paleD);
  // head: tall bald ellipse, shaded crescent on the back (right) side
  v.ellipse(17, 9.5 + bob, 6.2, 7.8, P.paleD);
  v.ellipse(16, 9.5 + bob, 5.6, 7.4, P.pale);
  // face (looking left): slanted brows, glowing eyes, slit nostrils, thin mouth
  const eyeCol = cast ? P.redL : P.eye;
  v.pts(P.K, [[12, 6 + bob], [13, 6 + bob], [14, 7 + bob], [19, 6 + bob], [18, 6 + bob], [17, 7 + bob]]);
  v.pts(eyeCol, [[13, 8 + bob], [14, 8 + bob], [17, 8 + bob], [18, 8 + bob]]);
  v.pts(P.eye, [[13, 9 + bob], [18, 9 + bob]]);
  if (cast) {
    v.pts(P.white, [[14, 8 + bob], [17, 8 + bob]]);
    v.pts(P.redL, [[14, 9 + bob], [17, 9 + bob], [12, 8 + bob], [19, 8 + bob]]);
  }
  v.pts(P.paleD, [[12, 10 + bob], [19, 10 + bob], [16, 9 + bob], [15, 10 + bob]]);
  v.pts(P.K, [[13, 11 + bob], [13, 12 + bob], [15, 11 + bob], [15, 12 + bob]]); // slit nostrils
  v.rect(13, 14 + bob, 6, 1, P.K); // mouth
  v.pts(P.K, [[12, 13 + bob]]);
  v.pts(P.paleD, [[14, 16 + bob], [15, 16 + bob]]);
  // wand arm (the hand nearest the player, on the left)
  const wandCol = P.wand;
  if (cast) {
    v.thickLine(cx - 7, 21 + bob, 8, 18, 1.4, P.robeD);
    v.pts(P.robeM, [[cx - 6, 21 + bob], [cx - 3, 20 + bob], [10, 20 + bob]]);
    v.pts(P.pale, [[7, 17], [7, 18], [6, 18], [6, 19], [7, 19]]);
    v.line(8, 17, 0, 12, wandCol);
    v.line(7, 17, 1, 12, P.woodL);
    v.pts(P.green, [[0, 11], [0, 12]]);
    v.pts(P.white, [[0, 11]]);
    v.pts(P.greenM, [[1, 10], [0, 13], [2, 11], [1, 13]]);
  } else {
    v.thickLine(cx - 7, 21 + bob, 10, 28 + bob, 1.4, P.robeD);
    v.pts(P.robeM, [[cx - 6, 22 + bob], [14, 25 + bob]]);
    v.pts(P.pale, [[8, 28 + bob], [8, 29 + bob], [7, 29 + bob], [9, 29 + bob], [7, 30 + bob]]);
    v.line(9, 28 + bob, 1, 23 + bob, wandCol);
    v.line(9, 27 + bob, 2, 22 + bob, P.woodL);
    v.pts(P.white, [[0, 23 + bob]]);
  }
  v.outline(P.K);
  return v;
}

function villainSheet(): Img {
  return strip([villainFrame(0), villainFrame(1), villainFrame(2)]);
}

// ---------------------------------------------------------------------------
// 11. bg-far.png (480x270, opaque, seamless in x): sky, moon, stars, clouds, mountains
// ---------------------------------------------------------------------------

const SKY = ['#070a1e', '#0b0f2c', '#10143a', '#161947', '#1d1c52', '#2a2262', '#3a2c74', '#4d3a86'];

function skyAt(x: number, y: number): string {
  const t = Math.min(1, y / 236) * (SKY.length - 1);
  const lo = Math.min(SKY.length - 2, Math.floor(t));
  return bayer(x, y) < t - lo ? SKY[lo + 1]! : SKY[lo]!;
}

function ridge(x: number, base: number, terms: ReadonlyArray<readonly [number, number, number]>): number {
  let h = 0;
  for (const [amp, k, ph] of terms) h += amp * (1 - Math.abs(Math.sin((Math.PI * k * x) / 480 + ph)));
  return base - h;
}

function bgFar(): Img {
  const W = 480;
  const H = 270;
  const img = new Img(W, H, true);
  const rnd = mulberry32(777);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.px(x, y, skyAt(x, y));

  // moon glow (dithered halo) then disc
  const mx = 300;
  const my = 60;
  for (let y = my - 44; y <= my + 44; y++) {
    for (let x = mx - 44; x <= mx + 44; x++) {
      const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my);
      if (d < 20 || d > 42) continue;
      const t = (1 - (d - 20) / 22) ** 2;
      if (bayer(x, y) < t * 0.8) img.px(x, y, mix(skyAt(x, y), '#7480c0', 0.4));
    }
  }

  // stars (wrapping), a few twinkle crosses
  const starCols = ['#8890b0', '#b8c0e0', '#ffffff', '#fff0a0'];
  for (let n = 0; n < 150; n++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * 190);
    const col = starCols[Math.floor(rnd() * 4)]!;
    const big = rnd() < 0.1;
    if (Math.hypot(x - mx, y - my) < 28) continue;
    img.px(x, y, col);
    if (big) {
      img.px(x + 1, y, mix(col, '#10143a', 0.5));
      img.px(x, y + 1, mix(col, '#10143a', 0.5));
    }
  }
  for (let n = 0; n < 9; n++) {
    const x = Math.floor(rnd() * W);
    const y = 8 + Math.floor(rnd() * 150);
    if (Math.hypot(x - mx, y - my) < 36) continue;
    img.pts('#ffffff', [[x, y]]);
    img.pts('#b8c0e0', [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]);
    if (n % 2 === 0) img.pts('#8890b0', [[x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]]);
  }

  // moon disc with craters
  img.disc(mx, my, 20, '#e6e9fa');
  for (let y = my - 20; y <= my + 20; y++) {
    for (let x = mx - 20; x <= mx + 20; x++) {
      if (Math.hypot(x + 0.5 - mx, y + 0.5 - my) > 20) continue;
      const shade = Math.hypot(x + 0.5 - (mx - 7), y + 0.5 - (my - 7));
      if (shade > 23) img.px(x, y, '#c4c9e6');
      else if (shade > 21 && (x + y) % 2 === 0) img.px(x, y, '#c4c9e6');
    }
  }
  for (const [dx, dy, r] of [[-7, -5, 4], [6, -8, 2.5], [8, 5, 3.5], [-4, 9, 2.5], [0, 1, 2], [-12, 3, 2]] as const) {
    img.disc(mx + dx, my + dy, r, '#b4bbdc');
    img.disc(mx + dx - 0.7, my + dy - 0.7, r - 1, '#cdd2ee');
  }

  // wispy dark clouds
  const clouds: Array<[number, number, number, number]> = [
    [60, 78, 110, 3],
    [230, 112, 140, 4],
    [400, 98, 90, 3],
    [130, 150, 150, 4],
    [340, 160, 120, 3],
    [10, 188, 100, 3],
    [280, 196, 130, 3],
    [440, 140, 70, 2],
  ];
  for (const [ccx, ccy, len, thick] of clouds) {
    for (let dy = -thick; dy <= thick; dy++) {
      const f = 1 - (Math.abs(dy) / (thick + 1)) ** 1.6;
      const half = Math.floor((len / 2) * f);
      const wob = Math.round(Math.sin(dy * 1.7 + ccx) * 6);
      for (let dx = -half; dx <= half; dx++) {
        const x = ccx + wob + dx;
        const y = ccy + dy + Math.round(Math.sin((dx / len) * Math.PI * 3 + ccx) * 1.5);
        const edge = Math.abs(dx) > half - 3;
        if (edge && bayer(x, y) > 0.55) continue;
        const near = Math.hypot(x - mx, y - my) < 70;
        img.px(x, y, dy === -thick || (dy < 0 && near) ? '#2a2f66' : '#12163a');
      }
    }
  }

  // mountains: two seamless ridgelines (|sin| with integer frequencies)
  const far: Array<[number, number, number]> = [[9, 5, 0.3], [7, 11, 1.1], [4, 23, 2.0]];
  const near: Array<[number, number, number]> = [[8, 7, 1.9], [6, 13, 0.4], [3, 29, 0.9]];
  for (let x = 0; x < W; x++) {
    const hf = Math.round(ridge(x, 252, far));
    const hn = Math.round(ridge(x, 268, near));
    for (let y = hf; y < H; y++) img.px(x, y, y === hf ? '#3a3480' : '#2a2460');
    for (let y = hn; y < H; y++) img.px(x, y, y === hn ? '#2a2468' : '#1d1a48');
  }
  return img;
}

// ---------------------------------------------------------------------------
// 12. bg-near.png (480x270, transparent, seamless in x): gothic castle silhouette
// ---------------------------------------------------------------------------

const CASTLE = '#1a1633';
const ROOF = '#13102a';
const RIM = '#2b2552';
const GROUND = '#120f26';
const WIN_Y = '#ffd36a';
const WIN_O = '#f0a040';

function bgNear(): Img {
  const W = 480;
  const H = 270;
  const img = new Img(W, H, true);
  const rnd = mulberry32(31337);
  const BASE = 228;

  // ground profile, flat across the seam so columns 479 and 0 can match exactly
  const ground: number[] = [];
  for (let x = 0; x < W; x++) {
    const g = 224 + 3 * Math.sin((2 * Math.PI * 3 * x) / 480 + 0.5) + 2 * Math.sin((2 * Math.PI * 11 * x) / 480 + 1);
    ground.push(Math.round(g));
  }
  const flat = ground[10]!;
  for (let x = 0; x < W; x++) if (x < 10 || x >= W - 10) ground[x] = flat;

  const window = (x: number, y: number, arched: boolean, lit = rnd() < 0.85) => {
    if (!lit) return;
    const c = rnd() < 0.75 ? WIN_Y : WIN_O;
    if (arched) {
      img.rect(x, y + 1, 3, 3, c);
      img.px(x + 1, y, c);
    } else {
      img.rect(x, y, 2, 3, c);
    }
  };

  const roof = (cx: number, base: number, halfW: number, height: number, flare = 0) => {
    for (let y = base - height; y <= base; y++) {
      const t = (y - (base - height)) / height;
      const hw = Math.round(halfW * (t + flare * Math.sin(t * Math.PI) * (1 - t)));
      img.rect(cx - hw, y, hw * 2 + 1, 1, ROOF);
      if (hw > 0) {
        img.px(cx - hw, y, RIM);
      }
    }
    img.rect(cx, base - height - 4, 1, 4, ROOF); // finial
    img.px(cx + 1, base - height - 4, ROOF);
  };

  const battlements = (x: number, w: number, y: number) => {
    for (let i = 0; i < w; i += 3) img.rect(x + i, y - 2, 2, 2, CASTLE);
  };

  const tower = (cx: number, w: number, topY: number, roofH: number, wins: number[], roofFlare = 0.12) => {
    const x0 = cx - Math.floor(w / 2);
    img.rect(x0, topY, w, BASE + 6 - topY, CASTLE);
    img.rect(x0 - 1, topY - 3, w + 2, 3, CASTLE); // corbelled parapet
    roof(cx, topY - 3, Math.floor(w / 2) + 2, roofH, roofFlare);
    img.rect(x0, topY, 1, BASE - topY, RIM);
    for (const wy of wins) {
      if (w >= 20) {
        window(cx - 5, wy, true);
        window(cx + 3, wy + 3, true);
      } else {
        window(cx - 1, wy, true);
      }
    }
  };

  // curtain wall with crenellations (left of the bridge)
  img.rect(50, 192, 350, BASE + 6 - 192, CASTLE);
  battlements(50, 350, 192);
  for (let x = 60; x < 390; x += 11) window(x, 204 + Math.floor(rnd() * 6), true, rnd() < 0.6);

  // viaduct deck + parapet (396 -> wraps past the seam to the tower at x~27)
  const deckStart = 396;
  const deckLen = 480 - deckStart + 30;
  img.rect(deckStart, 196, deckLen, 6, CASTLE);
  img.rect(deckStart, 192, deckLen, 4, CASTLE);
  for (let i = 0; i < deckLen; i += 3) {
    const x = deckStart + i;
    const wrapped = x % 480;
    if (wrapped > 470 || wrapped < 10) continue; // keep the seam columns identical
    img.rect(x, 190, 2, 2, CASTLE);
  }
  // piers (one centred on the seam), then arches carved between them
  const piers = [396, 436, 476];
  for (const c of piers) img.rect(c - 6, 202, 12, 30, CASTLE);
  const openings: Array<[number, number]> = [[402, 430], [442, 470], [482, 506]];
  for (const [a, b] of openings) {
    const wd = b - a;
    const r = wd / 2;
    const top = 207;
    for (let y = top; y <= 226; y++) {
      for (let x = a; x < b; x++) {
        const dx = x + 0.5 - (a + r);
        const arch = y + 0.5 < top + r ? dx * dx + (y + 0.5 - (top + r)) ** 2 <= r * r : true;
        if (arch) img.px(x, y, null);
      }
    }
  }

  // great hall: big gabled block with buttresses, rose window, lancet windows
  img.rect(165, 168, 102, BASE + 6 - 168, CASTLE);
  for (let y = 120; y <= 168; y++) {
    const hw = Math.round(58 * ((y - 120) / 48));
    img.rect(216 - hw, y, hw * 2 + 1, 1, ROOF);
    img.px(216 - hw, y, RIM);
    img.px(216 + hw, y, RIM);
  }
  for (const bx of [163, 193, 239, 267]) {
    img.rect(bx, 160, 4, BASE + 6 - 160, CASTLE);
    roof(bx + 2, 160, 3, 10);
  }
  img.disc(216, 150, 6, CASTLE);
  img.disc(216, 150, 4.5, WIN_O);
  img.rect(215, 144, 2, 12, CASTLE);
  img.rect(210, 149, 12, 2, CASTLE);
  img.disc(216, 150, 1.5, WIN_Y);
  for (let x = 172; x <= 258; x += 12) {
    if (Math.abs(x - 216) < 8) continue;
    img.rect(x, 176, 3, 12, WIN_Y);
    img.rect(x, 174, 3, 2, WIN_Y);
    img.px(x, 174, null);
    img.px(x + 2, 174, null);
    img.rect(x + 1, 176, 1, 12, CASTLE);
  }
  // great doors
  img.rect(209, 204, 14, 24, WIN_O);
  for (let y = 196; y < 204; y++) {
    const hw = Math.round(7 * Math.sqrt(Math.max(0, 1 - ((204 - y) / 8) ** 2)));
    img.rect(216 - hw, y, hw * 2, 1, WIN_O);
  }
  img.rect(215, 196, 2, 32, CASTLE);

  // towers (tallest near x=340, tip near y=60)
  tower(38, 26, 150, 44, [162, 176, 190]);
  tower(90, 18, 118, 50, [128, 142, 158, 174]);
  tower(130, 22, 156, 36, [170, 184]);
  tower(300, 20, 150, 40, [160, 174, 188]);
  tower(340, 24, 116, 50, [128, 142, 158, 174, 190], 0.18);
  tower(375, 16, 134, 38, [146, 160, 176]);
  // small turrets hugging the hall
  tower(285, 12, 176, 22, [186]);
  tower(150, 12, 172, 22, [182]);
  // slim spire between big towers
  roof(64, 130, 4, 34);
  img.rect(61, 130, 7, 60, CASTLE);
  window(63, 146, true);

  // ground / cliff, solid down to the bottom edge
  for (let x = 0; x < W; x++) {
    for (let y = ground[x]!; y < H; y++) img.px(x, y, y === ground[x] ? CASTLE : GROUND);
  }
  // rocky cliff bumps under the castle
  for (let x = 14; x < W - 14; x += 7) {
    const y = ground[x]! + 2 + Math.floor(rnd() * 3);
    img.rect(x, y, 3, 1, '#17132e');
  }
  return img;
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 13. og.png  (1200x630 link preview, public/og.png): castle night, pixel cake with 23 candles, title.
//     Purely procedural: no photos, no face.
// ---------------------------------------------------------------------------

/** Pixel cake, 52x34 logical px, with exactly 23 candles (one every 2px across the top). */
function cakeImage(): Img {
  const d = new Img(52, 34);
  d.rect(0, 31, 52, 3, '#cfc6e8');
  d.rect(0, 33, 52, 1, '#8f86b8');
  d.rect(2, 17, 48, 14, '#f08ab0');
  d.rect(2, 26, 48, 2, '#c2547f');
  d.rect(2, 30, 48, 1, '#a63f69');
  d.rect(1, 16, 50, 4, '#fff4e0');
  for (let x = 2; x < 50; x += 4) d.rect(x, 20, 2, 2, '#fff4e0'); // frosting drips
  for (let x = 4; x < 48; x += 8) d.rect(x, 23, 2, 2, '#d0243a'); // berries
  for (let i = 0; i < 23; i++) {
    const x = 3 + 2 * i;
    d.rect(x, 9, 1, 7, i % 2 === 0 ? '#ffffff' : '#ff6b6b');
    d.px(x, 6, '#ff9d3c');
    d.px(x, 7, '#ffd36a');
    d.px(x, 8, '#ffd36a');
  }
  return d;
}

async function raw(img: Img): Promise<Sharp> {
  return sharp(Buffer.from(img.data.buffer), { raw: { width: img.w, height: img.h, channels: 4 } });
}

async function ogImage(far: Img, near: Img): Promise<void> {
  const scale = (img: Img, k: number) => raw(img).then((s) => s.resize(img.w * k, img.h * k, { kernel: 'nearest' }).png().toBuffer());
  const sky = await scale(far, 3);
  const castle = await scale(near, 3);
  const cake = await scale(cakeImage(), 6);
  const title = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <style>text { font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif; font-weight: 900; fill: #ffe9a8;
        stroke: #1a1020; stroke-width: 10px; paint-order: stroke; stroke-linejoin: round; }</style>
      <text x="64" y="250" font-size="84">Chúc mừng sinh nhật</text>
      <text x="64" y="356" font-size="84">23 tuổi!</text>
    </svg>`,
  );
  const base = await sharp(sky).composite([{ input: castle }]).png().toBuffer();
  const file = path.join(outDir, '..', '..', 'og.png');
  await sharp(base)
    .extract({ left: 120, top: 90, width: 1200, height: 630 })
    .composite([
      { input: cake, left: 790, top: 392 },
      { input: title, left: 0, top: 0 },
    ])
    .png()
    .toFile(file);
  console.log('wrote public/og.png 1200x630');
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await tilesSheet().save('tiles.png');
  await playerSheet().save('player.png');
  await creaturesSheet().save('creatures.png');
  await candleSheet().save('candle.png');
  await blockSheet().save('block.png');
  await bannerSheet().save('banner.png');
  await doorImage().save('door.png');
  await frameImage().save('frame.png');
  await projectileFrames().save('projectiles.png');
  await villainSheet().save('voldemort.png');
  const far = bgFar();
  await far.save('bg-far.png');
  const near = bgNear();
  for (let y = 0; y < near.h; y++) {
    const a = near.get(0, y);
    const b = near.get(near.w - 1, y);
    if (a.some((v, i) => v !== b[i])) throw new Error(`bg-near seam mismatch at row ${y}`);
  }
  await near.save('bg-near.png');
  await ogImage(far, near);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
