/**
 * Rendition presets from gallery.config — single source of truth for the
 * sizes the build generates (see config.images). Components spread these
 * into <Image> / pass to getImage().
 */
import type { ImageMetadata } from 'astro';
import config from '../../gallery.config';

/** Never ask sharp to upscale: drop widths beyond the source. */
function clamp(widths: number[], image: ImageMetadata): number[] {
  const fitting = widths.filter((w) => w <= image.width);
  return fitting.length ? fitting : [image.width];
}

export const thumbAttrs = (image: ImageMetadata) => ({
  widths: clamp(config.images.thumb.widths, image),
  sizes: config.images.thumb.sizes,
  quality: config.images.quality,
});

export const viewerAttrs = (image: ImageMetadata) => ({
  widths: clamp(config.images.viewer.widths, image),
  sizes: config.images.viewer.sizes,
  quality: config.images.quality,
});

export const fullRendition = (image: ImageMetadata) => ({
  src: image,
  width: Math.min(config.images.full.width, image.width),
  quality: config.images.quality,
});
