// Generates iOS apple-touch-startup-image splash PNGs (portrait) into public/splash/.
// sharp is not a project dep: run `npm i --no-save sharp && node scripts/gen-splash.mjs`.
// Prints the <link> tags for index.html. Set OUT_DIR to override the output folder.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = process.env.OUT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'splash');
mkdirSync(out, { recursive: true });

// [css width, css height, DPR, note]
export const DEVICES = [
  [402, 874, 3, 'iPhone 18 Pro / 17 Pro / 17'],
  [440, 956, 3, 'iPhone 18 Pro Max / 17 Pro Max'],
  [393, 852, 3, 'iPhone 16 / 15 / 15 Pro'],
  [430, 932, 3, 'iPhone 16 Plus / 15 Pro Max'],
  [390, 844, 3, 'iPhone 14 / 13 / 12'],
  [375, 812, 3, 'iPhone 13 mini / X / XS'],
  [414, 896, 3, 'iPhone 11 Pro Max / XS Max'],
  [414, 896, 2, 'iPhone 11 / XR'],
  [375, 667, 2, 'iPhone SE / 8'],
];

const svg = (W, H) => {
  const u = W / 100; // 1% of width
  const cx = W / 2, cy = H * 0.44;
  const g = 30 * u; // glyph width
  const bar = (x, y, w, h, r) => `<rect x="${cx + x * g}" y="${cy + y * g}" width="${w * g}" height="${h * g}" rx="${r * g}" fill="#c6ff00"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0b0d10"/>
  ${bar(-0.27, -0.03, 0.54, 0.06, 0.02)}
  ${bar(-0.43, -0.235, 0.12, 0.47, 0.035)}${bar(0.31, -0.235, 0.12, 0.47, 0.035)}
  ${bar(-0.54, -0.145, 0.095, 0.29, 0.03)}${bar(0.445, -0.145, 0.095, 0.29, 0.03)}
  <text x="${cx}" y="${cy + 0.62 * g}" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="${8 * u}" letter-spacing="${0.6 * u}" fill="#f4f6f8" text-anchor="middle">PPL TRACKER</text>
</svg>`);
};

const links = [];
for (const [w, h, dpr, note] of DEVICES) {
  const W = w * dpr, H = h * dpr;
  const name = `splash-${W}x${H}.png`;
  await sharp(svg(W, H)).png({ compressionLevel: 9, palette: true }).toFile(join(out, name));
  links.push(`    <!-- ${note} (${w}x${h}@${dpr}) -->\n    <link rel="apple-touch-startup-image" href="%BASE_URL%splash/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`);
  console.error('wrote', name);
}
console.log(links.join('\n'));
