import type { EstimateSectionSystemKey, EstimateUnit } from "../types";
import type { GeneratorRequirement } from "./proposal-generator";

export const CCTV_OBJECT_TYPES = [
  "apartment", "house", "office", "retail", "warehouse", "industrial", "horeca", "other",
] as const;

export type CctvObjectType = (typeof CCTV_OBJECT_TYPES)[number];

export type CctvCalculatorInput = {
  objectType: CctvObjectType;
  indoorCameraCount: number;
  outdoorCameraCount: number;
  archiveDays: number;
  cableLength: number;
  installationRequested: boolean;
  commissioningRequested: boolean;
  remoteViewingRequested: boolean;
  colorNight: boolean;
  highResolution: boolean;
  licensePlateRecognition: boolean;
  videoAnalytics: boolean;
  backupPower: boolean;
};

export type CalculatorProfileKey =
  | "cctv.indoor.standard" | "cctv.outdoor.standard"
  | "cctv.nvr.8" | "cctv.nvr.16" | "cctv.nvr.32"
  | "cctv.storage" | "cctv.poe" | "cctv.cable" | "cctv.mounting" | "cctv.ups"
  | "cctv.install.camera" | "cctv.install.cable" | "cctv.install.infrastructure"
  | "cctv.commissioning.camera" | "cctv.commissioning.recorder" | "cctv.commissioning.remote";

type CalculatedRequirement = GeneratorRequirement & { profileKey: CalculatorProfileKey; assumption?: string | null };

const requirement = (
  id: string,
  profileKey: CalculatorProfileKey,
  sectionKey: EstimateSectionSystemKey,
  description: string,
  quantity: number,
  unit: EstimateUnit,
  assumption: string | null = null,
): CalculatedRequirement => ({
  id, profileKey, sectionKey, description, quantity, unit, assumption,
  resolution: "unresolved", resolvedId: null, resolvedLabel: null,
});

export function calculateCctvRequirements(input: CctvCalculatorInput): CalculatedRequirement[] {
  validateCctvInput(input);
  const cameras = input.indoorCameraCount + input.outdoorCameraCount;
  if (cameras === 0) return [];

  const nvrCapacity = cameras <= 8 ? 8 : cameras <= 16 ? 16 : 32;
  const nvrCount = Math.ceil(cameras / nvrCapacity);
  const storageMultiplier = (input.highResolution ? 1.5 : 1) * (input.colorNight ? 1.2 : 1) * (input.videoAnalytics ? 1.1 : 1);
  const estimatedStorageTb = Math.max(1, Math.ceil((cameras * input.archiveDays * 24 * storageMultiplier) / 1000));
  const storageDriveCount = Math.max(1, Math.ceil(estimatedStorageTb / 8));
  const assumptions = `Ориентир: ${estimatedStorageTb} ТБ при усреднённом профиле записи; точный объём зависит от сцены и настроек.`;
  const result: CalculatedRequirement[] = [];

  if (input.indoorCameraCount) result.push(requirement("cctv-indoor", "cctv.indoor.standard", "equipment", "Камера видеонаблюдения для помещений", input.indoorCameraCount, "pcs"));
  if (input.outdoorCameraCount) result.push(requirement("cctv-outdoor", "cctv.outdoor.standard", "equipment", "Уличная камера видеонаблюдения", input.outdoorCameraCount, "pcs"));
  result.push(requirement("cctv-nvr", `cctv.nvr.${nvrCapacity}` as CalculatorProfileKey, "equipment", `Сетевой видеорегистратор на ${nvrCapacity} каналов`, nvrCount, "pcs"));
  result.push(requirement("cctv-storage", "cctv.storage", "equipment", `Накопитель для видеоархива, ориентировочно ${estimatedStorageTb} ТБ`, storageDriveCount, "pcs", assumptions));
  result.push(requirement("cctv-poe", "cctv.poe", "equipment", "PoE-коммутатор для камер", Math.ceil(cameras / 16), "pcs"));
  if (input.backupPower) result.push(requirement("cctv-ups", "cctv.ups", "equipment", "Резервное питание системы видеонаблюдения", 1, "pcs"));

  if (input.cableLength > 0) {
    result.push(requirement("cctv-cable", "cctv.cable", "installation_materials", "Кабель для системы видеонаблюдения", input.cableLength, "meter"));
    result.push(requirement("cctv-mounting", "cctv.mounting", "installation_materials", "Монтажные коробки и комплектующие", cameras, "pcs"));
  }

  if (input.installationRequested) {
    result.push(requirement("cctv-install-camera", "cctv.install.camera", "installation_works", "Монтаж камеры видеонаблюдения", cameras, "service"));
    if (input.cableLength > 0) result.push(requirement("cctv-install-cable", "cctv.install.cable", "installation_works", "Прокладка кабеля", input.cableLength, "meter"));
    result.push(requirement("cctv-install-infrastructure", "cctv.install.infrastructure", "installation_works", "Монтаж регистратора и сетевого оборудования", nvrCount, "service"));
  }

  if (input.commissioningRequested) {
    result.push(requirement("cctv-commission-camera", "cctv.commissioning.camera", "commissioning_works", "Настройка камер", cameras, "service"));
    result.push(requirement("cctv-commission-recorder", "cctv.commissioning.recorder", "commissioning_works", "Настройка видеорегистратора", nvrCount, "service"));
  }
  if (input.remoteViewingRequested) result.push(requirement("cctv-commission-remote", "cctv.commissioning.remote", "commissioning_works", "Настройка удалённого просмотра", 1, "service"));

  return result.slice(0, 30);
}

export function validateCctvInput(input: CctvCalculatorInput) {
  if (!CCTV_OBJECT_TYPES.includes(input.objectType)) throw new Error("Некорректный тип объекта.");
  const integerFields = [input.indoorCameraCount, input.outdoorCameraCount, input.archiveDays, input.cableLength];
  if (!integerFields.every(Number.isInteger) || input.indoorCameraCount < 0 || input.indoorCameraCount > 128
    || input.outdoorCameraCount < 0 || input.outdoorCameraCount > 128 || input.archiveDays < 1
    || input.archiveDays > 365 || input.cableLength < 0 || input.cableLength > 20000) {
    throw new Error("Параметры расчёта выходят за допустимые пределы.");
  }
}

export function cctvInputFingerprintPayload(input: CctvCalculatorInput) {
  return {
    systemType: "cctv" as const,
    objectType: input.objectType,
    indoorCameraCount: input.indoorCameraCount,
    outdoorCameraCount: input.outdoorCameraCount,
    archiveDays: input.archiveDays,
    cableLength: input.cableLength,
    installationRequested: input.installationRequested,
    commissioningRequested: input.commissioningRequested,
    remoteViewingRequested: input.remoteViewingRequested,
    advancedFlags: [
      input.colorNight && "color_night", input.highResolution && "high_resolution",
      input.licensePlateRecognition && "license_plate_recognition", input.videoAnalytics && "video_analytics",
      input.backupPower && "backup_power",
    ].filter((value): value is string => Boolean(value)),
  };
}
