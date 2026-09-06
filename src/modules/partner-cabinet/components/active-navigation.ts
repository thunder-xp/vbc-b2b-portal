type NavigationRoute = { key: string; href: string | null };

/** Select one most-specific route, including query-defined views of a shared path. */
export function activeNavigationKey(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  items: readonly NavigationRoute[],
): string | undefined {
  let selected: string | undefined;
  let bestDepth = -1;
  let bestQueryCount = -1;
  const currentSegments = pathname.split("/").filter(Boolean);

  for (const item of items) {
    if (!item.href) continue;
    const [path, query] = item.href.split("?");
    const segments = path.split("/").filter(Boolean);
    const requiredQuery = new URLSearchParams(query);
    const exactPath = pathname === path;
    // Query-defined views are exact. Other entries retain their existing child routes,
    // but only whole path segments match and the most-specific sibling wins.
    const childPath = path !== "/cabinet" && !query && segments.length < currentSegments.length
      && segments.every((segment, index) => segment === currentSegments[index]);
    if (!exactPath && !childPath) continue;
    if ([...requiredQuery].some(([key, value]) => searchParams.get(key) !== value)) continue;
    if (segments.length > bestDepth || (segments.length === bestDepth && requiredQuery.size > bestQueryCount)) {
      selected = item.key;
      bestDepth = segments.length;
      bestQueryCount = requiredQuery.size;
    }
  }
  return selected;
}
