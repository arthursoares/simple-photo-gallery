/**
 * Ingest photos into the gallery — the one command an agent (or human)
 * needs to add content:
 *
 *   npm run album -- --title "Sicily: Palermo" --dir ~/photos/palermo
 *   npm run album -- --single --dir ~/photos/one-offs
 *
 * Resizes every image in --dir to a web-sane size (default: 2400px long
 * edge, quality 85) while PRESERVING EXIF — the build uses it for ordering,
 * dates, and captions — auto-orienting pixels as it goes. Album mode writes
 * into src/content/photos/<slug>/ and stubs an index.md; --single copies
 * into the photos root as loose photos.
 *
 * Flags:
 *   --title <s>     album title (required unless --single)
 *   --dir <path>    source folder of images (required)
 *   --slug <s>      album folder name (default: slugified title)
 *   --date <date>   album date for index.md (default: omitted — the build
 *                   falls back to the newest photo's EXIF date)
 *   --caption <s>   album excerpt for index.md
 *   --max <px>      long-edge cap (default 2400)
 *   --quality <n>   JPEG/WebP quality (default 85)
 *   --single        loose photos instead of an album
 *   --force         add into an existing album folder
 */
import sharp from 'sharp';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.join(process.cwd(), 'src/content/photos');
const EXTENSIONS = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp', '.avif': 'avif' };

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--single') flags.single = true;
  else if (a === '--force') flags.force = true;
  else if (a.startsWith('--')) flags[a.slice(2)] = args[++i];
}

const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

if (!flags.dir) fail('--dir <source folder> is required');
if (!flags.single && !flags.title) fail('--title is required (or pass --single for loose photos)');

const srcDir = path.resolve(flags.dir.replace(/^~(?=\/)/, process.env.HOME ?? '~'));
if (!existsSync(srcDir)) fail(`source folder not found: ${srcDir}`);

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'album';
const slug = flags.single ? null : (flags.slug ?? slugify(flags.title));
const destDir = flags.single ? ROOT : path.join(ROOT, slug);

if (!flags.single && existsSync(destDir) && !flags.force) {
  fail(`album folder already exists: src/content/photos/${slug} (pass --force to add into it)`);
}

const max = parseInt(flags.max ?? '2400', 10);
const quality = parseInt(flags.quality ?? '85', 10);

const entries = (await readdir(srcDir)).sort();
const images = [];
const skipped = [];
for (const name of entries) {
  const full = path.join(srcDir, name);
  if (!(await stat(full)).isFile()) continue;
  const ext = path.extname(name).toLowerCase();
  if (EXTENSIONS[ext]) images.push({ full, name, ext });
  else skipped.push(name);
}
if (!images.length) fail(`no images (.jpg/.jpeg/.png/.webp/.avif) found in ${srcDir}`);

await mkdir(destDir, { recursive: true });

const written = [];
for (const { full, name, ext } of images) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const out = path.join(destDir, safeName);
  if (existsSync(out)) {
    skipped.push(`${name} (already in destination)`);
    continue;
  }
  const meta = await sharp(full).metadata();
  const landscape = (meta.width ?? 0) >= (meta.height ?? 0);
  const needsResize = Math.max(meta.width ?? 0, meta.height ?? 0) > max;
  if (!needsResize && EXTENSIONS[ext] !== 'png') {
    // Already small enough — copy verbatim so nothing is re-encoded.
    await copyFile(full, out);
  } else {
    /* .rotate() bakes EXIF orientation into the pixels (sharp resets the
       Orientation tag); .withMetadata() keeps the rest of the EXIF, which
       the gallery build relies on for ordering and captions. */
    let img = sharp(full)
      .rotate()
      .resize({
        ...(landscape ? { width: Math.min(max, meta.width) } : { height: Math.min(max, meta.height) }),
        withoutEnlargement: true,
      })
      .withMetadata();
    const format = EXTENSIONS[ext];
    if (format === 'jpeg') img = img.jpeg({ quality, mozjpeg: true });
    else if (format === 'webp') img = img.webp({ quality });
    else if (format === 'avif') img = img.avif({ quality });
    else img = img.png();
    await img.toFile(out);
  }
  const kb = Math.round((await stat(out)).size / 1024);
  written.push(`${path.relative(process.cwd(), out)} (${kb} KB)`);
}

if (!flags.single) {
  const indexPath = path.join(destDir, 'index.md');
  if (!existsSync(indexPath)) {
    await writeFile(
      indexPath,
      `---
title: ${JSON.stringify(flags.title)}
${flags.date ? `date: ${flags.date}\n` : ''}${flags.caption ? `caption: ${JSON.stringify(flags.caption)}\n` : ''}# cover: <filename>          # index thumbnail (default: first photo)
# photos:                     # explicit order + per-photo captions
#   - file: <filename>
#     caption: <text>
tags: []
---

`
    );
    written.push(`src/content/photos/${slug}/index.md`);
  }
}

console.log(`\nAdded ${written.length} file(s)${flags.single ? ' (loose photos)' : ` to album "${flags.title}"`}:`);
for (const w of written) console.log('  ' + w);
if (skipped.length) console.log(`\nSkipped: ${skipped.join(', ')}`);
console.log(`\nNext steps:
  1. ${flags.single ? 'Optionally add <name>.md sidecars for titles/captions' : `Edit src/content/photos/${slug}/index.md (captions, cover, order)`}
  2. npm run build                     # validate locally (optional — CI also builds)
  3. git add -A && git commit -m ${JSON.stringify(flags.single ? 'feat(photos): add photos' : `feat(album): ${slug}`)} && git push
  4. gh run watch --exit-status        # wait for the Pages deploy
`);
