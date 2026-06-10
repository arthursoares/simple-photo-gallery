/**
 * Generate placeholder demo photos into src/content/photos/.
 * Each gets EXIF written (camera, date, exposure) so the EXIF-driven
 * ordering/captions/tagging are exercised without real photographs.
 *
 *   npm run demo            # refuses if the content folder already has photos
 *   npm run demo -- --force # generate anyway, alongside existing content
 */
import sharp from 'sharp';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src/content/photos');

if (!process.argv.includes('--force')) {
  const existing = await readdir(ROOT, { recursive: true }).catch(() => []);
  if (existing.some((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))) {
    console.error(
      'src/content/photos/ already contains photos — refusing to mix in placeholders.\n' +
        'Run with --force to generate anyway.'
    );
    process.exit(1);
  }
}

const PALETTES = [
  ['#262b7d', '#7b82d4'],
  ['#e8a217', '#fdf0d0'],
  ['#1c1b18', '#6b6860'],
  ['#2c6e49', '#9ec5ab'],
  ['#9b2c2c', '#e8b4b4'],
  ['#4670a0', '#cdd9e5'],
];

function svg(w, h, label, [a, b]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${a}"/>
  <polygon points="0,${h} ${w},0 ${w},${h}" fill="${b}" opacity="0.85"/>
  <rect x="${w / 2 - 100}" y="${h / 2 - 44}" width="200" height="88" fill="${a}" stroke="#f6f5f2" stroke-width="4"/>
  <text x="50%" y="50%" font-family="Menlo, monospace" font-size="40" font-weight="bold"
        fill="#f6f5f2" text-anchor="middle" dominant-baseline="central">${label}</text>
</svg>`;
}

async function photo(rel, { w, h, label, palette, date, camera, desc, iso, f, t, focal }) {
  const file = path.join(ROOT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  let img = sharp(Buffer.from(svg(w, h, label, PALETTES[palette % PALETTES.length])));
  const ifd0 = {};
  const ifd2 = {};
  if (camera) {
    const [make, ...model] = camera.split(' ');
    ifd0.Make = make;
    ifd0.Model = model.join(' ') || make;
  }
  if (desc) ifd0.ImageDescription = desc;
  if (date) ifd2.DateTimeOriginal = date;
  if (iso) ifd2.ISOSpeedRatings = String(iso);
  if (f) ifd2.FNumber = `${Math.round(f * 10)}/10`;
  if (t) ifd2.ExposureTime = t;
  if (focal) ifd2.FocalLength = `${focal}/1`;
  img = img.withExif({ IFD0: ifd0, IFD2: ifd2 });
  await img.jpeg({ quality: 82 }).toFile(file);
  console.log('wrote', rel);
}

const CAM_A = 'FUJIFILM X-T5';
const CAM_B = 'Apple iPhone 15 Pro';

/* Album: lisbon — EXIF dates define shooting order; index.md curates 3. */
await photo('2025-04-lisbon/alfama-steps.jpg', { w: 1200, h: 1600, label: 'ALFAMA', palette: 0, date: '2025:04:11 09:12:00', camera: CAM_A, iso: 200, f: 5.6, t: '1/500', focal: 23 });
await photo('2025-04-lisbon/tram-28.jpg', { w: 1600, h: 1067, label: 'TRAM 28', palette: 1, date: '2025:04:11 11:40:00', camera: CAM_A, iso: 400, f: 8, t: '1/250', focal: 35 });
await photo('2025-04-lisbon/miradouro.jpg', { w: 1600, h: 900, label: 'MIRADOURO', palette: 5, date: '2025:04:11 18:55:00', camera: CAM_A, iso: 800, f: 2.8, t: '1/125', focal: 56 });
await photo('2025-04-lisbon/azulejos.jpg', { w: 1200, h: 1200, label: 'AZULEJOS', palette: 3, date: '2025:04:12 10:05:00', camera: CAM_B, iso: 64, f: 1.8, t: '1/1000', desc: 'Tile wall in Mouraria' });
await photo('2025-04-lisbon/cais-do-sodre.jpg', { w: 1600, h: 1067, label: 'CAIS', palette: 2, date: '2025:04:12 21:30:00', camera: CAM_A, iso: 3200, f: 1.4, t: '1/60', focal: 35 });
await photo('2025-04-lisbon/belem-light.jpg', { w: 1067, h: 1600, label: 'BELÉM', palette: 4, date: '2025:04:13 08:20:00', camera: CAM_A, iso: 125, f: 11, t: '1/320', focal: 23 });

/* Album: studio-scans — numeric prefixes define the order, no index.md. */
await photo('studio-scans/01-contact-sheet.jpg', { w: 1200, h: 1500, label: 'SCAN 01', palette: 2, camera: 'EPSON V600' });
await photo('studio-scans/02-portra-400.jpg', { w: 1500, h: 1000, label: 'SCAN 02', palette: 1, camera: 'EPSON V600' });
await photo('studio-scans/03-tri-x.jpg', { w: 1000, h: 1500, label: 'SCAN 03', palette: 0, camera: 'EPSON V600' });
await photo('studio-scans/04-hp5.jpg', { w: 1500, h: 1500, label: 'SCAN 04', palette: 3, camera: 'EPSON V600' });

/* Loose photos — one with a sidecar, one EXIF-only, one filename-dated. */
await photo('rooftop-fog.jpg', { w: 1600, h: 1067, label: 'FOG', palette: 5, date: '2025:01:19 07:45:00', camera: CAM_A, iso: 500, f: 4, t: '1/200', focal: 90 });
await photo('night-window.jpg', { w: 1067, h: 1600, label: 'WINDOW', palette: 2, date: '2025:02:02 23:10:00', camera: CAM_B, iso: 1600, f: 1.8, t: '1/30', desc: 'Night window, long exposure handheld' });
await photo('2025-03-08-red-bicycle.jpg', { w: 1200, h: 1600, label: 'BICYCLE', palette: 4 });

console.log('done.');
