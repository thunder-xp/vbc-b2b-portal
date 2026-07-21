export const CATALOG_VIEW_COOKIE = "novotech-catalog-view-v1";

export type CatalogViewMode = "cards" | "list";

export function parseCatalogViewMode(value: string | null | undefined): CatalogViewMode {
  return value === "list" ? "list" : "cards";
}
