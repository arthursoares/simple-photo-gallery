/**
 * Standalone entry pages (src/content/pages/*.md) — published at
 * /<filename>/ by src/pages/[slug].astro and surfaced in the site chrome
 * by Shell.astro.
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type PageEntry = CollectionEntry<'pages'>;

export async function getPages(): Promise<PageEntry[]> {
  const pages = await getCollection('pages', ({ data }) => !data.draft);
  return pages.sort(
    (a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title)
  );
}

/** Pages that should appear in the chrome menu. */
export async function navPages(): Promise<PageEntry[]> {
  return (await getPages()).filter((p) => p.data.nav);
}
