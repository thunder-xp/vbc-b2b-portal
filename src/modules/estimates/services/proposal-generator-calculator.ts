import type { EstimateSectionSystemKey, EstimateUnit } from "../types";
import type { GeneratorRequirement } from "./proposal-generator";

export const CCTV_OBJECT_TYPES = [
  "apartment", "house", "office", "retail", "warehouse", "industrial", "horeca", "other",
] as const;
export const CCTV_CAMERA_RESOLUTIONS = [2, 4, 6, 8] as const;
export const CCTV_RECORDER_CHANNELS = [4, 8, 16, 32] as const;
export const CCTV_POE_CAPACITIES = [4, 8, 16, 24, 32] as const;
export const CCTV_STORAGE_CAPACITIES_TB = [1, 2, 4, 6, 8, 12] as const;

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
  return calculateCctvConfiguration(input, capabilities).requirements;
}

export function calculateCctvConfiguration(
  input: CctvCalculatorInput,
  capabilities: readonly CctvProfileCapability[] = defaultCapabilities(),
): { requirements: CalculatedRequirement[]; compatibility: CctvConfigurationSummary } {
  validateCctvInput(input);
  const cameras = input.indoorCameraCount + input.outdoorCameraCount;
  if (cameras === 0) return { requirements: [], compatibility: emptyCompatibility() };

  const megapixelLoad = input.indoorCameraCount * input.indoorResolutionMp
    + input.outdoorCameraCount * input.outdoorResolutionMp;
  const recordingMultiplier = (input.colorNight ? 1.2 : 1) * (input.videoAnalytics ? 1.1 : 1);
  const estimatedStorageTb = Math.max(1, Math.ceil(((megapixelLoad / 4) * input.archiveDays * 24 * recordingMultiplier) / 1000));
  const approvedStorage = capabilities.filter(isApprovedStorageProfile);
  const minimumChannels = automaticRecorderChannels(cameras);
  const issues: CctvCompatibilityIssue[] = [];
  const recorderChoice = selectRecorder(input.recorderSelection, cameras, estimatedStorageTb, capabilities, approvedStorage);
  const recorderCapability = recorderChoice.capability;
  const recorderChannels = recorderCapability?.recorderChannels ?? (input.recorderSelection === "none" ? null : minimumChannels);
  const recorderProfileKey = recorderCapability?.profileKey as CalculatorProfileKey | undefined;
  const storagePlan = recorderChoice.storagePlan;
  if (recorderChoice.issue) issues.push(recorderChoice.issue);
  if (input.recorderSelection === "none") issues.push({ severity: "warning", code: "recorder_not_selected", message: "Регистратор не выбран. Проверьте комплектность системы." });
  if (typeof input.recorderSelection === "number" && minimumChannels && input.recorderSelection > minimumChannels) {
    issues.push({ severity: "warning", code: "recorder_above_recommended_tier", message: "Выбран регистратор больше рекомендуемого класса." });
  }
  const integratedPoePorts = recorderCapability?.integratedPoePorts;
  const externalPoePorts = Math.max(0, cameras - (integratedPoePorts ?? 0));
  const poeCapability = capabilities.filter(isApprovedPoeProfile)
    .filter((item) => Number(item.poePortCount) >= externalPoePorts)
    .sort((left, right) => Number(left.poePortCount) - Number(right.poePortCount))[0];
  if (externalPoePorts > 0 && !poeCapability) issues.push({ severity: "warning", code: "insufficient_poe", message: `Не хватает ${externalPoePorts} PoE-портов. Требуется выбор коммутатора.` });
  const storageAssumption = `Ориентир: около ${estimatedStorageTb} ТБ при усреднённом профиле записи; точный объём зависит от сцены и настроек.`;
  const result: CalculatedRequirement[] = [];

  if (input.indoorCameraCount) result.push(requirement("cctv-indoor", `cctv.indoor.${input.indoorResolutionMp}mp`, "equipment", `Камера видеонаблюдения для помещений, ${input.indoorResolutionMp} Мп`, input.indoorCameraCount, "pcs"));
  if (input.outdoorCameraCount) result.push(requirement("cctv-outdoor", `cctv.outdoor.${input.outdoorResolutionMp}mp`, "equipment", `Уличная камера видеонаблюдения, ${input.outdoorResolutionMp} Мп`, input.outdoorCameraCount, "pcs"));
  if (input.recorderSelection !== "none") {
    result.push(requirement("cctv-nvr", recorderProfileKey ?? null, "equipment", recorderChannels
      ? `Сетевой видеорегистратор на ${recorderChannels} каналов`
      : "Видеорегистратор подходящей ёмкости", 1, "pcs"));
  }
  if (storagePlan) {
    storagePlan.drives.forEach((drive, index) => result.push(requirement(index === 0 ? "cctv-storage" : `cctv-storage-${index + 1}`, drive.profileKey as CalculatorProfileKey, "equipment",
      `Накопитель ${drive.capacityTb} ТБ для видеоархива (расчётная потребность около ${estimatedStorageTb} ТБ)`, drive.quantity, "pcs", index === 0 ? storageAssumption : null)));
  } else {
    result.push(requirement("cctv-storage", null, "equipment", "Требуется выбор накопителя", 1, "pcs", storageAssumption));
  }
  if (externalPoePorts > 0) {
    result.push(requirement("cctv-poe", poeCapability ? poeCapability.profileKey as CalculatorProfileKey : null, "equipment",
      poeCapability ? `PoE-коммутатор на ${poeCapability.poePortCount} портов` : `PoE-коммутация минимум на ${externalPoePorts} внешних портов`, 1, "pcs",
      integratedPoePorts != null && integratedPoePorts > 0 ? `Учтено ${integratedPoePorts} встроенных PoE-портов регистратора.` : null));
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
  const physicalCapacityTb = storagePlan?.physicalCapacityTb ?? null;
  return { requirements: result.slice(0, 30), compatibility: {
    compatibleConfigurationFound: input.recorderSelection !== "none" && Boolean(recorderCapability && storagePlan) && !issues.some((issue) => issue.severity === "blocking"),
    automaticRecorderProfile: input.recorderSelection === "auto" ? recorderProfileKey ?? null : null,
    recorder: { profileKey: recorderProfileKey ?? null, channels: recorderCapability?.recorderChannels ?? null,
      driveBayCount: recorderCapability?.driveBayCount ?? null, maxDriveCapacityTb: recorderCapability?.maxDriveCapacityTb ?? null,
      integratedPoePorts: integratedPoePorts ?? null },
    archive: { requiredCapacityTb: estimatedStorageTb, selectedDrives: storagePlan?.drives ?? [], physicalCapacityTb },
    externalPoePortsRequired: externalPoePorts, issues,
  } };
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

type StoragePlan = { drives: Array<{ profileKey: string; capacityTb: number; quantity: number }>; physicalCapacityTb: number; excessTb: number; driveCount: number };

function selectRecorder(selection: CctvRecorderSelection, cameras: number, requiredTb: number, capabilities: readonly CctvProfileCapability[], storage: readonly CctvProfileCapability[]) {
  if (selection === "none") return { capability: null, storagePlan: null, issue: null };
  const candidates = capabilities.filter((item) => item.recorderChannels != null && (selection === "auto" || item.recorderChannels === selection))
    .sort((left, right) => Number(left.recorderChannels) - Number(right.recorderChannels));
  if (selection !== "auto" && selection < cameras) return { capability: candidates[0] ?? null, storagePlan: null,
    issue: { severity: "blocking" as const, code: "recorder_channels_insufficient", message: `Для ${cameras} камер выбран регистратор на ${selection} каналов.` } };
  for (const candidate of candidates) {
    if (Number(candidate.recorderChannels) < cameras || !isVerifiedRecorder(candidate)) continue;
    const plan = selectStoragePlan(requiredTb, candidate.driveBayCount!, candidate.maxDriveCapacityTb!, storage);
    if (plan) return { capability: candidate, storagePlan: plan, issue: null };
  }
  if (selection === "auto" && candidates.some((candidate) => Number(candidate.recorderChannels) >= cameras)
    && !candidates.some((candidate) => Number(candidate.recorderChannels) >= cameras && isVerifiedRecorder(candidate))) {
    return { capability: null, storagePlan: null,
      issue: { severity: "blocking" as const, code: "recorder_metadata_unverified", message: "Требуется выбор регистратора: сведения о совместимости не подтверждены." } };
  }
  const selected = selection === "auto" ? null : candidates[0] ?? null;
  if (selected && !isVerifiedRecorder(selected)) return { capability: selected, storagePlan: null,
    issue: { severity: "blocking" as const, code: "recorder_metadata_unverified", message: "Требуется выбор регистратора: сведения о совместимости не подтверждены." } };
  return { capability: selected, storagePlan: null,
    issue: { severity: "blocking" as const, code: "storage_incompatible", message: `Расчётный архив ${requiredTb} TB не помещается в доступную конфигурацию накопителей.` } };
}

function selectStoragePlan(requiredTb: number, driveBayCount: number, maxDriveCapacityTb: number, profiles: readonly CctvProfileCapability[]): StoragePlan | null {
  const drives = profiles.map((profile) => ({ profileKey: profile.profileKey, capacityTb: Number(profile.storageCapacityTb) }))
    .filter((drive) => drive.capacityTb > 0 && drive.capacityTb <= maxDriveCapacityTb)
    .sort((left, right) => left.capacityTb - right.capacityTb);
  const plans: StoragePlan[] = [];
  const visit = (start: number, remainingBays: number, selected: typeof drives) => {
    if (selected.length) {
      const physicalCapacityTb = selected.reduce((sum, drive) => sum + drive.capacityTb, 0);
      if (physicalCapacityTb >= requiredTb) {
        const grouped = new Map<string, { profileKey: string; capacityTb: number; quantity: number }>();
        selected.forEach((drive) => grouped.set(drive.profileKey, { ...drive, quantity: (grouped.get(drive.profileKey)?.quantity ?? 0) + 1 }));
        plans.push({ drives: [...grouped.values()].sort((a, b) => b.capacityTb - a.capacityTb), physicalCapacityTb,
          excessTb: physicalCapacityTb - requiredTb, driveCount: selected.length });
        return;
      }
    }
    if (!remainingBays) return;
    for (let index = start; index < drives.length; index += 1) visit(index, remainingBays - 1, [...selected, drives[index]]);
  };
  visit(0, driveBayCount, []);
  return plans.sort((left, right) => left.excessTb - right.excessTb || left.driveCount - right.driveCount
    || compareDrivePriority(left.drives, right.drives))[0] ?? null;
}

function compareDrivePriority(left: StoragePlan["drives"], right: StoragePlan["drives"]) {
  return left.reduce((sum, drive) => sum + drive.capacityTb * drive.quantity, 0) - right.reduce((sum, drive) => sum + drive.capacityTb * drive.quantity, 0);
}

function isVerifiedRecorder(item: CctvProfileCapability) {
  return item.compatibilityVerified === true && item.resolution === "catalog" && item.recorderChannels != null
    && item.integratedPoePorts != null && item.driveBayCount != null && item.maxDriveCapacityTb != null;
}

function isApprovedStorageProfile(item: CctvProfileCapability) {
  return item.storageCapacityTb != null && (item.resolution === undefined || item.resolution === "catalog") && item.storageCapacityTb !== 12;
}

function isApprovedPoeProfile(item: CctvProfileCapability) {
  return item.poePortCount != null && (item.resolution === undefined || item.resolution === "catalog") && item.poePortCount !== 32;
}

function emptyCompatibility(): CctvConfigurationSummary {
  return { compatibleConfigurationFound: false, automaticRecorderProfile: null,
    recorder: { profileKey: null, channels: null, driveBayCount: null, maxDriveCapacityTb: null, integratedPoePorts: null },
    archive: { requiredCapacityTb: 0, selectedDrives: [], physicalCapacityTb: null }, externalPoePortsRequired: 0, issues: [] };
}

function defaultCapabilities(): CctvProfileCapability[] {
  return [
    { profileKey: "cctv.nvr.4", recorderChannels: 4, integratedPoePorts: 4, driveBayCount: 1, maxDriveCapacityTb: 8, compatibilityVerified: true, resolution: "catalog" },
    { profileKey: "cctv.nvr.8", recorderChannels: 8, integratedPoePorts: 8, driveBayCount: 1, maxDriveCapacityTb: 20, compatibilityVerified: true, resolution: "catalog" },
    { profileKey: "cctv.nvr.16", recorderChannels: 16, integratedPoePorts: 0, driveBayCount: 1, maxDriveCapacityTb: 20, compatibilityVerified: true, resolution: "catalog" },
    { profileKey: "cctv.nvr.32", recorderChannels: 32, integratedPoePorts: 0, driveBayCount: 2, maxDriveCapacityTb: 16, compatibilityVerified: true, resolution: "catalog" },
    ...CCTV_POE_CAPACITIES.map((ports) => ({ profileKey: `cctv.poe.${ports}`, poePortCount: ports })),
    ...CCTV_STORAGE_CAPACITIES_TB.filter((capacity) => capacity !== 1 && capacity !== 12).map((capacity) => ({ profileKey: `cctv.storage.${capacity}tb`, storageCapacityTb: capacity, resolution: "catalog" as const })),
  ];
}
