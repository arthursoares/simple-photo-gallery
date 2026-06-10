/**
 * Prefix an internal path with the configured base path. Required for
 * GitHub Pages project sites, which serve from /<repo>/ — never hardcode
 * a root-relative href/src for internal targets.
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  return (base.endsWith('/') ? base : base + '/') + path.replace(/^\//, '');
}
