/**
 * Pure naming / ordering helpers used by the data layer.
 *
 * Deliberately free of Astro imports so `npm test` can exercise them
 * directly — these functions carry most of the content-model logic
 * (slugs, ordering chain, filename dates) and `astro build` cannot
 * catch a regression in any of them.
 */

/**
 * ASCII-lowercase slug. Names with no ASCII alphanumerics (e.g. '東京.jpg')
 * would slug to '' — fall back to a stable hash so the slug stays unique
 * and non-empty. There is no transliteration, so distinct names can still
 * collide ('a b' and 'a-b'); album-level collisions fail the build in
 * [slug].astro.
 */
export function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'p-' + h.toString(36);
}

const FILE_PREFIX = /^(\d{1,4})[-_ ]+/;
const FILE_DATE = /^(\d{4})-(\d{2})-(\d{2})[-_ ]*/;

/** Numeric ordering prefix ('01-foo' → 1). A leading YYYY-MM-DD is a date. */
export function parsePrefix(base: string): number | null {
  if (FILE_DATE.test(base)) return null;
  const m = base.match(FILE_PREFIX);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Date encoded in a filename ('2025-04-13-lisbon' → that day). Anchored at
 * UTC noon so the rendered day is the same in every timezone.
 */
export function parseFileDate(base: string): Date | undefined {
  const m = base.match(FILE_DATE);
  if (!m) return undefined;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return isNaN(d.getTime()) ? undefined : d;
}

/** 'stripped-file-name' → 'Stripped file name'. */
export function humanize(base: string): string {
  // Strip a leading date and/or any run of numeric ordering segments
  // ('2025-04-lisbon' → 'lisbon', '01-contact-sheet' → 'contact-sheet').
  const stripped = base.replace(FILE_DATE, '').replace(/^(\d{1,4}[-_ ]+)+/, '');
  const words = (stripped || base).replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** 0.005 → '1/200'; 2 → '2s'. */
export function formatShutter(t?: number): string | undefined {
  if (!t || t <= 0) return undefined;
  return t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}`;
}

export function isValidDate(v: unknown): v is Date {
  return v instanceof Date && !isNaN(v.getTime());
}

/**
 * EXIF DateTimeOriginal carries no timezone — it is the wall-clock time on
 * the camera. exifr materialises it using the *build machine's* timezone,
 * which makes the rendered date depend on where the build ran (a photo shot
 * at 00:30 renders a day earlier when built west of UTC). Re-anchor those
 * wall-clock components to UTC so `npm run build` locally and in CI always
 * print the same day. Dates are rendered with `timeZone: 'UTC'` to match.
 */
export function toWallClockUTC(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds()
    )
  );
}

/** The minimum a photo needs to take part in the automatic ordering chain. */
export interface Orderable {
  fileName: string;
  date?: Date;
}

/**
 * Automatic ordering: numeric filename prefix → date (EXIF, frontmatter, or
 * filename) → filename. Items carrying a signal sort before items without it.
 */
export function autoCompare(a: Orderable, b: Orderable): number {
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

/* ------------------------------------------------- filename references */

/** What a `photos:` / `cover:` reference in an index.md can point at. */
export interface RefTarget {
  /** Path within the album, e.g. 'shot.jpg' or 'rolls/shot.jpg'. */
  albumRel: string;
  /** Basename only — what a flat album's references normally use. */
  fileName: string;
}

/**
 * Resolve `cover:` / `photos:` filename references against an album's real
 * files, and FAIL THE BUILD on anything that does not match.
 *
 * A silently-ignored reference is the most likely way to break an album by
 * hand (a typo, a renamed file, a case mismatch): the build stayed green and
 * the curated order or cover quietly reverted. Every reference is now either
 * resolved or reported with the list of files that were actually found.
 *
 * References may use the basename ('shot.jpg') or, for photos nested in a
 * sub-folder, the album-relative path ('rolls/shot.jpg'). A basename that is
 * not unique within the album must be disambiguated by path.
 */
export function createRefResolver<T extends RefTarget>(photos: T[], albumDir: string) {
  const byPath = new Map<string, T>();
  const byName = new Map<string, T | null>();
  for (const p of photos) {
    byPath.set(p.albumRel, p);
    // A repeated basename (same name in two sub-folders) becomes ambiguous.
    byName.set(p.fileName, byName.has(p.fileName) ? null : p);
  }
  const available = photos.map((p) => p.albumRel).join(', ');

  return function resolve(ref: string, field: string): T {
    const direct = byPath.get(ref);
    if (direct) return direct;
    if (byName.has(ref)) {
      const hit = byName.get(ref);
      if (hit) return hit;
      throw new Error(
        `${albumDir}/index.md: ${field} references "${ref}", but more than one photo in ` +
          `this album has that filename. Use the album-relative path instead ` +
          `(e.g. "sub-folder/${ref}").`
      );
    }
    throw new Error(
      `${albumDir}/index.md: ${field} references "${ref}", which is not a photo in this ` +
        `album (filenames are case-sensitive).\nPhotos found: ${available || '(none)'}`
    );
  };
}

/** Newest first, undated last, ties broken by slug — the gallery index order. */
export function compareNewestFirst(
  a: { slug: string; date?: Date },
  b: { slug: string; date?: Date }
): number {
  const ad = a.date?.getTime();
  const bd = b.date?.getTime();
  if (ad != null && bd != null && ad !== bd) return bd - ad;
  if ((ad != null) !== (bd != null)) return ad != null ? -1 : 1;
  return a.slug.localeCompare(b.slug);
}
