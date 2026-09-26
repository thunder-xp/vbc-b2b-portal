const EQUIPMENT_INSTALLATION_NAMES = new Set([
  "Монтаж видеокамеры",
  "Монтаж оборудования",
  "Montarea camerei video",
  "Montajul camerei video",
  "Montajul echipamentului",
]);

const CABLE_ROUTING_NAMES = new Set([
  "Прокладка кабеля",
  "Трассировка кабеля",
  "Pozarea cablului",
  "Trasarea cablului",
]);

export type EstimateWorkLabelKey = "equipment_installation" | "cable_routing";

export function estimateWorkLabelKey(name: string): EstimateWorkLabelKey | null {
  const normalized = name.trim();
  if (EQUIPMENT_INSTALLATION_NAMES.has(normalized)) return "equipment_installation";
  if (CABLE_ROUTING_NAMES.has(normalized)) return "cable_routing";
  return null;
}

/** Canonical persisted wording for governed reusable work services. */
export function canonicalEstimateWorkName(name: string): string {
  const key = estimateWorkLabelKey(name);
  if (key === "equipment_installation") return "Монтаж оборудования";
  if (key === "cable_routing") return "Трассировка кабеля";
  return name;
}
