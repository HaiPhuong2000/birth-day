/**
 * Asset pipeline: content/ (or content.example/) -> public/assets/{photos,face.webp,content.json}
 * Run with: npm run assets
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { Content, PhotoEntry, SourceContent } from '../src/types/content';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'assets');
const outPhotos = path.join(outDir, 'photos');

const MILESTONES = 8;
const MAX_EDGE = 1280;
const FACE_SIZE = 256;
const WEBP_QUALITY = 75;
const QUALITY_FALLBACKS = [70, 65, 60, 55, 50];
const MAX_PHOTO_BYTES = 200 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;

class ValidationError extends Error {}

function fail(msg: string): never {
  throw new ValidationError(msg);
}

function pickSourceDir(): { dir: string; fallback: boolean } {
  const real = path.join(root, 'content');
  if (existsSync(path.join(real, 'content.json'))) return { dir: real, fallback: false };
  return { dir: path.join(root, 'content.example'), fallback: true };
}

function warnFallback(): void {
  const bar = '!'.repeat(72);
  console.warn(
    `\n${bar}\n` +
      `  content/ not found -> using PLACEHOLDER content.example/\n` +
      `  The game will show fake photos. Put your real photos, face.jpg and\n` +
      `  content.json in content/ and run \`npm run assets\` again.\n` +
      `${bar}\n`,
  );
}

function isValidBirthday(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function validateSource(src: SourceContent, files: string[]): void {
  if (!isValidBirthday(src.birthday)) {
    fail(`"birthday" must be YYYY-MM-DD and a real date, got ${JSON.stringify(src.birthday)} (example: "2003-11-16").`);
  }
  if (!Array.isArray(src.photos)) fail('"photos" must be an array in content.json.');

  const heic = files.filter((f) => HEIC_EXT.test(f));
  if (heic.length > 0) {
    fail(
      `HEIC/HEIF is not supported (${heic.join(', ')}). Convert them to JPG first, e.g.\n` +
        `    sips -s format jpeg photo.heic --out photo.jpg      (macOS)\n` +
        `  or export as JPG from the Photos app, then update the file names in content.json.`,
    );
  }

  if (files.length !== src.photos.length) {
    fail(`Found ${files.length} photo files in photos/ but ${src.photos.length} entries in content.json. They must match 1:1.`);
  }

  const entryFiles = src.photos.map((p) => p.file);
  const missingEntry = files.filter((f) => !entryFiles.includes(f));
  const missingFile = entryFiles.filter((f) => !files.includes(f));
  if (missingEntry.length > 0) fail(`Files without an entry in content.json: ${missingEntry.join(', ')}`);
  if (missingFile.length > 0) fail(`Entries in content.json with no file in photos/: ${missingFile.join(', ')}`);

  const sorted = [...files].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const outOfOrder = sorted.findIndex((f, i) => f !== entryFiles[i]);
  if (outOfOrder !== -1) {
    fail(
      `content.json entries must be listed in file-name order (= chronological order). ` +
        `Entry #${outOfOrder + 1} is "${entryFiles[outOfOrder]}" but should be "${sorted[outOfOrder]}".`,
    );
  }

  const milestones = src.photos.filter((p) => p.milestone === true).length;
  if (milestones !== MILESTONES) {
    fail(`Exactly ${MILESTONES} photos must have "milestone": true, found ${milestones}.`);
  }
  for (const [i, p] of src.photos.entries()) {
    if (typeof p.caption !== 'string' || p.caption.trim() === '') fail(`Entry #${i + 1} (${p.file}) has an empty caption.`);
  }
}

async function encodePhoto(input: string, output: string): Promise<{ width: number; height: number; bytes: number }> {
  const base = sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  let buf = await base.clone().webp({ quality: WEBP_QUALITY }).toBuffer();
  for (const q of QUALITY_FALLBACKS) {
    if (buf.length <= MAX_PHOTO_BYTES) break;
    buf = await base.clone().webp({ quality: q }).toBuffer();
  }
  if (buf.length > MAX_PHOTO_BYTES) {
    console.warn(`  warning: ${path.basename(output)} is ${(buf.length / 1024).toFixed(0)}KB (> ${MAX_PHOTO_BYTES / 1024}KB target)`);
  }
  await writeFile(output, buf);
  const meta = await sharp(buf).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0, bytes: buf.length };
}

async function main(): Promise<void> {
  const { dir, fallback } = pickSourceDir();
  if (fallback) warnFallback();
  console.log(`Source: ${path.relative(root, dir)}/`);

  const src = JSON.parse(await readFile(path.join(dir, 'content.json'), 'utf8')) as SourceContent;
  const photosDir = path.join(dir, 'photos');
  if (!existsSync(photosDir)) fail(`Missing folder ${path.relative(root, photosDir)}/`);
  const files = (await readdir(photosDir)).filter((f) => PHOTO_EXT.test(f));
  validateSource(src, files);

  const facePath = ['face.jpg', 'face.jpeg', 'face.png'].map((f) => path.join(dir, f)).find(existsSync);
  if (!facePath) fail(`Missing face photo: put a clear front-facing face.jpg in ${path.relative(root, dir)}/`);

  await rm(outPhotos, { recursive: true, force: true });
  await mkdir(outPhotos, { recursive: true });

  const photos: PhotoEntry[] = [];
  let total = 0;
  for (const p of src.photos) {
    const outName = p.file.replace(/\.[^.]+$/, '') + '.webp';
    let enc;
    try {
      enc = await encodePhoto(path.join(photosDir, p.file), path.join(outPhotos, outName));
    } catch (err) {
      fail(`Could not read ${p.file}: ${(err as Error).message}`);
    }
    total += enc.bytes;
    photos.push({
      file: outName,
      caption: p.caption,
      label: p.label ?? '',
      milestone: p.milestone === true,
      width: enc.width,
      height: enc.height,
    });
    console.log(`  ${outName}  ${enc.width}x${enc.height}  ${(enc.bytes / 1024).toFixed(0)}KB${p.milestone ? '  [milestone]' : ''}`);
  }
  if (total > MAX_TOTAL_BYTES) {
    fail(`Total photo size is ${(total / 1048576).toFixed(1)}MB, limit is ${MAX_TOTAL_BYTES / 1048576}MB.`);
  }

  await sharp(facePath)
    .rotate()
    .resize(FACE_SIZE, FACE_SIZE, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(path.join(outDir, 'face.webp'));

  const out: Content = {
    name: src.name,
    age: src.age,
    birthday: src.birthday,
    loginHint: src.loginHint,
    photos,
    wish: src.wish,
  };
  await writeFile(path.join(outDir, 'content.json'), JSON.stringify(out, null, 2) + '\n');

  const st = await stat(path.join(outDir, 'face.webp'));
  console.log(
    `\nOK: ${photos.length} photos (${(total / 1024).toFixed(0)}KB total, ${src.photos.filter((p) => p.milestone).length} milestones), ` +
      `face.webp ${(st.size / 1024).toFixed(0)}KB, content.json written to ${path.relative(root, outDir)}/`,
  );
}

main().catch((err) => {
  if (err instanceof ValidationError) {
    console.error(`\nERROR: ${err.message}\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
