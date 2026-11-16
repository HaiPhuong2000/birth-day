/**
 * Generates placeholder JPGs for the dev fixture in content.example/.
 * Run with: npm run example:photos
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { Sharp } from 'sharp';
import type { SourceContent } from '../src/types/content';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'content.example');
const photosDir = path.join(dir, 'photos');

/** Photo whose pixels are landscape but carry EXIF orientation 6, to exercise .rotate(). */
const EXIF_ROTATED_INDEX = 7;

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h % 360} ${s}% ${l}%)`;
}

async function placeholder(
  width: number,
  height: number,
  hue: number,
  text: string,
  face: boolean,
): Promise<Sharp> {
  const min = Math.min(width, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${hsl(hue, 70, 62)}"/>
        <stop offset="1" stop-color="${hsl(hue + 50, 70, 38)}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    ${face ? `
    <circle cx="${width / 2}" cy="${height * 0.4}" r="${min * 0.26}" fill="#f4c9a0" stroke="#3a2a1a" stroke-width="${min * 0.01}"/>
    <circle cx="${width / 2 - min * 0.09}" cy="${height * 0.37}" r="${min * 0.03}" fill="#2a1a0a"/>
    <circle cx="${width / 2 + min * 0.09}" cy="${height * 0.37}" r="${min * 0.03}" fill="#2a1a0a"/>
    <path d="M ${width / 2 - min * 0.1} ${height * 0.46} Q ${width / 2} ${height * 0.54} ${width / 2 + min * 0.1} ${height * 0.46}" stroke="#2a1a0a" stroke-width="${min * 0.015}" fill="none"/>
    ` : ''}
    <text x="50%" y="${height * (face ? 0.88 : 0.58)}" font-size="${min * (face ? 0.2 : 0.45)}" font-family="Helvetica, Arial, sans-serif" font-weight="700"
      text-anchor="middle" fill="#fff" stroke="#000" stroke-opacity=".35" stroke-width="${min * 0.01}">${text}</text>
  </svg>`;
  return sharp(Buffer.from(svg));
}

async function main(): Promise<void> {
  const content = JSON.parse(await readFile(path.join(dir, 'content.json'), 'utf8')) as SourceContent;
  await mkdir(photosDir, { recursive: true });

  for (const [i, entry] of content.photos.entries()) {
    const n = i + 1;
    // Mix of orientations: every 3rd portrait, others landscape.
    const portrait = n % 3 === 1;
    let [w, h] = portrait ? [960, 1280] : [1280, 960];
    const rotated = n === EXIF_ROTATED_INDEX;
    if (rotated) [w, h] = [1280, 960]; // stored landscape, displayed portrait via EXIF
    const img = await placeholder(w, h, n * 37, String(n).padStart(2, '0'), false);
    let out = img.jpeg({ quality: 82 });
    if (rotated) out = out.withMetadata({ orientation: 6 });
    await writeFile(path.join(photosDir, entry.file), await out.toBuffer());
  }

  const face = await placeholder(600, 600, 20, '', true);
  await writeFile(path.join(dir, 'face.jpg'), await face.jpeg({ quality: 85 }).toBuffer());
  console.log(`Wrote ${content.photos.length} placeholder photos + face.jpg to ${path.relative(root, dir)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
