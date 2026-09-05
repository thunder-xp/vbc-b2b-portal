const CATALOG_PATH = "/cabinet/catalog";
const QUICK_ORDER_PATH = "/cabinet/quick-order";
const INTERNAL_ORIGIN = "https://portal.novotech.invalid";
const MAX_RETURN_TARGET_LENGTH = 4096;

export function parseCatalogReturnTarget(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    !candidate
    || candidate.length > MAX_RETURN_TARGET_LENGTH
    || !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return CATALOG_PATH;
  }

  try {
    const target = new URL(candidate, INTERNAL_ORIGIN);
    if (
      target.origin !== INTERNAL_ORIGIN
      || (target.pathname !== CATALOG_PATH && target.pathname !== QUICK_ORDER_PATH)
      || (target.pathname === QUICK_ORDER_PATH && target.search)
      || target.hash
      || target.username
      || target.password
    ) {
      return CATALOG_PATH;
    }
    return `${target.pathname}${target.search}`;
  } catch {
    return CATALOG_PATH;
  }
}

export function buildCatalogProductHref(slug: string, returnTarget: string): string {
  const params = new URLSearchParams({ returnTo: parseCatalogReturnTarget(returnTarget) });
  return `${CATALOG_PATH}/${encodeURIComponent(slug)}?${params.toString()}`;
}

export function buildProductDetailTabHref(tab: string, returnTarget: string): string {
  const params = new URLSearchParams({
    tab,
    returnTo: parseCatalogReturnTarget(returnTarget),
  });
  return `?${params.toString()}`;
}
