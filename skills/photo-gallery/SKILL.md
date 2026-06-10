---
name: photo-gallery
description: Operate a simple-photo-gallery site (Astro + GitHub Pages). Use when the user asks to create a photo site/gallery, publish or add photos or albums, edit captions/covers/order, add an about page, unpublish photos, or change how their gallery looks (title, colors, menu, layout) — e.g. "publish these 10 photos to my gallery", "add them to the Sicily album", "set up a photo site for me".
---

# photo-gallery

Operate a gallery built with
[simple-photo-gallery](https://github.com/arthursoares/simple-photo-gallery).
Everything is plain files + git: photos live in `src/content/photos/`
(a folder = an album, a loose file = a single photo), optional markdown adds
metadata, and every push to `main` deploys via GitHub Actions. The CI build
is the validator — bad frontmatter, slug collisions, and broken references
fail it loudly — and every publish is a revertable commit.

## Route by task

| User asks to… | Do |
| --- | --- |
| create a brand-new photo site | [setup.md](setup.md) — scaffold, repo, Pages, first deploy; zero manual steps |
| add an album / add photos to an album / add single photos | [operations.md](operations.md) § Adding photos |
| edit captions, cover, order, writeup; add a page | [operations.md](operations.md) § Curating |
| hide/remove photos, albums, pages | [operations.md](operations.md) § Unpublishing |
| change title, menu, layout, colors, caption format | [customize.md](customize.md) |
| modify the code/templates themselves | read `AGENTS.md` in the target repo |

## Prerequisites

- `gh` authenticated with push access to the target repo (`gh auth status`);
  node ≥ 18. If auth fails, stop and ask the user.
- Get the repo locally: `gh repo clone <user>/<repo> <dir>` (or `git pull` an
  existing clone), then `npm install` once.

## Iron rules

1. **Never commit camera originals.** Always ingest through
   `npm run album -- …` (resizes to ≤2400px long edge). Repos bloat fast and
   GitHub Pages caps sites at ~1 GB.
2. **Never strip EXIF.** The build uses it for ordering, dates, and captions.
   The ingest script preserves it; any other image processing must too.
3. **Finish with the verify ritual** — a task is not done at `git push`:

   ```bash
   git add -A && git commit -m "<conventional message>" && git push
   gh run watch --exit-status     # non-zero = build/deploy failed → read the log, fix, re-push
   # site base URL: gh api repos/<user>/<repo>/pages -q .html_url
   curl -sf -o /dev/null <url> && echo live
   ```

   Then report the live URL to the user.
4. **Ask before destructive or irreversible actions** (deleting albums,
   force-pushes). Prefer `draft: true` over deletion — it unpublishes
   reversibly.
