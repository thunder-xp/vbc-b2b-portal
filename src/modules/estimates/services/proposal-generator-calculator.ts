import type { EstimateSectionSystemKey, EstimateUnit } from "../types";
import type { GeneratorRequirement } from "./proposal-generator";

export const CCTV_OBJECT_TYPES = [
  "apartment", "house", "office", "retail", "warehouse", "industrial", "horeca", "other",
] as const;
export const CCTV_CAMERA_RESOLUTIONS = [2, 4, 6, 8] as const;
export const CCTV_RECORDER_CHANNELS = [4, 8, 16, 32] as const;
export const CCTV_POE_CAPACITIES = [4, 8, 16, 24, 32] as const;
export const CCTV_STORAGE_CAPACITIES_TB = [1, 2, 4, 6, 8] as const;

export type CctvObjectType = (typeof CCTV_OBJECT_TYPES)[number];
export type CctvCameraResolution = (typeof CCTV_CAMERA_RESOLUTIONS)[number];
export type CctvRecorderSelection = "auto" | "none" | (typeof CCTV_RECORDER_CHANNELS)[number];

export type CctvCalculatorInput = {
  objectType: CctvObjectType;
  indoorCameraCount: number;
  indoorResolutionMp: CctvCameraResolution;
  outdoorCameraCount: number;
  outdoorResolutionMp: CctvCameraResolution;
  recorderSelection: CctvRecorderSelection;
  archiveDays: number;
  cableLength: number;
  installationRequested: boolean;
  commissioningRequested: boolean;
  remoteViewingRequested: boolean;
  colorNight: boolean;
  licensePlateRecognition: boolean;
  videoAnalytics: boolean;
  backupPower: boolean;
};

export type CalculatorProfileKey =
  | `cctv.indoor.${CctvCameraResolution}mp` | `cctv.outdoor.${CctvCameraResolution}mp`
  | `cctv.nvr.${(typeof CCTV_RECORDER_CHANNELS)[number]}`
  | `cctv.storage.${(typeof CCTV_STORAGE_CAPACITIES_TB)[number]}tb`
  | `cctv.poe.${(typeof CCTV_POE_CAPACITIES)[number]}`
  | "cctv.cable.cat5e" | "cctv.mounting" | "cctv.ups" | "cctv.install.camera" | "cctv.install.cable"
  | "cctv.commissioning.system" | "cctv.commissioning.remote";

export type CctvProfileCapability = {
  profileKey: string;
  recorderChannels?: number | null;
  integratedPoePorts?: number | null;
  driveBayCount?: number | null;
  poePortCount?: number | null;
  storageCapacityTb?: number | null;
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

const requirement = (
  id: string,
  profileKey: CalculatorProfileKey | null,
  sectionKey: EstimateSectionSystemKey,
  description: string,
  quantity: number,
  unit: EstimateUnit,
  assumption: string | null = null,
): CalculatedRequirement => ({
  id, profileKey, sectionKey, description, requirementDescription: description, quantity, unit, assumption,
  resolution: "unresolved", resolvedId: null, resolvedLabel: null,
});

export function calculateCctvRequirements(
  input: CctvCalculatorInput,
  capabilities: readonly CctvProfileCapability[] = defaultCapabilities(),
): CalculatedRequirement[] {
  validateCctvInput(input);
  const cameras = input.indoorCameraCount + input.outdoorCameraCount;
  if (cameras === 0) return [];

  const recorderChannels = input.recorderSelection === "none"
    ? null
    : input.recorderSelection === "auto" ? automaticRecorderChannels(cameras) : input.recorderSelection;
  const recorderProfileKey = recorderChannels ? `cctv.nvr.${recorderChannels}` as CalculatorProfileKey : null;
  const recorderCapability = capabilities.find((item) => item.profileKey === recorderProfileKey);
  const integratedPoePorts = Math.max(0, recorderCapability?.integratedPoePorts ?? 0);
  const externalPoePorts = Math.max(0, cameras - integratedPoePorts);
  const poeCapability = capabilities
    .filter((item) => Number(item.poePortCount) >= externalPoePorts)
    .sort((left, right) => Number(left.poePortCount) - Number(right.poePortCount))[0];

  const megapixelLoad = input.indoorCameraCount * input.indoorResolutionMp
    + input.outdoorCameraCount * input.outdoorResolutionMp;
  const recordingMultiplier = (input.colorNight ? 1.2 : 1) * (input.videoAnalytics ? 1.1 : 1);
  const estimatedStorageTb = Math.max(1, Math.ceil(((megapixelLoad / 4) * input.archiveDays * 24 * recordingMultiplier) / 1000));
  const storagePlan = selectStoragePlan(
    estimatedStorageTb,
    recorderCapability?.driveBayCount ?? null,
    capabilities.filter((item) => item.storageCapacityTb != null),
  );
  const storageAssumption = `Ориентир: около ${estimatedStorageTb} ТБ при усреднённом профиле записи; точный объём зависит от сцены и настроек.`;
  const result: CalculatedRequirement[] = [];

  if (input.indoorCameraCount) result.push(requirement("cctv-indoor", `cctv.indoor.${input.indoorResolutionMp}mp`, "equipment", `Камера видеонаблюдения для помещений, ${input.indoorResolutionMp} Мп`, input.indoorCameraCount, "pcs"));
  if (input.outdoorCameraCount) result.push(requirement("cctv-outdoor", `cctv.outdoor.${input.outdoorResolutionMp}mp`, "equipment", `Уличная камера видеонаблюдения, ${input.outdoorResolutionMp} Мп`, input.outdoorCameraCount, "pcs"));
  if (input.recorderSelection !== "none") {
    result.push(requirement("cctv-nvr", recorderProfileKey, "equipment", recorderChannels
      ? `Сетевой видеорегистратор на ${recorderChannels} каналов`
      : "Видеорегистратор подходящей ёмкости", 1, "pcs"));
  }
  result.push(requirement("cctv-storage", storagePlan ? storagePlan.profileKey as CalculatorProfileKey : null, "equipment",
    storagePlan ? `Накопитель ${storagePlan.capacityTb} ТБ для видеоархива (расчётная потребность около ${estimatedStorageTb} ТБ)`
      : `Накопитель для видеоархива, расчётная потребность около ${estimatedStorageTb} ТБ`,
    storagePlan?.driveCount ?? 1, "pcs", storageAssumption));
  if (externalPoePorts > 0) {
    result.push(requirement("cctv-poe", poeCapability ? poeCapability.profileKey as CalculatorProfileKey : null, "equipment",
      poeCapability ? `PoE-коммутатор на ${poeCapability.poePortCount} портов` : `PoE-коммутация минимум на ${externalPoePorts} внешних портов`, 1, "pcs",
      integratedPoePorts > 0 ? `Учтено ${integratedPoePorts} встроенных PoE-портов регистратора.` : null));
  }
  if (input.backupPower) result.push(requirement("cctv-ups", "cctv.ups", "equipment", "Резервное питание системы видеонаблюдения", 1, "pcs"));

  if (input.cableLength > 0) {
    result.push(requirement("cctv-cable", "cctv.cable.cat5e", "installation_materials", "Кабель Cat.5e для системы видеонаблюдения", input.cableLength, "meter"));
    result.push(requirement("cctv-mounting", "cctv.mounting", "installation_materials", "Монтажные коробки и комплектующие", cameras, "pcs"));
  }
  if (input.installationRequested) {
    result.push(requirement("cctv-install-camera", "cctv.install.camera", "installation_works", "Монтаж камеры видеонаблюдения", cameras, "pcs"));
    if (input.cableLength > 0) result.push(requirement("cctv-install-cable", "cctv.install.cable", "installation_works", "Прокладка кабеля", input.cableLength, "meter"));
  }
  if (input.commissioningRequested) result.push(requirement("cctv-commission-system", "cctv.commissioning.system", "commissioning_works", "Пусконаладочные работы CCTV", cameras, "service"));
  if (input.remoteViewingRequested) result.push(requirement("cctv-commission-remote", "cctv.commissioning.remote", "commissioning_works", "Настройка удалённого просмотра", 1, "service"));
  return result.slice(0, 30);
}

export function automaticRecorderChannels(cameraCount: number): 4 | 8 | 16 | 32 | null {
  return CCTV_RECORDER_CHANNELS.find((channels) => cameraCount <= channels) ?? null;
}

export function validateCctvInput(input: CctvCalculatorInput) {
  if (!CCTV_OBJECT_TYPES.includes(input.objectType)) throw new Error("Некорректный тип объекта.");
  if (!CCTV_CAMERA_RESOLUTIONS.includes(input.indoorResolutionMp) || !CCTV_CAMERA_RESOLUTIONS.includes(input.outdoorResolutionMp)
    || !(input.recorderSelection === "auto" || input.recorderSelection === "none" || CCTV_RECORDER_CHANNELS.includes(input.recorderSelection))) {
    throw new Error("Параметры камер или регистратора некорректны.");
  }
  const integerFields = [input.indoorCameraCount, input.outdoorCameraCount, input.archiveDays, input.cableLength];
  if (!integerFields.every(Number.isInteger) || input.indoorCameraCount < 0 || input.indoorCameraCount > 128
    || input.outdoorCameraCount < 0 || input.outdoorCameraCount > 128 || input.archiveDays < 1
    || input.archiveDays > 365 || input.cableLength < 0 || input.cableLength > 20000) {
    throw new Error("Параметры расчёта выходят за допустимые пределы.");
  }
}

export function cctvInputFingerprintPayload(input: CctvCalculatorInput) {
  return {
    systemType: "cctv" as const, objectType: input.objectType,
    indoorCameraCount: input.indoorCameraCount, indoorResolutionMp: input.indoorResolutionMp,
    outdoorCameraCount: input.outdoorCameraCount, outdoorResolutionMp: input.outdoorResolutionMp,
    recorderSelection: input.recorderSelection,
    archiveDays: input.archiveDays, cableLength: input.cableLength,
    installationRequested: input.installationRequested, commissioningRequested: input.commissioningRequested,
    remoteViewingRequested: input.remoteViewingRequested,
    advancedFlags: [input.colorNight && "color_night", input.licensePlateRecognition && "license_plate_recognition",
      input.videoAnalytics && "video_analytics", input.backupPower && "backup_power"].filter((value): value is string => Boolean(value)),
  };
}

function selectStoragePlan(requiredTb: number, driveBayCount: number | null, profiles: readonly CctvProfileCapability[]) {
  return profiles.flatMap((profile) => {
    const capacityTb = Number(profile.storageCapacityTb);
    if (!capacityTb) return [];
    const driveCount = Math.ceil(requiredTb / capacityTb);
    if (driveBayCount !== null && driveCount > driveBayCount) return [];
    return [{ profileKey: profile.profileKey, capacityTb, driveCount, excessTb: capacityTb * driveCount - requiredTb }];
  }).sort((left, right) => left.excessTb - right.excessTb || left.driveCount - right.driveCount || left.capacityTb - right.capacityTb)[0] ?? null;
}

function defaultCapabilities(): CctvProfileCapability[] {
  return [
    ...CCTV_RECORDER_CHANNELS.map((channels) => ({ profileKey: `cctv.nvr.${channels}`, recorderChannels: channels, integratedPoePorts: 0, driveBayCount: channels === 16 ? 1 : null })),
    ...CCTV_POE_CAPACITIES.map((ports) => ({ profileKey: `cctv.poe.${ports}`, poePortCount: ports })),
    ...CCTV_STORAGE_CAPACITIES_TB.map((capacity) => ({ profileKey: `cctv.storage.${capacity}tb`, storageCapacityTb: capacity })),
  ];
}
