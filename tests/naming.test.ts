import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertUniqueSlugs,
  autoCompare,
  compareNewestFirst,
  createRefResolver,
  formatShutter,
  humanize,
  parseFileDate,
  parsePrefix,
  reservedRouteNames,
  slugify,
  toWallClockUTC,
} from '../src/lib/naming.ts';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    assert.equal(slugify('Sicily: Terrasini'), 'sicily-terrasini');
    assert.equal(slugify('  spaced  out  '), 'spaced-out');
    assert.equal(slugify('L1001243'), 'l1001243');
  });

  it('falls back to a stable hash when nothing ASCII survives', () => {
    const a = slugify('東京');
    assert.match(a, /^p-[a-z0-9]+$/);
    assert.equal(a, slugify('東京'), 'same input must give the same slug across builds');
    assert.notEqual(a, slugify('京都'));
  });

  it('is documented as lossy — distinct names can still collide', () => {
    assert.equal(slugify('a b'), slugify('a-b'));
  });
});

describe('parsePrefix', () => {
  it('reads a numeric ordering prefix', () => {
    assert.equal(parsePrefix('01-contact-sheet.jpg'), 1);
    assert.equal(parsePrefix('12_roll.jpg'), 12);
  });

  it('does not mistake a leading date for a prefix', () => {
    assert.equal(parsePrefix('2025-03-08-red-bicycle.jpg'), null);
  });

  it('returns null when there is no prefix', () => {
    assert.equal(parsePrefix('alfama-steps.jpg'), null);
  });
});

describe('parseFileDate', () => {
  it('anchors filename dates at UTC noon so the day is timezone-proof', () => {
    const d = parseFileDate('2025-03-08-red-bicycle')!;
    assert.equal(d.toISOString(), '2025-03-08T12:00:00.000Z');
  });

  it('rejects impossible dates', () => {
    assert.equal(parseFileDate('2025-13-45-nope'), undefined);
    assert.equal(parseFileDate('no-date-here'), undefined);
  });

  /* JS rolls '2025-02-31' over to March 3rd instead of failing, so a day that
     does not exist would silently reorder an album under a plausible date. */
  it('rejects a day that does not exist in that month', () => {
    assert.equal(parseFileDate('2025-02-31-bad'), undefined);
    assert.equal(parseFileDate('2025-04-31-bad'), undefined);
    assert.equal(parseFileDate('2023-02-29-bad'), undefined);
  });

  it('accepts a real leap day', () => {
    assert.equal(parseFileDate('2024-02-29-leap')!.toISOString(), '2024-02-29T12:00:00.000Z');
  });
});

describe('humanize', () => {
  it('strips ordering prefixes and dates', () => {
    assert.equal(humanize('01-contact-sheet'), 'Contact sheet');
    assert.equal(humanize('2025-04-13-lisbon'), 'Lisbon');
    assert.equal(humanize('henne-strand'), 'Henne strand');
  });

  it('keeps the original when stripping would empty it', () => {
    assert.equal(humanize('2025-04-13'), '2025 04 13');
  });
});

describe('formatShutter', () => {
  it('formats fractions and whole seconds', () => {
    assert.equal(formatShutter(0.005), '1/200');
    assert.equal(formatShutter(2), '2s');
  });

  it('ignores nonsense', () => {
    assert.equal(formatShutter(0), undefined);
    assert.equal(formatShutter(-1), undefined);
    assert.equal(formatShutter(undefined), undefined);
  });
});

describe('toWallClockUTC', () => {
  it('re-anchors camera wall-clock time to UTC', () => {
    // Built from local components, exactly as exifr materialises EXIF.
    const local = new Date(2025, 3, 13, 0, 30, 15);
    const utc = toWallClockUTC(local);
    assert.equal(utc.getUTCFullYear(), 2025);
    assert.equal(utc.getUTCMonth(), 3);
    assert.equal(utc.getUTCDate(), 13);
    assert.equal(utc.getUTCHours(), 0);
    assert.equal(utc.getUTCMinutes(), 30);
  });

  /* The input is built from LOCAL components, so this assertion only holds if
     the re-anchoring cancels the machine's zone out. CI runs the suite under
     two very different TZs to prove it (see .github/workflows/deploy.yml). */
  it('prints the same day regardless of where the build ran', () => {
    const utc = toWallClockUTC(new Date(2025, 3, 13, 0, 30));
    const printed = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(utc);
    assert.equal(printed, 'Apr 13, 2025');
  });
});

describe('autoCompare', () => {
  const at = (iso: string) => new Date(iso);

  it('puts numeric prefixes first, in numeric order', () => {
    const order = [
      { fileName: '10-j.jpg' },
      { fileName: '2-b.jpg' },
      { fileName: 'zz.jpg' },
    ].sort(autoCompare);
    assert.deepEqual(
      order.map((p) => p.fileName),
      ['2-b.jpg', '10-j.jpg', 'zz.jpg']
    );
  });

  it('falls back to date, oldest first', () => {
    const order = [
      { fileName: 'b.jpg', date: at('2025-04-13T10:00:00Z') },
      { fileName: 'a.jpg', date: at('2025-04-11T10:00:00Z') },
    ].sort(autoCompare);
    assert.deepEqual(
      order.map((p) => p.fileName),
      ['a.jpg', 'b.jpg']
    );
  });

  it('sorts dated photos before undated ones', () => {
    const order = [{ fileName: 'a.jpg' }, { fileName: 'b.jpg', date: at('2025-01-01T00:00:00Z') }].sort(
      autoCompare
    );
    assert.deepEqual(
      order.map((p) => p.fileName),
      ['b.jpg', 'a.jpg']
    );
  });

  it('is deterministic when nothing else separates two files', () => {
    const order = [{ fileName: 'b.jpg' }, { fileName: 'a.jpg' }].sort(autoCompare);
    assert.deepEqual(
      order.map((p) => p.fileName),
      ['a.jpg', 'b.jpg']
    );
  });
});

describe('compareNewestFirst', () => {
  it('sorts newest first and pushes undated entries to the end', () => {
    const order = [
      { slug: 'old', date: new Date('2024-01-01T00:00:00Z') },
      { slug: 'undated' },
      { slug: 'new', date: new Date('2026-01-01T00:00:00Z') },
    ].sort(compareNewestFirst);
    assert.deepEqual(
      order.map((i) => i.slug),
      ['new', 'old', 'undated']
    );
  });
});

describe('createRefResolver', () => {
  const photos = [
    { albumRel: 'shot.jpg', fileName: 'shot.jpg' },
    { albumRel: 'rolls/dupe.jpg', fileName: 'dupe.jpg' },
    { albumRel: 'scans/dupe.jpg', fileName: 'dupe.jpg' },
  ];

  it('resolves by basename and by album-relative path', () => {
    const resolve = createRefResolver(photos, 'lisbon');
    assert.equal(resolve('shot.jpg', 'cover:').albumRel, 'shot.jpg');
    assert.equal(resolve('rolls/dupe.jpg', 'photos:').albumRel, 'rolls/dupe.jpg');
  });

  it('throws on a reference that matches nothing, listing what exists', () => {
    const resolve = createRefResolver(photos, 'lisbon');
    assert.throws(() => resolve('typo.jpg', 'cover:'), /cover: references "typo\.jpg"/);
    assert.throws(() => resolve('typo.jpg', 'cover:'), /Photos found: shot\.jpg/);
  });

  it('treats a case mismatch as a miss rather than silently reordering', () => {
    const resolve = createRefResolver(photos, 'lisbon');
    assert.throws(() => resolve('Shot.JPG', 'photos:'), /case-sensitive/);
  });

  it('refuses an ambiguous basename', () => {
    const resolve = createRefResolver(photos, 'lisbon');
    assert.throws(() => resolve('dupe.jpg', 'photos:'), /more than one photo/);
  });
});

describe('reservedRouteNames', () => {
  it('reserves a top-level page and its directory-index equivalent', () => {
    const names = reservedRouteNames([
      '/src/pages/docs.astro',
      '/src/pages/colophon/index.astro',
    ]);
    assert.deepEqual([...names].sort(), ['colophon', 'docs']);
  });

  it('ignores the index route and dynamic routes', () => {
    const names = reservedRouteNames(['/src/pages/index.astro', '/src/pages/[slug].astro']);
    assert.equal(names.size, 0);
  });

  /* '/legal/privacy/' does not occupy '/legal/', so an album may still be
     called "legal" — reserving the first segment would block valid structure. */
  it('does not reserve the parent of a nested page', () => {
    const names = reservedRouteNames(['/src/pages/legal/privacy.astro']);
    assert.equal(names.has('legal'), false);
  });
});

describe('assertUniqueSlugs', () => {
  it('accepts distinct slugs', () => {
    assert.doesNotThrow(() =>
      assertUniqueSlugs([
        { slug: 'a', albumRel: 'a.jpg' },
        { slug: 'b', albumRel: 'b.jpg' },
      ])
    );
  });

  /* slugify folds '/' and ' ' to '-', so these pairs are indistinguishable in
     a URL fragment and would ship as duplicate DOM ids. */
  it('rejects names that collide through slugification', () => {
    assert.throws(
      () =>
        assertUniqueSlugs([
          { slug: 'trip/a-shot', albumRel: 'a/shot.jpg' },
          { slug: 'trip/a-shot', albumRel: 'a-shot.jpg' },
        ]),
      /"a\/shot\.jpg" and "a-shot\.jpg" both resolve/
    );
    assert.throws(
      () =>
        assertUniqueSlugs([
          { slug: 'a-b', albumRel: 'a b.jpg' },
          { slug: 'a-b', albumRel: 'a-b.jpg' },
        ]),
      /both resolve to the URL fragment "a-b"/
    );
  });
});
