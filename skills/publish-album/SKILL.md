---
name: publish-album
description: Publish photos to a simple-photo-gallery site (GitHub Pages). Use when the user asks to create/publish a photo album, add photos, or update a gallery built with simple-photo-gallery — e.g. "create an album of these 10 photos and publish it to <repo>".
---

# publish-album

Publish photos to a gallery built with
[simple-photo-gallery](https://github.com/arthursoares/simple-photo-gallery).
Content is plain files + git; the repo's CI build validates everything and
deploys to GitHub Pages on push.

## Inputs to establish

- **Photos**: a local folder (or list of files — copy them into a temp folder).
- **Target repo**: e.g. `user/my-photos`. Must be a simple-photo-gallery
  site (has `gallery.config.ts` + `src/content/photos/`).
- **Album title** (ask if not given) and optionally: captions, an album
  caption/excerpt, a date, which photo is the cover.

## Prerequisites

`gh` authenticated with push access to the target repo; node ≥ 18.
If `gh auth status` fails, stop and ask the user to authenticate.

## Procedure

1. **Get the repo** (fresh or update):

   ```bash
   gh repo clone <user>/<repo> /tmp/<repo> 2>/dev/null || git -C /tmp/<repo> pull
   cd /tmp/<repo> && npm install
   ```

2. **Ingest** — never copy camera originals in by hand; the script resizes
   (≤2400px long edge) while preserving EXIF, which drives ordering and
   captions:

   ```bash
   npm run album -- --title "<Title>" --dir <photos-folder> [--caption "…"] [--date YYYY-MM-DD]
   ```

   For loose single photos instead of an album: `npm run album -- --single --dir <folder>`.

3. **Curate** (only as asked): edit `src/content/photos/<slug>/index.md` —
   per-photo captions and explicit order go in the `photos:` list,
   `cover:` picks the index thumbnail, the markdown body is the writeup.

4. **Validate locally** (fast feedback): `npm run build` — slug collisions,
   bad frontmatter, and broken file references fail here with clear errors.

5. **Publish**:

   ```bash
   git add -A && git commit -m "feat(album): <slug>" && git push
   gh run watch --exit-status        # the Pages deploy; non-zero = failed
   ```

6. **Verify and report**: the album URL is
   `https://<user>.github.io/<repo>/<slug>/` (or the custom domain;
   `gh api repos/<user>/<repo>/pages -q .html_url` gives the base). Confirm
   it returns 200, then report the live URL to the user.

## Failure handling

- Build fails on a slug collision → rename the album folder (`--slug`).
- `npm run album` refuses (folder exists) → `--force` adds into it.
- To unpublish: set `draft: true` in the album's `index.md` and push, or
  `git revert` the publish commit.

Deeper reference: `AGENTS.md` in the target repo ("Operating a gallery").
