export type ProductDetailTab =
  | "overview"
  | "description"
  | "characteristics"
  | "datasheet"
  | "pricing"
  | "analytics"
  | "analogs"
  | "related";

export function parseProductDetailTab(
  value: string | string[] | null | undefined,
): ProductDetailTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "description" ||
    tab === "characteristics" ||
    tab === "datasheet" ||
    tab === "pricing" ||
    tab === "analytics" ||
    tab === "analogs" ||
    tab === "related"
    ? tab
    : tab === "relations"
      ? "analogs"
      : "overview";
}
