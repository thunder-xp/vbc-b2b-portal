import type { CctvObjectType } from "./cctv-engine";

export const CCTV_SERVICE_REQUEST_TYPES = [
  "camera_installation", "cable_laying", "commissioning", "remote_configuration",
] as const;
export type CctvServiceRequestType = (typeof CCTV_SERVICE_REQUEST_TYPES)[number];
export type CctvServiceFamily = "cable_routing" | "equipment_installation" | "commissioning"
  | "remote_viewing_configuration" | "ai_scenario_programming";
export type CctvServiceCode = "cable_routing_class_1" | "cable_routing_class_2" | "cable_routing_class_3"
  | "equipment_installation_class_1" | "equipment_installation_class_2" | "equipment_installation_class_3"
  | "commissioning" | "remote_viewing_configuration" | "ai_scenario_programming";

export type CctvObjectServiceBinding = {
  bindingId: string;
  serviceCode: CctvServiceCode;
  family: CctvServiceFamily;
  complexityClass: number | null;
  label: string;
  unitCode: "piece" | "meter" | "service";
  enabled: boolean;
  calculatorDefault: boolean;
  displayOrder: number;
  notes: string | null;
  version: number;
  partnerServiceId: string | null;
  tariffServiceType: string;
  tariffActive: boolean;
  unitPrice: number | null;
  currency: string | null;
  vatTreatment: "included" | "excluded" | "not_specified" | null;
};

export type CctvObjectConfiguration = {
  objectType: CctvObjectType;
  tariffSet: { id: string; version: number; currency: string; vatTreatment: "included" | "excluded" | "not_specified" } | null;
  services: CctvObjectServiceBinding[];
};

export type CctvResolvedObjectService = {
  requestServiceType: CctvServiceRequestType;
  profileKey?: string;
  serviceCode: CctvServiceCode | null;
  partnerServiceId: string | null;
  unitCode: "piece" | "meter" | "service" | null;
  unitPrice: number | null;
  currency: string | null;
  vatTreatment: "included" | "excluded" | "not_specified" | null;
  tariffSetId: string | null;
  tariffVersion: number | null;
};

export function getCctvConfigurationDiagnostics(input: {
  indoorCandidates: number;
  outdoorCandidates: number;
  indoorEligible: number;
  outdoorEligible: number;
  services: readonly CctvObjectServiceBinding[];
}) {
  const enabled = input.services.filter((service) => service.enabled);
  const defaults = enabled.filter((service) => service.calculatorDefault);
  return [
    input.indoorCandidates === 0 && "Нет кандидатов для камер внутри помещения.",
    input.outdoorCandidates === 0 && "Нет кандидатов для уличных камер.",
    input.indoorCandidates > 0 && input.indoorEligible === 0 && "Кандидаты для помещения не проходят техническую проверку.",
    input.outdoorCandidates > 0 && input.outdoorEligible === 0 && "Уличные кандидаты не проходят техническую проверку.",
    input.indoorEligible === 1 && "Для помещения доступна одна камера — эконом-вариант отсутствует.",
    input.outdoorEligible === 1 && "Для улицы доступна одна камера — эконом-вариант отсутствует.",
    enabled.length === 0 && "Для объекта не включены услуги.",
    enabled.length > 0 && defaults.length === 0 && "Не выбраны услуги по умолчанию.",
    ...enabled.filter((service) => !service.tariffActive).map((service) => `${service.label}: нет активного тарифа.`),
    ...defaults.filter((service) => !service.partnerServiceId).map((service) => `${service.label}: нет связанной позиции услуги для B2B.`),
  ].filter((message): message is string => Boolean(message));
}
