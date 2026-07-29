import type { CatalogProductCardDto } from "./catalog.service";

export type CatalogComparisonMatrixRow = {
  key: string;
  label: string;
  values: string[];
  differs: boolean;
};

export function buildCatalogComparisonMatrix(
  products: CatalogProductCardDto[],
): CatalogComparisonMatrixRow[] {
  const characteristicsByProduct = products.map((product) => {
    const values = new Map<string, { label: string; value: string }>();

    for (const characteristic of product.keyCharacteristics) {
      const label = characteristic.label.trim();
      const value = characteristic.value.trim();
      if (!label || !value) continue;
      const key = normalizeCharacteristicKey(characteristic.key, label);
      if (!values.has(key)) values.set(key, { label, value });
    }

    return values;
  });

  const labels = new Map<string, string>();
  for (const characteristics of characteristicsByProduct) {
    for (const [key, characteristic] of characteristics) {
      if (!labels.has(key)) labels.set(key, characteristic.label);
    }
  }

  return [...labels]
    .sort((left, right) =>
      left[1].localeCompare(right[1], "ru", { sensitivity: "base" })
      || left[0].localeCompare(right[0]),
    )
    .map(([key, label]) => {
      const values = characteristicsByProduct.map(
        (characteristics) => characteristics.get(key)?.value ?? "—",
      );
      return {
        key,
        label,
        values,
        differs: new Set(values).size > 1,
      };
    });
}

function normalizeCharacteristicKey(key: string | undefined, label: string): string {
  const normalizedKey = key?.trim().toLowerCase();
  return normalizedKey || `label:${label.toLocaleLowerCase("ru")}`;
}
