/**
 * Render a caption template like '{title} · {date} · ISO {iso}'.
 *
 * The template is split on '·'. Within each segment, {tokens} are replaced
 * from ctx; a segment that contained tokens but resolved entirely empty is
 * dropped (so 'ISO {iso}' disappears when there is no EXIF, separator and
 * all). Literal-only segments always survive.
 */
export function renderTemplate(
  template: string,
  ctx: Record<string, string | undefined>
): string {
  if (!template) return '';
  return template
    .split('·')
    .map((segment) => {
      let tokens = 0;
      let filled = 0;
      const text = segment.replace(/\{(\w+)\}/g, (_, key: string) => {
        tokens++;
        const value = ctx[key];
        if (value) filled++;
        return value ?? '';
      });
      return { text: text.trim(), drop: tokens > 0 && filled === 0 };
    })
    .filter((s) => !s.drop && s.text !== '')
    .map((s) => s.text)
    .join(' · ');
}
