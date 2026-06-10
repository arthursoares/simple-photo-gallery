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
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import path from 'node:path';
import exifr from 'exifr';
import config from '../../gallery.config';
import { renderTemplate } from './caption';

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

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const FILE_PREFIX = /^(\d{1,4})[-_ ]+/;
const FILE_DATE = /^(\d{4})-(\d{2})-(\d{2})[-_ ]*/;

function parsePrefix(base: string): number | null {
  // A leading YYYY-MM-DD is a date, not an ordering prefix.
  if (FILE_DATE.test(base)) return null;
  const m = base.match(FILE_PREFIX);
  return m ? parseInt(m[1], 10) : null;
}

function parseFileDate(base: string): Date | undefined {
  const m = base.match(FILE_DATE);
  if (!m) return undefined;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return isNaN(d.getTime()) ? undefined : d;
}

function humanize(base: string): string {
  // Strip a leading date and/or any run of numeric ordering segments
  // ('2025-04-lisbon' → 'lisbon', '01-contact-sheet' → 'contact-sheet').
  const stripped = base.replace(FILE_DATE, '').replace(/^(\d{1,4}[-_ ]+)+/, '');
  const words = (stripped || base).replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatShutter(t?: number): string | undefined {
  if (!t || t <= 0) return undefined;
  return t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}`;
}

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

async function readExif(fsPath: string): Promise<ExifInfo> {
  try {
    const d = await exifr.parse(fsPath, { iptc: true, xmp: true });
    if (!d) return { keywords: [] };
    const make = firstString(d.Make);
    const model = firstString(d.Model);
    const camera = model && make && !model.startsWith(make) ? `${make} ${model}` : model || make;
    const date: Date | undefined =
      d.DateTimeOriginal instanceof Date
        ? d.DateTimeOriginal
        : d.CreateDate instanceof Date
          ? d.CreateDate
          : undefined;
    return {
      date,
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
  } catch {
    return { keywords: [] };
  }
}

/* ----------------------------------------------------------------- build */

type PhotoOverride = { title?: string; caption?: string; alt?: string };

async function buildPhoto(
  globKey: string,
  albumSlug: string | null,
  override: PhotoOverride,
  sidecar?: CollectionEntry<'meta'>
): Promise<Photo> {
  const fileName = globKey.split('/').pop()!;
  const base = fileName.replace(/\.[^.]+$/, '');
  const exif = await readExif(path.join(process.cwd(), globKey));
  const fm = sidecar?.data;
  const fileSlug = slugify(base);
  const title = override.title ?? fm?.title ?? exif.title ?? humanize(base);
  const caption = override.caption ?? fm?.caption ?? exif.description;
  return {
    slug: albumSlug ? `${albumSlug}/${fileSlug}` : fileSlug,
    fileSlug,
    fileName,
    image: IMAGES[globKey].default,
    title,
    caption,
    alt: override.alt ?? fm?.alt ?? caption ?? title,
    date: fm?.date ?? exif.date ?? parseFileDate(base),
    tags: [...new Set([...(fm?.tags ?? []), ...exif.keywords])],
    exif,
  };
}

function autoCompare(a: Photo, b: Photo): number {
  const ap = parsePrefix(a.fileName);
  const bp = parsePrefix(b.fileName);
  if (ap != null && bp != null && ap !== bp) return ap - bp;
  if ((ap != null) !== (bp != null)) return ap != null ? -1 : 1;
  const ad = a.date?.getTime();
  const bd = b.date?.getTime();
  if (ad != null && bd != null && ad !== bd) return ad - bd;
  if ((ad != null) !== (bd != null)) return ad != null ? -1 : 1;
  return a.fileName.localeCompare(b.fileName);
}

function applyExplicitOrder(photos: Photo[], entry?: CollectionEntry<'meta'>): Photo[] {
  const list = entry?.data.photos;
  const sorted = [...photos].sort(autoCompare);
  if (!list?.length) return sorted;
  const byFile = new Map(sorted.map((p) => [p.fileName, p]));
  const picked: Photo[] = [];
  for (const ref of list) {
    const file = typeof ref === 'string' ? ref : ref.file;
    const photo = byFile.get(file);
    if (!photo) continue;
    byFile.delete(file);
    if (typeof ref !== 'string') {
      if (ref.title) photo.title = ref.title;
      if (ref.caption) photo.caption = ref.caption;
      if (ref.alt) photo.alt = ref.alt;
      else if (ref.caption || ref.title) photo.alt = ref.caption ?? ref.title ?? photo.alt;
    }
    picked.push(photo);
  }
  return [...picked, ...sorted.filter((p) => byFile.has(p.fileName))];
}

let cache: Promise<Gallery> | null = null;

export function getGallery(): Promise<Gallery> {
  return (cache ??= build());
}

async function build(): Promise<Gallery> {
  // Key metadata by path relative to the photos root, minus '.md' — the glob
  // loader's generated `id` slugifies and strips '/index', so it is ambiguous.
  const relPath = (e: CollectionEntry<'meta'>) =>
    e.filePath!.replace(/\\/g, '/').split('src/content/photos/')[1]!.replace(/\.md$/, '');
  const allMeta = await getCollection('meta');
  const metaByPath = new Map(
    allMeta.filter((e) => !e.data.draft).map((e) => [relPath(e), e])
  );
  const draftFolders = new Set(
    allMeta
      .filter((e) => e.data.draft && relPath(e).endsWith('/index'))
      .map((e) => relPath(e).slice(0, -'/index'.length))
  );

  const byFolder = new Map<string | null, string[]>();
  for (const key of Object.keys(IMAGES)) {
    const rel = key.slice(CONTENT_ROOT.length);
    const parts = rel.split('/');
    const folder = parts.length > 1 ? parts[0] : null;
    if (folder && draftFolders.has(folder)) continue;
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(key);
  }

  const albums: Album[] = [];
  const singles: Photo[] = [];

  for (const [folder, keys] of byFolder) {
    if (folder === null) {
      for (const key of keys) {
        const base = key.split('/').pop()!.replace(/\.[^.]+$/, '');
        singles.push(await buildPhoto(key, null, {}, metaByPath.get(base)));
      }
      continue;
    }
    const entry = metaByPath.get(`${folder}/index`);
    const albumSlug = slugify(folder);
    const photos = applyExplicitOrder(
      await Promise.all(keys.map((key) => buildPhoto(key, albumSlug, {}))),
      entry
    );
    if (!photos.length) continue;
    const cover =
      (entry?.data.cover && photos.find((p) => p.fileName === entry.data.cover)) || photos[0];
    const date =
      entry?.data.date ??
      photos.reduce<Date | undefined>(
        (max, p) => (p.date && (!max || p.date > max) ? p.date : max),
        undefined
      );
    albums.push({
      slug: albumSlug,
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
  ].sort((a, b) => {
    const ad = a.date?.getTime();
    const bd = b.date?.getTime();
    if (ad != null && bd != null && ad !== bd) return bd - ad; // newest first
    if ((ad != null) !== (bd != null)) return ad != null ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });

  const mode: Gallery['mode'] =
    config.mode === 'auto'
      ? albums.length === 1 && singles.length === 0
        ? 'single'
        : 'gallery'
      : config.mode;

  return { mode, albums, singles, items };
}

/* ------------------------------------------------------------- captions */

const dateFmt = new Intl.DateTimeFormat(config.locale, config.dateFormat);

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
