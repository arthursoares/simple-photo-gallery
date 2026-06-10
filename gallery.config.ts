/**
 * Site-wide gallery configuration.
 *
 * mode
 *   'gallery' — multi-photo/multi-album site: `/` is the gallery index
 *               (Grid ⇄ Viewer), albums get their own pages at `/<slug>/`.
 *   'single'  — the whole site is ONE album: `/` renders that album directly.
 *   'auto'    — 'single' when the content folder holds exactly one album and
 *               no loose photos, otherwise 'gallery'.
 *
 * presentation (single mode only)
 *   'grid'  — the album opens as the Grid ⇄ Viewer experience.
 *   'essay' — the album opens as a scrolling photo essay: writeup prose up
 *             top, then large framed photos (with the lightbox).
 *
 * chrome
 *   'header' — slim top bar: mark · title · counter · theme toggle.
 *   'rail'   — narrow left rail echoing the original sidebar layout.
 *   'frame'  — no bar at all; controls float in the app-frame corners.
 */
export default {
  title: 'Photos',
  description: 'A photo gallery.',
  author: 'Arthur Soares',

  mode: 'auto' as 'gallery' | 'single' | 'auto',
  presentation: 'grid' as 'grid' | 'essay',
  chrome: 'header' as 'header' | 'rail' | 'frame',

  /**
   * Caption templates. Tokens come from sidecar/index.md metadata first,
   * then EXIF: {title} {caption} {date} {camera} {lens} {focal} {aperture}
   * {shutter} {iso} {keywords}. Segments are split on '·' — a segment whose
   * tokens all resolve empty is dropped, so missing EXIF degrades gracefully.
   */
  captionTemplate: '{title} · {date} · {caption}',
  /** Tertiary EXIF line in Viewer captions + lightbox. Set to '' to disable. */
  exifTemplate: '{camera} · {focal} · {aperture} · {shutter} · ISO {iso}',

  /** Date format for the {date} token. */
  dateFormat: { month: 'short', day: '2-digit', year: 'numeric' } as Intl.DateTimeFormatOptions,
  locale: 'en-US',
};
