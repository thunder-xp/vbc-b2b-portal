import {
  CCTV_CAMERA_RESOLUTIONS,
  CCTV_OBJECT_TYPES,
  CCTV_POE_CAPACITIES,
  CCTV_RECORDER_CHANNELS,
  CCTV_STORAGE_CAPACITIES_TB,
  automaticRecorderChannels,
  calculateCctvTechnicalPlan,
  normalizeCctvInput,
  type CctvProfileKey,
  type CctvTechnicalConfiguration,
  type CctvTechnicalInput,
  type CctvTechnicalIssue,
  type CctvTechnicalProfile,
  type CctvTechnicalRequirement,
} from "../../cctv-calculation";
import type { EstimateSectionSystemKey, EstimateUnit } from "../types";
import type { GeneratorRequirement } from "./proposal-generator";

export {
  CCTV_CAMERA_RESOLUTIONS,
  CCTV_OBJECT_TYPES,
  CCTV_POE_CAPACITIES,
  CCTV_RECORDER_CHANNELS,
  CCTV_STORAGE_CAPACITIES_TB,
  automaticRecorderChannels,
};
export type {
  CctvCameraResolution,
  CctvObjectType,
  CctvRecorderSelection,
  CctvTechnicalInput as CctvCalculatorInput,
} from "../../cctv-calculation";

export type CalculatorProfileKey = CctvProfileKey;
export type CctvProfileCapability = {
  profileKey: string;
  version?: number | null;
  recorderChannels?: number | null;
  integratedPoePorts?: number | null;
  driveBayCount?: number | null;
  poePortCount?: number | null;
  storageCapacityTb?: number | null;
  maxDriveCapacityTb?: number | null;
  compatibilityVerified?: boolean;
  resolution?: "unresolved" | "catalog" | "service" | "own_nomenclature" | "shared_nomenclature";
};

export type CctvCompatibilityIssue = { severity: "blocking" | "warning"; code: string; message: string };
export type CctvConfigurationSummary = {
  compatibleConfigurationFound: boolean;
  automaticRecorderProfile: string | null;
  recorder: { profileKey: string | null; channels: number | null; driveBayCount: number | null; maxDriveCapacityTb: number | null; integratedPoePorts: number | null };
  archive: { requiredCapacityTb: number; selectedDrives: Array<{ profileKey: string; capacityTb: number; quantity: number }>; physicalCapacityTb: number | null };
  externalPoePortsRequired: number;
  issues: CctvCompatibilityIssue[];
};

type CalculatedRequirement = GeneratorRequirement & { profileKey: CalculatorProfileKey | null; assumption?: string | null };

export const CCTV_CALCULATOR_PROFILE_KEYS: readonly CalculatorProfileKey[] = [
  ...CCTV_CAMERA_RESOLUTIONS.flatMap((mp) => [`cctv.indoor.${mp}mp`, `cctv.outdoor.${mp}mp`] as CalculatorProfileKey[]),
  ...CCTV_RECORDER_CHANNELS.map((channels) => `cctv.nvr.${channels}` as CalculatorProfileKey),
  ...CCTV_STORAGE_CAPACITIES_TB.map((capacity) => `cctv.storage.${capacity}tb` as CalculatorProfileKey),
  ...CCTV_POE_CAPACITIES.map((ports) => `cctv.poe.${ports}` as CalculatorProfileKey),
  "cctv.cable.cat5e", "cctv.mounting", "cctv.ups", "cctv.install.camera", "cctv.install.cable",
  "cctv.commissioning.system", "cctv.commissioning.remote",
];

export function calculateCctvRequirements(
  input: CctvTechnicalInput,
  capabilities?: readonly CctvProfileCapability[],
): CalculatedRequirement[] {
  return calculateCctvConfiguration(input, capabilities).requirements;
}

export function calculateCctvConfiguration(
  input: CctvTechnicalInput,
  capabilities?: readonly CctvProfileCapability[],
): { requirements: CalculatedRequirement[]; compatibility: CctvConfigurationSummary } {
  try {
    const technical = calculateCctvTechnicalPlan(input, capabilities ? toTechnicalConfiguration(capabilities) : undefined);
    return {
      requirements: technical.requirements.map(toB2bRequirement),
      compatibility: {
        compatibleConfigurationFound: technical.compatibility.ready,
        automaticRecorderProfile: technical.compatibility.automaticRecorderProfile,
        recorder: technical.compatibility.recorder,
        archive: technical.compatibility.archive,
        externalPoePortsRequired: technical.compatibility.poe.externalPortsRequired,
        issues: technical.compatibility.issues.map(toB2bIssue),
      },
    };
  } catch (error) {
    throw localizeValidationError(error);
  }
}

export function validateCctvInput(input: CctvTechnicalInput): void {
  try {
    normalizeCctvInput(input);
  } catch (error) {
    throw localizeValidationError(error);
  }
}

export function cctvInputFingerprintPayload(input: CctvTechnicalInput) {
  return {
    systemType: "cctv" as const,
    objectType: input.objectType,
    indoorCameraCount: input.indoorCameraCount,
    indoorResolutionMp: input.indoorResolutionMp,
    outdoorCameraCount: input.outdoorCameraCount,
    outdoorResolutionMp: input.outdoorResolutionMp,
    recorderSelection: input.recorderSelection,
    archiveDays: input.archiveDays,
    cableLength: input.cableLength,
    installationRequested: input.installationRequested,
    commissioningRequested: input.commissioningRequested,
    remoteViewingRequested: input.remoteViewingRequested,
    advancedFlags: [input.colorNight && "color_night", input.licensePlateRecognition && "license_plate_recognition",
      input.videoAnalytics && "video_analytics", input.backupPower && "backup_power"].filter((value): value is string => Boolean(value)),
  };
}

function toTechnicalConfiguration(capabilities: readonly CctvProfileCapability[]): CctvTechnicalConfiguration {
  const profiles: CctvTechnicalProfile[] = [];
  for (const capability of capabilities) {
    const approvedCatalogMapping = capability.resolution === undefined || capability.resolution === "catalog";
    if (capability.recorderChannels != null) profiles.push({
      kind: "recorder",
      profileKey: capability.profileKey,
      approvedForAutomaticSelection: approvedCatalogMapping,
      compatibilityVerified: capability.compatibilityVerified === true,
      channels: capability.recorderChannels,
      integratedPoePorts: capability.integratedPoePorts ?? null,
      driveBayCount: capability.driveBayCount ?? null,
      maxDriveCapacityTb: capability.maxDriveCapacityTb ?? null,
    });
    if (capability.storageCapacityTb != null) profiles.push({
      kind: "storage",
      profileKey: capability.profileKey,
      approvedForAutomaticSelection: approvedCatalogMapping && capability.storageCapacityTb !== 12,
      capacityTb: capability.storageCapacityTb,
      priority: 0,
    });
    if (capability.poePortCount != null) profiles.push({
      kind: "poe",
      profileKey: capability.profileKey,
      approvedForAutomaticSelection: approvedCatalogMapping && capability.poePortCount !== 32,
      portCapacity: capability.poePortCount,
      priority: 0,
    });
  }
  const versions = capabilities.filter((capability) => capability.version != null)
    .map((capability) => `${capability.profileKey}:${capability.version}`).sort();
  return { version: versions.length ? versions.join("|") : null, profiles };
}

function toB2bRequirement(requirement: CctvTechnicalRequirement): CalculatedRequirement {
  const sectionKey = section(requirement.section);
  const unit = b2bUnit(requirement.unit);
  const description = requirementDescription(requirement);
  const assumption = requirement.kind === "storage"
    ? `Ориентир: около ${requirement.requiredStorageTb} ТБ при усреднённом профиле записи; точный объём зависит от сцены и настроек.`
    : requirement.kind === "external_poe" && requirement.integratedPoePorts
      ? `Учтено ${requirement.integratedPoePorts} встроенных PoE-портов регистратора.`
      : null;
  return {
    id: requirement.id,
    profileKey: requirement.profileKey,
    sectionKey,
    description,
    requirementDescription: description,
    quantity: requirement.quantity,
    unit,
    assumption: requirement.id === "cctv-storage" ? assumption : requirement.kind === "external_poe" ? assumption : null,
    resolution: "unresolved",
    resolvedId: null,
    resolvedLabel: null,
  };
}

function requirementDescription(requirement: CctvTechnicalRequirement): string {
  switch (requirement.kind) {
    case "indoor_camera": return `Камера видеонаблюдения для помещений, ${requirement.cameraResolutionMp} Мп`;
    case "outdoor_camera": return `Уличная камера видеонаблюдения, ${requirement.cameraResolutionMp} Мп`;
    case "recorder": return requirement.recorderChannels ? `Сетевой видеорегистратор на ${requirement.recorderChannels} каналов` : "Видеорегистратор подходящей ёмкости";
    case "storage": return requirement.storageCapacityTb
      ? `Накопитель ${requirement.storageCapacityTb} ТБ для видеоархива (расчётная потребность около ${requirement.requiredStorageTb} ТБ)`
      : "Требуется выбор накопителя";
    case "external_poe": return requirement.profileKey ? `PoE-коммутатор на ${requirement.poePortCapacity} портов` : `PoE-коммутация минимум на ${requirement.poePortCapacity} внешних портов`;
    case "backup_power": return "Резервное питание системы видеонаблюдения";
    case "cable": return "Кабель Cat.5e для системы видеонаблюдения";
    case "mounting_material": return "Монтажные коробки и комплектующие";
    case "camera_installation": return "Монтаж камеры видеонаблюдения";
    case "cable_laying": return "Прокладка кабеля";
    case "commissioning": return "Пусконаладочные работы CCTV";
    case "remote_configuration": return "Настройка удалённого просмотра";
  }
}

function toB2bIssue(issue: CctvTechnicalIssue): CctvCompatibilityIssue {
  switch (issue.code) {
    case "recorder_not_selected": return { severity: issue.severity, code: issue.code, message: "Регистратор не выбран. Проверьте комплектность системы." };
    case "recorder_above_recommended_tier": return { severity: issue.severity, code: issue.code, message: "Выбран регистратор больше рекомендуемого класса." };
    case "insufficient_poe": return { severity: issue.severity, code: issue.code, message: `Не хватает ${issue.requiredPorts} PoE-портов. Требуется выбор коммутатора.` };
    case "recorder_channels_insufficient": return { severity: issue.severity, code: issue.code, message: `Для ${issue.cameraCount} камер выбран регистратор на ${issue.selectedChannels} каналов.` };
    case "recorder_metadata_unverified": return { severity: issue.severity, code: issue.code, message: "Требуется выбор регистратора: сведения о совместимости не подтверждены." };
    case "storage_incompatible": return { severity: issue.severity, code: issue.code, message: `Расчётный архив ${issue.requiredCapacityTb} TB не помещается в доступную конфигурацию накопителей.` };
  }
}

function section(value: CctvTechnicalRequirement["section"]): EstimateSectionSystemKey {
  if (value === "materials") return "installation_materials";
  if (value === "installation") return "installation_works";
  if (value === "commissioning") return "commissioning_works";
  return "equipment";
}

function b2bUnit(value: CctvTechnicalRequirement["unit"]): EstimateUnit {
  if (value === "meters") return "meter";
  if (value === "service") return "service";
  return "pcs";
}

function localizeValidationError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error("Параметры расчёта некорректны.");
  if (error.message === "Invalid CCTV object type.") return new Error("Некорректный тип объекта.");
  if (error.message === "Invalid CCTV camera or recorder parameters.") return new Error("Параметры камер или регистратора некорректны.");
  if (error.message === "CCTV calculation parameters are outside allowed bounds.") return new Error("Параметры расчёта выходят за допустимые пределы.");
  return error;
}
