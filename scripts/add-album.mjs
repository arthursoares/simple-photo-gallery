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

const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

const BOOLEAN_FLAGS = new Set(['single', 'force']);
const VALUE_FLAGS = new Set(['title', 'dir', 'slug', 'date', 'caption', 'max', 'quality']);

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) fail(`unexpected argument "${a}" (flags look like --title "…")`);
  const name = a.slice(2);
  if (BOOLEAN_FLAGS.has(name)) {
    flags[name] = true;
    continue;
  }
  if (!VALUE_FLAGS.has(name)) fail(`unknown flag --${name}`);
  const value = args[++i];
  // '--title --dir x' used to silently set title to '--dir'.
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`);
  flags[name] = value;
}

if (!flags.dir) fail('--dir <source folder> is required');
if (!flags.single && !flags.title) fail('--title is required (or pass --single for loose photos)');
if (flags.single && flags.slug) fail('--slug has no meaning with --single (loose photos have no album folder)');

const srcDir = path.resolve(flags.dir.replace(/^~(?=\/)/, process.env.HOME ?? '~'));
if (!existsSync(srcDir)) fail(`source folder not found: ${srcDir}`);

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'album';

/* A slug becomes a path segment under src/content/photos/ and a URL segment on
   the site, so it must be a plain name — an unsanitised --slug could escape the
   content root entirely (--slug ../../somewhere). */
let slug = null;
if (!flags.single) {
  slug = flags.slug ?? slugify(flags.title);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug) || slug.includes('..')) {
    fail(
      `--slug "${slug}" is not a valid album folder name ` +
        '(lowercase letters, digits, dot, dash and underscore only)'
    );
  }
}
const destDir = flags.single ? ROOT : path.join(ROOT, slug);

if (!flags.single && existsSync(destDir) && !flags.force) {
  fail(`album folder already exists: src/content/photos/${slug} (pass --force to add into it)`);
}

/* A NaN here used to disable resizing silently, copying camera originals into
   the repo — exactly what this script exists to prevent. */
const positiveInt = (value, name, fallback) => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(`--${name} must be a positive whole number (got "${value}")`);
  return n;
};
const max = positiveInt(flags.max, 'max', 2400);
const quality = positiveInt(flags.quality, 'quality', 85);
if (quality > 100) fail(`--quality must be between 1 and 100 (got "${flags.quality}")`);

if (flags.date && isNaN(new Date(flags.date).getTime())) {
  fail(`--date "${flags.date}" is not a date the build can parse (try YYYY-MM-DD)`);
}

const entries = (await readdir(srcDir)).sort();
const images = [];
const skipped = [];
for (const name of entries) {
  const full = path.join(srcDir, name);
  if (!(await stat(full)).isFile()) {
    // Sub-folders are not descended into; say so rather than ignoring them.
    skipped.push(`${name} (not a file — sub-folders are not scanned)`);
    continue;
  }
  const ext = path.extname(name).toLowerCase();
  if (EXTENSIONS[ext]) images.push({ full, name, ext });
  else skipped.push(name);
}
if (!images.length) fail(`no images (.jpg/.jpeg/.png/.webp/.avif) found in ${srcDir}`);

await mkdir(destDir, { recursive: true });

const written = [];
const producedBy = new Map();
for (const { full, name, ext } of images) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const out = path.join(destDir, safeName);
  // Two sources can normalise to one name ('A.JPG' and 'a.jpg'); saying
  // "already in destination" for the second would be a lie.
  const clash = producedBy.get(safeName);
  if (clash) {
    skipped.push(`${name} (would overwrite ${clash} → both become ${safeName})`);
    continue;
  }
  if (existsSync(out)) {
    skipped.push(`${name} (already in destination)`);
    continue;
  }
  producedBy.set(safeName, name);
  const meta = await sharp(full).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    skipped.push(`${name} (could not read image dimensions)`);
    continue;
  }
  const landscape = width >= height;
  const needsResize = Math.max(width, height) > max;
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
        ...(landscape ? { width: Math.min(max, width) } : { height: Math.min(max, height) }),
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
