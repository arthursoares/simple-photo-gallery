# Setting up a new gallery site (zero manual steps)

Creates a photo site from nothing and ends with a live URL. Establish first:
site title, repo name, public or private repo, and whether to start with the
user's photos (folder path), generated placeholders, or empty.

```bash
# 1. Scaffold (non-interactive; see --help for all flags)
npm create simple-photo-gallery@latest <dir> -- \
    --title "<Title>" --content empty -y
cd <dir>

# 2. Ingest the user's photos now, if provided (see operations.md)
npm run album -- --title "<Album>" --dir <photos-folder>

# 3. Create the GitHub repository and push
gh repo create <name> --public --source . --push   # --private works too

# 4. Enable GitHub Pages with the Actions build (the one "manual" step, automated)
gh api -X POST "repos/$(gh api user -q .login)/<name>/pages" -f build_type=workflow

# 5. The push in step 3 already triggered the deploy workflow — if it ran
#    before Pages was enabled and failed, re-run it:
gh run list --limit 1 --json conclusion -q '.[0].conclusion' \
  || gh workflow run deploy.yml
gh run watch --exit-status

# 6. Report the live URL
gh api "repos/$(gh api user -q .login)/<name>/pages" -q .html_url
```

Notes:

- The scaffolder strips the template's demo photos (they are not
  MIT-licensed) and writes `gallery.config.ts` from the flags; `--content
  placeholders` generates deletable demo images if the user has no photos yet.
- Pages on **private** repos requires a paid GitHub plan; on free accounts
  use `--public`.
- A custom domain is a Pages setting (`gh api -X PUT …/pages -f cname=…`) +
  user-side DNS; the build auto-adapts via `configure-pages`, no code change.
- After setup, all content work follows [operations.md](operations.md).
