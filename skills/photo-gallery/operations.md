# Content operations

All paths are relative to the gallery repo root. After any operation, finish
with the verify ritual from SKILL.md.

## Adding photos

**New album** from a folder of images:

```bash
npm run album -- --title "Sicily: Palermo" --dir <photos-folder> \
    [--caption "excerpt shown in the header"] [--date 2026-05-01] [--slug palermo]
```

Resizes (≤2400px long edge, EXIF preserved, orientation baked), sanitizes
filenames, writes `src/content/photos/<slug>/` and stubs its `index.md`.
Commit message: `feat(album): <slug>`.

**Add photos to an EXISTING album** — same command with the album's existing
slug and `--force`:

```bash
npm run album -- --title "ignored" --slug palermo --force --dir <more-photos>
```

Files already in the album are skipped, the existing `index.md` is left
untouched. New photos slot into the order by EXIF date (or stay last if the
album uses an explicit `photos:` list — append them there if the user wants
them ordered). Commit: `feat(album): more photos for <slug>`.

**Single (loose) photos** — appear directly on the gallery index:

```bash
npm run album -- --single --dir <photos-folder>
```

Optionally give each a sidecar `src/content/photos/<basename>.md` with
`title`, `caption`, `alt`, `date`, `tags`. Commit: `feat(photos): <what>`.

## Curating

**Album metadata** lives in `src/content/photos/<slug>/index.md`:

```yaml
---
title: "Sicily: Palermo"
date: 2026-05-01            # album date (else: newest photo EXIF)
caption: One day in the capital.   # header excerpt
cover: L1001243.jpg         # index thumbnail (default: first photo)
tags: [travel]
photos:                     # explicit order — wins over everything;
  - file: L1001243.jpg      # unlisted files are appended in automatic order
    caption: Quattro Canti at noon
  - file: L1001250.jpg
---
The markdown body is the album writeup, shown above the photos.
```

- **Set a cover**: `cover: <exact filename>`.
- **Reorder / per-photo captions**: use the `photos:` list. Without it, order
  is: numeric filename prefix → EXIF date → filename-date → alphabetical.
- **Per-photo metadata inside an album** can also live in a sidecar:
  `src/content/photos/<slug>/<basename>.md`.

Commit: `chore(album): captions/cover for <slug>`.

**Standalone pages** (about, colophon…): write
`src/content/pages/<name>.md` → published at `/<name>/`, auto-linked in the
menu. Frontmatter: `title` (required), `description`, `mark` (kick-line
glyph), `nav`/`navLabel`/`order` (menu), `draft`. Body is normal markdown
(GFM tables, inline HTML fine). A page filename matching an album folder
fails the build on purpose — pick another name.

## Unpublishing

Reversible (preferred): set `draft: true` —
- in an album's `index.md` → hides the whole album;
- in a photo's sidecar (create one if needed) → hides that photo;
- in a page's frontmatter → hides the page.

Permanent: delete the files, or `git revert <commit>` to undo a whole
publish. Confirm with the user before deleting anything.

## Validating before push (optional, fast feedback)

`npm run build` locally surfaces the same errors CI would: slug collisions,
schema violations, `photos:`/`cover` entries referencing missing files.

## Troubleshooting

- `npm run album` refuses: album exists → add `--force`; no images found →
  check extensions (`.jpg/.jpeg/.png/.webp/.avif`; HEIC is not supported —
  convert first, preserving EXIF).
- CI fails on `Slug collision` → rename the folder/page in conflict.
- Photo order looks wrong → the photos likely lack EXIF dates; add a
  `photos:` list or numeric filename prefixes.
- New content not on the site → check `gh run list` (deploy may have failed
  or still be running); hard-refresh (Pages caches).
