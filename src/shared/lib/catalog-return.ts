export function getCatalogReturnHref(value?: string | string[]) {
  const href = Array.isArray(value) ? value[0] : value;
  if (!href || href.length > 3000 || /[\\\u0000-\u001f]/.test(href)) return null;
  return /^\/catalog(?:\/[a-z0-9-]+)?(?:\?|$)/i.test(href) ? href : null;
}
