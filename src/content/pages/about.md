---
title: About
description: What this site is, and how this very page was made.
mark: '✶'
order: 1
---

This site is the demo deployment of
[simple-photo-gallery](https://github.com/arthursoares/simple-photo-gallery),
a fork-and-deploy photo gallery for Astro + GitHub Pages. The photographs are
by [Arthur Soares](https://arthur.earth).

## This page is a markdown file

Everything you are reading lives in `src/content/pages/about.md` — no
template code involved. Any markdown file dropped into `src/content/pages/`
becomes a standalone page at `/<filename>/`, rendered in the documentation
style, and (by default) linked from the site menu. The frontmatter controls
how:

| Field | Effect |
| --- | --- |
| `title` | Page heading + menu label |
| `description` | Header excerpt + meta description |
| `mark` | The glyph in the kick line (this page uses `✶`) |
| `nav` / `navLabel` / `order` | Menu visibility, label, position |
| `draft` | Hide the page entirely |

Standard markdown works throughout — GFM tables (like the one above), code
blocks, blockquotes, images, inline HTML.

## Why this exists

A photo site usually needs one or two pages that aren't photos: an about
page, a colophon, a print-purchasing note, an imprint. This mechanism keeps
those in the same place as the rest of the content — plain files in the
repo — instead of forcing template work for a paragraph of text.

See the [documentation](../docs/) for the full picture, or fork the
[repository](https://github.com/arthursoares/simple-photo-gallery) to start
your own gallery.
