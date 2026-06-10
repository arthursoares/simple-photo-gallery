# Customizing a gallery

Two files cover nearly every request. After edits, run `npm run build`
locally if unsure, then publish with the verify ritual from SKILL.md.
Commit: `chore(config): <what changed>`.

## gallery.config.ts — behavior & text

| Request | Change |
| --- | --- |
| rename the site / change tagline / author | `title`, `description`, `author` |
| "whole site should be just the one album" | `mode: 'single'` (+ `presentation: 'grid'` or `'essay'`) |
| index + album pages (the default shape) | `mode: 'gallery'` (or leave `'auto'`) |
| top bar / vertical rail / floating chips | `chrome: 'header' \| 'rail' \| 'frame'` |
| phone menu as ⋮ dropdown vs inline links | `mobileNav: 'kebab' \| 'inline'` |
| add menu links | `nav: [{ label: 'instagram', href: 'https://…' }]` — markdown pages with `nav: true` are listed automatically before these |
| caption content/format | `captionTemplate` / `exifTemplate` — tokens: `{title} {caption} {date} {camera} {lens} {focal} {aperture} {shutter} {iso} {keywords}`; segments are split on `·` and a segment whose tokens all resolve empty is dropped |
| hide the EXIF line entirely | `exifTemplate: ''` |
| date style / language | `dateFormat` (Intl options), `locale` |
| rendition sizes / quality | `images.{thumb,viewer,full,quality}` |

## src/styles/tokens.css — colors & type

Components consume CSS custom properties only — recoloring the site is
editing tokens, never component CSS. Light mode in `:root`, dark mode in
`:root[data-theme="dark"]` (keep both in sync):

| Request | Tokens |
| --- | --- |
| accent color (links, active buttons) | `--accent`, `--accent-hover`, `--accent-subtle` |
| the amber highlights (stripe, pills, selection) | `--pop`, `--pop-light`, `--pop-subtle` |
| background / paper color | `--canvas`, `--canvas-raised`, `--canvas-inset` |
| text colors | `--text-primary/secondary/tertiary/inverse` |
| border look | `--border`, `--border-subtle`, `--border-width(-heavy)` |
| fonts | `--font-base`, `--font-mono` (self-host files in `src/assets/fonts/` + `@font-face` in `src/styles/fonts.css`) |

Design-system constraints to respect when editing styles: no
`border-radius`, shadows are hard offsets with 0 blur (`--shadow-*`), no CSS
transitions/animations. Dark canvas stays warm near-black, never cool gray.

## Beyond config

Anything structural (new chrome variant, new caption token, tag-filter
pages, code changes) is development, not operation — follow `AGENTS.md` in
the repo, especially its "Extension recipes" and "Hard-won gotchas".
