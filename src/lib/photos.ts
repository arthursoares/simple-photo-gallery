/**
 * Data layer — scans src/content/photos/ at build time and produces the
 * gallery model.
 *
 *   <folder>/            → an album (optional <folder>/index.md for metadata)
 *   <loose file>.jpg     → a single photo (optional <loose file>.md sidecar)
 *
 * Ordering chain (per album / for loose photos):
 *   1. explicit `photos:` list in index.md          (curation wins outright)
 *   2. numeric filename prefix (01-, 02-…)          (export convention)
 *   3. EXIF DateTimeOriginal                        (shooting order)
 *   4. date in filename (YYYY-MM-DD-…)              (EXIF-stripped files)
 *   5. filename, alphabetical                       (deterministic fallback)
 *
 * Naming chain (per photo): sidecar/index.md title → EXIF/XMP/IPTC title →
 * humanized filename. Captions: explicit caption → EXIF ImageDescription.
 * Tags: frontmatter tags ∪ IPTC/XMP keywords.
 *
 * Pure helpers (slugs, ordering, filename dates, reference resolution) live
 * in ./naming.ts and are covered by `npm test`.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import path from 'node:path';
import exifr from 'exifr';
import config from '../../gallery.config';
import { renderTemplate } from './caption';
import {
  autoCompare,
  compareNewestFirst,
  createRefResolver,
  formatShutter,
  humanize,
  isValidDate,
  parseFileDate,
  slugify,
  toWallClockUTC,
} from './naming';

const CONTENT_ROOT = '/src/content/photos/';

const IMAGES = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/photos/**/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}',
  { eager: true }
);

export interface ExifInfo {
  date?: Date;
  camera?: string;
  lens?: string;
  focal?: string;
  aperture?: string;
  shutter?: string;
  iso?: string;
  title?: string;
  description?: string;
  keywords: string[];
}

export interface Photo {
  /** Site-unique slug: 'album-slug/file-slug' or 'file-slug' for loose photos. */
  slug: string;
  fileSlug: string;
  fileName: string;
  /**
   * Path within the album ('shot.jpg', or 'rolls/shot.jpg' when the album has
   * sub-folders); the bare filename for loose photos. This — not fileName —
   * is what `cover:`/`photos:` references and metadata sidecars key off, so
   * two same-named files in different sub-folders stay distinct.
   */
  albumRel: string;
  image: ImageMetadata;
  title: string;
  caption?: string;
  alt: string;
  date?: Date;
  tags: string[];
  exif: ExifInfo;
}

export interface Album {
  slug: string;
  title: string;
  date?: Date;
  cover: Photo;
  photos: Photo[];
  tags: string[];
  /** index.md entry, if present — render its body for the writeup. */
  entry?: CollectionEntry<'meta'>;
}

export type GalleryItem =
  | { kind: 'photo'; slug: string; date?: Date; photo: Photo }
  | { kind: 'album'; slug: string; date?: Date; photo: Photo; album: Album };

export interface Gallery {
  mode: 'gallery' | 'single';
  albums: Album[];
  singles: Photo[];
  items: GalleryItem[];
}

/* ---------------------------------------------------------------- helpers */

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === 'object' && 'value' in v) return firstString((v as any).value);
  return undefined;
}

function asKeywords(...sources: unknown[]): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    const list = Array.isArray(src) ? src : src != null ? [src] : [];
    for (const k of list) {
      const s = firstString(k);
      if (s) out.add(s);
    }
  }
  return [...out];
}

async function readExif(fsPath: string, rel: string): Promise<ExifInfo> {
  try {
    const d = await exifr.parse(fsPath, { iptc: true, xmp: true });
    if (!d) return { keywords: [] };
    const make = firstString(d.Make);
    const model = firstString(d.Model);
    const camera = model && make && !model.startsWith(make) ? `${make} ${model}` : model || make;
    // Guard against Invalid Date — malformed EXIF would otherwise blow up
    // Intl.DateTimeFormat at render time. EXIF wall-clock times are re-anchored
    // to UTC so the rendered day does not depend on the build machine's zone.
    const raw = isValidDate(d.DateTimeOriginal)
      ? d.DateTimeOriginal
      : isValidDate(d.CreateDate)
        ? d.CreateDate
        : undefined;
    return {
      date: raw ? toWallClockUTC(raw) : undefined,
      camera,
      lens: firstString(d.LensModel ?? d.Lens),
      focal: d.FocalLength ? `${Math.round(d.FocalLength)}mm` : undefined,
      aperture: d.FNumber ? `f/${d.FNumber}` : undefined,
      shutter: formatShutter(d.ExposureTime),
      iso: d.ISO ? String(d.ISO) : undefined,
      title: firstString(d.title ?? d.ObjectName),
      description: firstString(d.description ?? d.ImageDescription ?? d.Caption),
      keywords: asKeywords(d.Keywords, d.subject),
    };
  } catch (err) {
    // Never fail a build over unreadable metadata — but say so, otherwise a
    // photo silently loses its date, camera and caption with no explanation.
    console.warn(
      `[gallery] could not read EXIF from ${rel}: ${err instanceof Error ? err.message : err}`
    );
    return { keywords: [] };
  }
}

/* ----------------------------------------------------------------- build */

/** One image file found by the glob, with the keys the model is built from. */
interface Located {
  globKey: string;
  /** Path under src/content/photos/, e.g. 'lisbon/rolls/shot.jpg'. */
  rel: string;
  /** Path within the album (or the bare filename for loose photos). */
  albumRel: string;
}

async function buildPhoto(
  file: Located,
  albumSlug: string | null,
  sidecar?: CollectionEntry<'meta'>
): Promise<Photo> {
  const fileName = file.rel.split('/').pop()!;
  // 'rolls/shot.jpg' → path key 'rolls/shot' (unique) + name key 'shot'
  // (what titles and filename-dates are derived from).
  const base = file.albumRel.replace(/\.[^.]+$/, '');
  const baseName = base.split('/').pop()!;
  const exif = await readExif(path.join(process.cwd(), file.globKey), file.rel);
  const fm = sidecar?.data;
  const fileSlug = slugify(base);
  const title = fm?.title ?? exif.title ?? humanize(baseName);
  const caption = fm?.caption ?? exif.description;
  return {
    slug: albumSlug ? `${albumSlug}/${fileSlug}` : fileSlug,
    fileSlug,
    fileName,
    albumRel: file.albumRel,
    image: IMAGES[file.globKey]!.default,
    title,
    caption,
    alt: fm?.alt ?? caption ?? title,
    date: fm?.date ?? exif.date ?? parseFileDate(baseName),
    tags: [...new Set([...(fm?.tags ?? []), ...exif.keywords])],
    exif,
  };
}

/**
 * Apply an album's explicit `photos:` list: listed files come first in the
 * given order (carrying any per-entry title/caption/alt), unlisted files
 * follow in automatic order. Unknown, ambiguous or repeated references throw.
 */
function applyExplicitOrder(
  photos: Photo[],
  albumDir: string,
  entry?: CollectionEntry<'meta'>
): Photo[] {
  const list = entry?.data.photos;
  const sorted = [...photos].sort(autoCompare);
  if (!list?.length) return sorted;

  const resolve = createRefResolver(sorted, albumDir);
  const picked: Photo[] = [];
  const seen = new Set<Photo>();
  for (const ref of list) {
    const file = typeof ref === 'string' ? ref : ref.file;
    const photo = resolve(file, 'photos:');
    if (seen.has(photo)) {
      throw new Error(`${albumDir}/index.md: photos: lists "${file}" more than once.`);
    }
    seen.add(photo);
    if (typeof ref !== 'string') {
      if (ref.title) photo.title = ref.title;
      if (ref.caption) photo.caption = ref.caption;
      if (ref.alt) photo.alt = ref.alt;
      else if (ref.caption || ref.title) photo.alt = ref.caption ?? ref.title ?? photo.alt;
    }
    picked.push(photo);
  }
  return [...picked, ...sorted.filter((p) => !seen.has(p))];
}

let cache: Promise<Gallery> | null = null;
let cacheKey: string | null = null;

/**
 * Cheap signature of everything the model is built from: which images exist
 * and what the markdown says. Used in dev only.
 */
async function contentFingerprint(): Promise<string> {
  const meta = await getCollection('meta');
  return JSON.stringify([
    Object.keys(IMAGES).sort(),
    meta.map((e) => [e.filePath, e.data]).sort(),
  ]);
}

export async function getGallery(): Promise<Gallery> {
  // A production build's content cannot change under us, so build once.
  if (!import.meta.env.DEV) return (cache ??= build());
  // In dev the same cache used to serve a stale model for the rest of the
  // session after any photo or sidecar edit ("restart the dev server"). Rebuild
  // when the content signature changes, and only then — re-reading EXIF for
  // every photo on every request would make a large gallery crawl.
  const key = await contentFingerprint();
  if (!cache || key !== cacheKey) {
    cacheKey = key;
    cache = build();
  }
  return cache;
}

/**
 * The album rendered at '/' in single mode: the one real album, or a synthetic
 * one wrapping the loose photos. Null when single mode has no content to show
 * (the gallery index has the proper empty state).
 */
export function singleAlbum(gallery: Gallery): Album | null {
  if (gallery.mode !== 'single') return null;
  if (gallery.albums.length) return gallery.albums[0]!;
  const [cover] = gallery.singles;
  if (!cover) return null;
  return {
    slug: 'photos',
    title: config.title,
    date: undefined,
    cover,
    photos: gallery.singles,
    tags: [],
    entry: undefined,
  };
}

async function build(): Promise<Gallery> {
  // Key metadata by path relative to the photos root, minus '.md' — the glob
  // loader's generated `id` slugifies and strips '/index', so it is ambiguous.
  const relPath = (e: CollectionEntry<'meta'>) => {
    const filePath = e.filePath;
    if (!filePath) throw new Error(`[gallery] metadata entry ${e.id} has no file path.`);
    const rel = filePath.replace(/\\/g, '/').split('src/content/photos/')[1];
    if (!rel) throw new Error(`[gallery] unexpected metadata path: ${filePath}`);
    return rel.replace(/\.md$/, '');
  };
  const allMeta = await getCollection('meta');
  const metaByPath = new Map(allMeta.filter((e) => !e.data.draft).map((e) => [relPath(e), e]));
  const draftEntries = allMeta.filter((e) => e.data.draft).map(relPath);
  const draftFolders = new Set(
    draftEntries.filter((p) => p.endsWith('/index')).map((p) => p.slice(0, -'/index'.length))
  );
  // Per-photo draft sidecars ('shot.md' with draft: true) hide that photo —
  // both loose and inside albums.
  const draftPhotos = new Set(draftEntries.filter((p) => !p.endsWith('/index')));

  const byFolder = new Map<string | null, Located[]>();
  for (const globKey of Object.keys(IMAGES)) {
    const rel = globKey.slice(CONTENT_ROOT.length);
    const parts = rel.split('/');
    const folder = parts.length > 1 ? parts[0]! : null;
    // Sub-folders inside an album stay part of that album, but keep their path
    // so sidecars and `photos:` references can address them unambiguously.
    const albumRel = folder ? parts.slice(1).join('/') : rel;
    if (folder && draftFolders.has(folder)) continue;
    if (draftPhotos.has(rel.replace(/\.[^.]+$/, ''))) continue;
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push({ globKey, rel, albumRel });
  }

  const albums: Album[] = [];
  const singles: Photo[] = [];

  for (const [folder, files] of byFolder) {
    const albumSlug = folder === null ? null : slugify(folder);
    const built = await Promise.all(
      files.map((file) =>
        // Per-photo sidecars work inside albums too: <folder>/<base>.md
        buildPhoto(file, albumSlug, metaByPath.get(file.rel.replace(/\.[^.]+$/, '')))
      )
    );

    if (folder === null) {
      singles.push(...built);
      continue;
    }

    const entry = metaByPath.get(`${folder}/index`);
    const photos = applyExplicitOrder(built, folder, entry);
    if (!photos.length) continue;
    const cover = entry?.data.cover
      ? createRefResolver(photos, folder)(entry.data.cover, 'cover:')
      : photos[0]!;
    const date =
      entry?.data.date ??
      photos.reduce<Date | undefined>(
        (max, p) => (p.date && (!max || p.date > max) ? p.date : max),
        undefined
      );
    albums.push({
      slug: albumSlug!,
      title: entry?.data.title ?? humanize(folder),
      date,
      cover,
      photos,
      tags: entry?.data.tags ?? [],
      entry,
    });
  }

  singles.sort(autoCompare);

  const items: GalleryItem[] = [
    ...singles.map((p): GalleryItem => ({ kind: 'photo', slug: p.slug, date: p.date, photo: p })),
    ...albums.map(
      (a): GalleryItem => ({ kind: 'album', slug: a.slug, date: a.date, photo: a.cover, album: a })
    ),
  ].sort(compareNewestFirst);

  const mode: Gallery['mode'] =
    config.mode === 'auto'
      ? albums.length === 1 && singles.length === 0
        ? 'single'
        : 'gallery'
      : config.mode;

  return { mode, albums, singles, items };
}

/* ------------------------------------------------------------- captions */

/**
 * Dates are formatted in UTC unless the config says otherwise: EXIF times are
 * re-anchored to UTC (see toWallClockUTC) and frontmatter `date: 2025-04-13`
 * parses as UTC midnight, so any local zone would shift the printed day.
 */
const dateFmt = new Intl.DateTimeFormat(config.locale, {
  timeZone: 'UTC',
  ...config.dateFormat,
});

export function captionContext(photo: Photo): Record<string, string | undefined> {
  return {
    title: photo.title,
    caption: photo.caption,
    date: photo.date ? dateFmt.format(photo.date) : undefined,
    camera: photo.exif.camera,
    lens: photo.exif.lens,
    focal: photo.exif.focal,
    aperture: photo.exif.aperture,
    shutter: photo.exif.shutter,
    iso: photo.exif.iso,
    keywords: photo.tags.length ? photo.tags.join(', ') : undefined,
  };
}

export const photoCaption = (photo: Photo) =>
  renderTemplate(config.captionTemplate, captionContext(photo));

export const photoExifLine = (photo: Photo) =>
  renderTemplate(config.exifTemplate, captionContext(photo));

export const formatDate = (d?: Date) => (d ? dateFmt.format(d) : undefined);
