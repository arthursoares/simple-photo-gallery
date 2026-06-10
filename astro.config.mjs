// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL and BASE_PATH are injected by the GitHub Pages workflow
// (.github/workflows/deploy.yml) via actions/configure-pages, so the same
// code deploys to user pages, project pages (/<repo>/), or a custom domain
// without edits. Locally both are unset: site is optional and base is '/'.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  // Static output — deploy anywhere (GitHub Pages, Netlify, a folder on a VPS).
  output: 'static',
});
