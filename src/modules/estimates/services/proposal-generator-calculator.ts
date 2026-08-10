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
  | "cctv.nvr.16" | "cctv.storage.8tb" | "cctv.poe.16" | "cctv.cable.cat5e"
  | "cctv.mounting" | "cctv.ups" | "cctv.install.camera" | "cctv.install.cable"
  | "cctv.commissioning.system" | "cctv.commissioning.remote";

type CalculatedRequirement = GeneratorRequirement & { profileKey: CalculatorProfileKey | null; assumption?: string | null };

const requirement = (
  id: string,
  profileKey: CalculatorProfileKey | null,
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

  const storageMultiplier = (input.highResolution ? 1.5 : 1) * (input.colorNight ? 1.2 : 1) * (input.videoAnalytics ? 1.1 : 1);
  const estimatedStorageTb = Math.max(1, Math.ceil((cameras * input.archiveDays * 24 * storageMultiplier) / 1000));
  const storageDriveCount = Math.max(1, Math.ceil(estimatedStorageTb / 8));
  const assumptions = `Ориентир: ${estimatedStorageTb} ТБ при усреднённом профиле записи; точный объём зависит от сцены и настроек.`;
  const result: CalculatedRequirement[] = [];

  if (input.indoorCameraCount) result.push(requirement("cctv-indoor", "cctv.indoor.standard", "equipment", "Камера видеонаблюдения для помещений", input.indoorCameraCount, "pcs"));
  if (input.outdoorCameraCount) result.push(requirement("cctv-outdoor", "cctv.outdoor.standard", "equipment", "Уличная камера видеонаблюдения", input.outdoorCameraCount, "pcs"));
  result.push(requirement("cctv-nvr", cameras <= 16 ? "cctv.nvr.16" : null, "equipment", cameras <= 16 ? "Сетевой видеорегистратор на 16 каналов" : "Видеорегистратор подходящей ёмкости", 1, "pcs"));
  result.push(requirement("cctv-storage", "cctv.storage.8tb", "equipment", `Накопитель для видеоархива, ориентировочно ${estimatedStorageTb} ТБ`, storageDriveCount, "pcs", assumptions));
  result.push(requirement("cctv-poe", cameras <= 16 ? "cctv.poe.16" : null, "equipment", cameras <= 16 ? "PoE-коммутатор на 16 портов" : "PoE-коммутация подходящей ёмкости", 1, "pcs"));
  if (input.backupPower) result.push(requirement("cctv-ups", "cctv.ups", "equipment", "Резервное питание системы видеонаблюдения", 1, "pcs"));

  if (input.cableLength > 0) {
    result.push(requirement("cctv-cable", "cctv.cable.cat5e", "installation_materials", "Кабель Cat.5e для системы видеонаблюдения", input.cableLength, "meter"));
    result.push(requirement("cctv-mounting", "cctv.mounting", "installation_materials", "Монтажные коробки и комплектующие", cameras, "pcs"));
  }

  if (input.installationRequested) {
    result.push(requirement("cctv-install-camera", "cctv.install.camera", "installation_works", "Монтаж камеры видеонаблюдения", cameras, "pcs"));
    if (input.cableLength > 0) result.push(requirement("cctv-install-cable", "cctv.install.cable", "installation_works", "Прокладка кабеля", input.cableLength, "meter"));
  }

  if (input.commissioningRequested) {
    result.push(requirement("cctv-commission-system", "cctv.commissioning.system", "commissioning_works", "Пусконаладочные работы CCTV", 1, "service"));
  }
  // MVP: remote viewing reuses the governed generic equipment-configuration service.
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
