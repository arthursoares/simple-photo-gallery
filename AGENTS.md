# AGENTS.md — guide for coding agents

This file is the map for AI agents (and humans) modifying this repo.
User-facing docs live in README.md; this file covers architecture,
conventions, and extension recipes.

## What this is

A static photo-gallery site builder: Astro 5, no UI framework, vanilla JS
for interactivity, one CSS design system ("Modern TUI"). Photos +
optional markdown go into `src/content/photos/`; the build produces a
fully static `dist/` deployed to GitHub Pages by
`.github/workflows/deploy.yml`.

## Commands

```bash
npm run dev       # dev server on :4321
npm run build     # static build → dist/ (this is also the type gate)
npm run preview   # serve dist/
npm run demo      # generate placeholder photos WITH EXIF (refuses if content exists)
BASE_PATH=/repo/ npm run build   # simulate a GitHub Pages project path
```

There is no test suite; `npm run build` catching schema/type errors plus a
manual look at the pages is the verification loop. To verify visually,
build + preview and check `/`, an album page, Viewer mode (`❑ Viewer`
button), and the lightbox (click a photo on an album page).

## Architecture (data flows top to bottom)

```
src/content/photos/**            photos + optional .md metadata (authoring surface)
src/content.config.ts            zod schema for the markdown ('meta' collection)
gallery.config.ts                ALL site configuration (see below)
src/content/pages/*.md           standalone "entry pages" (about, colophon…) —
                                   published at /<filename>/, auto-linked in the menu
src/lib/photos.ts                ★ data layer: scans images, reads EXIF (exifr),
                                   resolves ordering/naming/caption chains,
                                   builds { mode, albums, singles, items }
src/lib/pages.ts                 entry-pages collection access (getPages/navPages)
src/lib/caption.ts               '{token} · {token}' template renderer
src/lib/images.ts                rendition presets from config.images
src/lib/url.ts                   withBase() — base-path-safe internal URLs
src/pages/index.astro            '/' — dispatches on mode (gallery|single) and
                                   presentation (grid|essay)
src/pages/[slug].astro           album pages (gallery mode) + markdown entry pages
src/pages/docs.astro             hand-written documentation page (.docs-prose styles)
src/layouts/Shell.astro          html shell + chrome variants (header|rail|frame);
                                   menu = entry pages (nav:true) + config.nav links
src/components/KebabNav.astro    mobile ⋮ dropdown (config.mobileNav: 'kebab'|'inline';
                                   gated by [data-mobile-nav] on <body>, ≤767px only)
src/components/
  GalleryIndex.astro             Grid ⇄ Viewer experience + all its JS (masonry,
                                   keyboard nav, IntersectionObserver, #slug deep links)
  Thumb.astro / Entry.astro      one grid thumbnail / one viewer entry
  PhotoEssay.astro               album-page photo feed (lightbox triggers)
  Lightbox.astro                 .gx full-screen overlay + its JS
  ThemeToggle.astro              light/dark, localStorage-persisted
src/styles/
  tokens.css                     design tokens incl. dark mode — change colors HERE
  shell.css                      app frame, chrome variants, page header, filter bar
  gallery.css                    .gv-* (grid/viewer), .pe-* (essay), .gx (lightbox)
  fonts.css                      @font-face (files in src/assets/fonts/)
```

## Content model invariants

- Folder under `src/content/photos/` = album; loose image = single photo.
- `<folder>/index.md` = album metadata + writeup; `<basename>.md` next to an
  image = its sidecar (works for loose photos AND inside album folders).
  Everything optional. `draft: true` on an album's index.md hides the album;
  on a photo sidecar it hides that photo.
- Slugs are ASCII-lowercase (`slugify` in photos.ts); names with no ASCII
  alphanumerics fall back to a stable hash (`p-…`), and there is no
  transliteration — distinct names can collide (e.g. `a b` / `a-b`). Album ↔
  entry-page ↔ built-in route collisions fail the build with a clear error
  ([slug].astro getStaticPaths).
- **Ordering chain** (photos.ts): explicit `photos:` list → numeric filename
  prefix → EXIF DateTimeOriginal → filename date (YYYY-MM-DD-…) → filename.
- **Naming chain**: markdown title → EXIF/XMP/IPTC title → humanized filename.
- **Tags**: frontmatter `tags` ∪ IPTC/XMP keywords.
- A photo's site-wide slug is `album-slug/file-slug` or `file-slug`; the
  gallery index deep-links Viewer position as `/#<slug>`.
- **Entry pages**: `src/content/pages/<name>.md` → `/<name>/`, rendered in
  `.docs-prose` style by [slug].astro. Frontmatter: `title`, `description`,
  `mark`, `nav`/`navLabel`/`order`, `draft`. A page filename that matches an
  album folder collides → duplicate-path build error (intentional).

## Configuration semantics (gallery.config.ts)

| Key | Affects |
| --- | --- |
| `title`, `description`, `author` | `<title>`/meta, chrome title, page header |
| `mode` | routing: `gallery` → index + `/<album>/` pages; `single` → one album at `/`; `auto` decides by content shape |
| `presentation` | single mode only: `grid` (Grid ⇄ Viewer) or `essay` (writeup + photo feed + lightbox) |
| `chrome` | which shell variant Shell.astro renders; styles in shell.css under `[data-chrome=…]` |
| `captionTemplate` / `exifTemplate` | rendered by lib/caption.ts; tokens from `captionContext()` in photos.ts; '·'-separated segments with all-empty tokens are dropped |
| `images.{thumb,viewer,full,quality}` | the renditions sharp generates, via lib/images.ts presets |
| `dateFormat`, `locale` | Intl.DateTimeFormat for the `{date}` token |

## Hard-won gotchas

- **Content-collection IDs are lossy.** The glob loader slugifies ids and
  strips `/index`, so photos.ts keys metadata by `entry.filePath` instead.
  Don't "simplify" it back to `entry.id`.
- **Base path.** GitHub Pages project sites serve from `/<repo>/`. Internal
  hrefs/srcs must go through `withBase()` (lib/url.ts) or Vite-bundled
  imports — never hardcode a root-relative `/path`. Fonts live in
  `src/assets/fonts` (not `public/`) for exactly this reason. Verify with
  `BASE_PATH=/x/ npm run build && grep -r 'href="/' dist/*.html`.
- **photos.ts caches** its result in a module-level promise (`cache`).
  Restart the dev server after adding/removing photos or metadata files.
- **Masonry is JS-measured.** The grid is row-first CSS grid with 1px rows;
  GalleryIndex.astro sets each thumb's `grid-row-end` span after the image
  loads. Hidden grids can't be measured — that's why `setMode('grid')`
  triggers a relayout.
- **Lightbox triggers** are any `img.gx-zoomable` (capture-phase document
  click listener). It prefers `data-gx-full` (2000px rendition) and
  `data-gx-cap` for the caption.
- **EXIF is read from the source file on disk** (`process.cwd()` + glob
  key) at build time; nothing EXIF-related ships to the client.
- The demo generator writes EXIF with sharp's `withExif` — `IFD0` for
  Make/Model/ImageDescription, `IFD2` for DateTimeOriginal/exposure.

## Design-system rules (Modern TUI) — do not violate

1. `border-radius: 0` everywhere.
2. Shadows are hard offsets, 0px blur (`--shadow-sm/md/lg`, `--shadow-pop`).
3. No CSS transitions or animations; state changes are instant.
4. Mono font + uppercase + `--tracking-mono` for meta text (captions,
   chips, pills); body face for prose only.
5. Dark mode is warm near-black (`#1a1918`), never cool gray; toggle via
   `data-theme` on `<html>`.
6. Every page ends with the `░▒▓ EOF ▓▒░` flourish (Shell.astro).

## Extension recipes

- **New chrome variant**: add a branch in Shell.astro's body, style it in
  shell.css under `[data-chrome="yourname"]`, extend the `chrome` union in
  gallery.config.ts. If it adds a left column, set `--content-offset` so
  the Viewer status chip stays centered on the content.
- **New caption token**: add the field to `ExifInfo`/`captionContext()` in
  photos.ts (and read it in `readExif()` if EXIF-sourced). Document it in
  gallery.config.ts's comment and README.
- **New page** (e.g. /about): usually just drop a markdown file in
  `src/content/pages/` — it's published and added to the menu automatically.
  Only write a custom `src/pages/*.astro` (wrap in `<Shell>`, `.w-pgh`
  header, `.docs-prose` body; add to `nav` in gallery.config.ts) when the
  page needs components or markup markdown can't express — see docs.astro.
  In `.astro` prose, never write `{'{…}'}`-style brace expressions — the
  compiler mis-parses them (unclosed-element corruption); use `&#123;`/`&#125;`.
- **Tag filtering UI**: photo tags are already collected (`photo.tags`);
  render filter buttons with the `.blog-navbar-item` style (shell.css) and
  filter client-side by `data-slug`, or generate `/tag/<t>/` pages from
  `getGallery()` in a new dynamic route.
- **Changing colors/typography**: edit tokens.css only; components consume
  tokens exclusively.
