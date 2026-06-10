// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Static output — deploy anywhere (GitHub Pages, Netlify, a folder on a VPS).
  output: 'static',
  image: {
    // Photo sites legitimately ship large sources; let sharp downscale from them.
    responsiveStyles: false,
  },
});
