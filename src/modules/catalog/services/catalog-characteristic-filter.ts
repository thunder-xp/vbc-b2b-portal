import type { CatalogProductCharacteristicDto } from "./catalog.service";

export type CatalogCharacteristicFilterTarget = {
  key: string;
  value: string;
};

export function getCatalogCharacteristicFilterTarget(
  characteristic: CatalogProductCharacteristicDto,
): CatalogCharacteristicFilterTarget | null {
  const value = characteristic.filterValue ?? characteristic.value;
  if (
    !characteristic.isFilterable
    || !characteristic.key
    || !/^property_[0-9a-f-]{36}$/.test(characteristic.key)
    || !value.trim()
    || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)
  ) {
    return null;
  }

  return { key: characteristic.key, value };
}
