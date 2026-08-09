import type { ExternalNomenclatureItemType } from "../repositories";

export function externalNomenclatureItemTypeLabel(type: ExternalNomenclatureItemType) {
  return type === "equipment" ? "Оборудование" : type === "material" ? "Материал" : "Работа / услуга";
}
