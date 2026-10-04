// Generates PWA icons into public/icons/ from an inline SVG dumbbell glyph.
// sharp is not a project dep: run `npm i --no-save sharp && node scripts/gen-icons.mjs`.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

// pad = fraction of safe zone (maskable needs ~20% padding)
const svg = (size, pad, rounded) => {
  const s = 512, c = s / 2, k = 1 - pad * 2;
  const g = (x) => c + (x - c) * k;
  const bar = (x, y, w, h, r) => `<rect x="${g(x)}" y="${g(y)}" width="${w * k}" height="${h * k}" rx="${r * k}" fill="#c6ff00"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" ${rounded ? 'rx="112"' : ''} fill="#0b0d10"/>
  ${bar(150, 244, 212, 24, 8)}
  ${bar(92, 166, 46, 180, 14)}${bar(374, 166, 46, 180, 14)}
  ${bar(52, 200, 36, 112, 12)}${bar(424, 200, 36, 112, 12)}
  <text x="${c}" y="${g(430)}" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="${76 * k}" letter-spacing="${8 * k}" fill="#f4f6f8" text-anchor="middle">PPL</text>
</svg>`);
};

const jobs = [
  ['icon-192.png', 192, 0.04, false],
  ['icon-512.png', 512, 0.04, false],
  ['icon-maskable-512.png', 512, 0.14, false],
  ['apple-touch-icon.png', 180, 0.06, false],
  ['favicon-32.png', 32, 0, true],
];
for (const [name, size, pad, rounded] of jobs) {
  await sharp(svg(size, pad, rounded)).png().toFile(join(out, name));
  console.log('wrote', name);
}
