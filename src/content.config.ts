import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Metadata sidecars living inside src/content/photos/:
 *   <album>/index.md  — album metadata + writeup body
 *   <photo>.md        — sidecar for a loose photo with the same basename
 * Everything is optional; photos work with no markdown at all.
 */
const meta = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/photos' }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
    caption: z.string().optional(),
    alt: z.string().optional(),
    /** Album cover image filename (defaults to the first photo in order). */
    cover: z.string().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    /**
     * Explicit photo order for an album. Array order wins over every other
     * ordering source; entries may carry per-photo captions/titles.
     * Unlisted files are appended after, in automatic order.
     */
    photos: z
      .array(
        z.union([
          z.string(),
          z.object({
            file: z.string(),
            title: z.string().optional(),
            caption: z.string().optional(),
            alt: z.string().optional(),
          }),
        ])
      )
      .optional(),
  }),
});

export const collections = { meta };
