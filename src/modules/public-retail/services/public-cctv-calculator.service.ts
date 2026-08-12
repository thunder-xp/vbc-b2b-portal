import {
  calculateCctvTechnicalPlan,
  type CctvObjectType,
  type CctvTechnicalRequirement,
} from "@/src/modules/cctv-calculation";

import type { PublicRetailReadRepository } from "../repositories/public-retail.repository";
import type { PublicRetailAvailability, PublicRetailLocale, PublicRetailProductSummaryDto } from "../types";

export const PUBLIC_CCTV_OBJECT_TYPES = [
  "apartment", "house", "office", "retail", "warehouse", "production", "horeca", "other",
] as const;
export const PUBLIC_CCTV_QUALITY_LEVELS = ["standard", "recommended", "maximum"] as const;
export const PUBLIC_CCTV_ARCHIVE_DAYS = [7, 14, 30] as const;

export type PublicCctvObjectType = (typeof PUBLIC_CCTV_OBJECT_TYPES)[number];
export type PublicCctvQualityLevel = (typeof PUBLIC_CCTV_QUALITY_LEVELS)[number];
export type PublicCctvCalculatorInput = {
  locale: PublicRetailLocale;
  objectType: PublicCctvObjectType;
  indoorCameraCount: number;
  outdoorCameraCount: number;
  quality: PublicCctvQualityLevel;
  archiveDays: (typeof PUBLIC_CCTV_ARCHIVE_DAYS)[number];
  cableLength: number;
  cameraInstallationRequested: boolean;
  cableLayingRequested: boolean;
  commissioningRequested: boolean;
  remoteViewingRequested: boolean;
  backupPower: boolean;
};
export type PublicCctvResultLine = {
  key: string;
  kind: "product" | "work";
  group: "cameras" | "recorder" | "archive" | "network" | "materials" | "works";
  label: string;
  quantity: number;
  unitLabel: string;
  product: PublicRetailProductSummaryDto | null;
  unitPrice: number | null;
  amount: number | null;
  currency: string | null;
  availability: PublicRetailAvailability | null;
};
export type PublicCctvCalculatorResult = {
  status: "resolved" | "needs_review";
  input: PublicCctvCalculatorInput;
  cameraCount: number;
  indoorResolutionMp: number;
  outdoorResolutionMp: number;
  lines: PublicCctvResultLine[];
  unresolved: string[];
  explanations: string[];
  totals: { equipment: number | null; materials: number | null; installation: null; total: number | null; currency: string | null };
  performance: { engineMs: number; resolutionMs: number; totalMs: number };
};

const QUALITY_INPUTS: Record<PublicCctvQualityLevel, { indoor: 2 | 4 | 6 | 8; outdoor: 2 | 4 | 6 | 8 }> = {
  standard: { indoor: 2, outdoor: 2 },
  // These exact profiles are the governed successors of the approved standard indoor/outdoor mappings.
  recommended: { indoor: 6, outdoor: 4 },
  maximum: { indoor: 8, outdoor: 8 },
};
const PRODUCT_KINDS = new Set<CctvTechnicalRequirement["kind"]>([
  "indoor_camera", "outdoor_camera", "recorder", "storage", "external_poe",
  "backup_power", "cable", "mounting_material",
]);

export class PublicCctvCalculatorService {
  constructor(private readonly repository: PublicRetailReadRepository) {}

  async calculate(input: PublicCctvCalculatorInput): Promise<PublicCctvCalculatorResult> {
    const startedAt = performance.now();
    const normalized = normalizePublicCctvInput(input);
    const quality = QUALITY_INPUTS[normalized.quality];
    const technical = calculateCctvTechnicalPlan({
      objectType: engineObjectType(normalized.objectType),
      indoorCameraCount: normalized.indoorCameraCount,
      indoorResolutionMp: quality.indoor,
      outdoorCameraCount: normalized.outdoorCameraCount,
      outdoorResolutionMp: quality.outdoor,
      recorderSelection: "auto",
      archiveDays: normalized.archiveDays,
      cableLength: normalized.cableLength,
      installationRequested: normalized.cameraInstallationRequested || normalized.cableLayingRequested,
      commissioningRequested: normalized.commissioningRequested,
      remoteViewingRequested: normalized.remoteViewingRequested,
      colorNight: false,
      licensePlateRecognition: false,
      videoAnalytics: false,
      backupPower: normalized.backupPower,
    });
    const engineCompletedAt = performance.now();

    const requirements = technical.requirements.filter((requirement) => includeRequirement(requirement, normalized));
    const productRequirements = requirements.filter((requirement) => PRODUCT_KINDS.has(requirement.kind));
    const profileKeys = [...new Set(productRequirements.flatMap((requirement) => requirement.profileKey ? [requirement.profileKey] : []))];
    const resolutions = profileKeys.length ? await this.repository.resolveCalculatorProducts(profileKeys, normalized.locale) : [];
    const resolutionCompletedAt = performance.now();
    const resolutionByProfile = new Map(resolutions.map((resolution) => [resolution.profileKey, resolution]));
    const unresolved: string[] = [];

    const lines = requirements.map((requirement, index): PublicCctvResultLine => {
      const label = requirementLabel(requirement, normalized.locale);
      if (!PRODUCT_KINDS.has(requirement.kind)) return {
        key: `work-${index + 1}`, kind: "work", group: "works", label,
        quantity: requirement.quantity, unitLabel: unitLabel(requirement.unit, normalized.locale),
        product: null, unitPrice: null, amount: null, currency: null, availability: null,
      };
      const resolution = requirement.profileKey ? resolutionByProfile.get(requirement.profileKey) : null;
      const product = resolution?.matchCount === 1 ? resolution.product : null;
      if (!product) unresolved.push(label);
      return {
        key: `product-${index + 1}`, kind: "product", group: resultGroup(requirement.kind), label,
        quantity: requirement.quantity, unitLabel: unitLabel(requirement.unit, normalized.locale), product,
        unitPrice: product?.price.amount ?? null,
        amount: product ? roundMoney(product.price.amount * requirement.quantity) : null,
        currency: product?.price.currency ?? null,
        availability: product?.availability ?? null,
      };
    });

    const currencies = [...new Set(lines.flatMap((line) => line.currency ? [line.currency] : []))];
    const currency = currencies.length === 1 ? currencies[0] : null;
    if (currencies.length > 1) unresolved.push(normalized.locale === "ro" ? "Monede incompatibile" : "Несовместимые валюты");
    const equipment = subtotal(lines, ["cameras", "recorder", "archive", "network"], currency);
    const materials = subtotal(lines, ["materials"], currency);
    const technicalReady = technical.compatibility.ready && !technical.compatibility.issues.some((issue) => issue.severity === "blocking");
    if (!technicalReady) unresolved.push(normalized.locale === "ro" ? "Configurația tehnică necesită verificare" : "Техническая конфигурация требует проверки");
    const totalCompletedAt = performance.now();

    return {
      status: technicalReady && unresolved.length === 0 ? "resolved" : "needs_review",
      input: normalized,
      cameraCount: normalized.indoorCameraCount + normalized.outdoorCameraCount,
      indoorResolutionMp: quality.indoor,
      outdoorResolutionMp: quality.outdoor,
      lines,
      unresolved: [...new Set(unresolved)],
      explanations: explainDecisions(technical, normalized.locale),
      totals: {
        equipment, materials, installation: null,
        total: equipment === null || materials === null ? null : roundMoney(equipment + materials), currency,
      },
      performance: {
        engineMs: roundTiming(engineCompletedAt - startedAt),
        resolutionMs: roundTiming(resolutionCompletedAt - engineCompletedAt),
        totalMs: roundTiming(totalCompletedAt - startedAt),
      },
    };
  }
}

export function normalizePublicCctvInput(input: PublicCctvCalculatorInput): PublicCctvCalculatorInput {
  if (!PUBLIC_CCTV_OBJECT_TYPES.includes(input.objectType) || !PUBLIC_CCTV_QUALITY_LEVELS.includes(input.quality)
    || !PUBLIC_CCTV_ARCHIVE_DAYS.includes(input.archiveDays)
    || !Number.isInteger(input.indoorCameraCount) || !Number.isInteger(input.outdoorCameraCount)
    || input.indoorCameraCount < 0 || input.outdoorCameraCount < 0
    || input.indoorCameraCount + input.outdoorCameraCount < 1 || input.indoorCameraCount + input.outdoorCameraCount > 32
    || !Number.isInteger(input.cableLength) || input.cableLength < 0 || input.cableLength > 20000
    || ![input.cameraInstallationRequested, input.cableLayingRequested, input.commissioningRequested,
      input.remoteViewingRequested, input.backupPower].every((value) => typeof value === "boolean")) {
    throw new Error("Invalid Public CCTV calculator input.");
  }
  return { ...input };
}

export function publicCctvInputFromSearchParams(searchParams: Record<string, string | string[] | undefined>): PublicCctvCalculatorInput {
  const scalar = (key: string) => Array.isArray(searchParams[key]) ? searchParams[key]?.[0] : searchParams[key];
  const objectCandidate = scalar("object") as PublicCctvObjectType;
  const qualityCandidate = scalar("quality") as PublicCctvQualityLevel;
  const archiveCandidate = Number(scalar("archive"));
  return normalizePublicCctvInput({
    locale: scalar("lang") === "ro" ? "ro" : "ru",
    objectType: PUBLIC_CCTV_OBJECT_TYPES.includes(objectCandidate) ? objectCandidate : "house",
    indoorCameraCount: boundedInteger(scalar("indoor"), 2, 0, 32),
    outdoorCameraCount: boundedInteger(scalar("outdoor"), 2, 0, 32),
    quality: PUBLIC_CCTV_QUALITY_LEVELS.includes(qualityCandidate) ? qualityCandidate : "recommended",
    archiveDays: PUBLIC_CCTV_ARCHIVE_DAYS.includes(archiveCandidate as 7 | 14 | 30) ? archiveCandidate as 7 | 14 | 30 : 14,
    cableLength: boundedInteger(scalar("cable"), 100, 0, 20000),
    cameraInstallationRequested: scalar("installCameras") === "1",
    cableLayingRequested: scalar("layCable") === "1",
    commissioningRequested: scalar("commissioning") === "1",
    remoteViewingRequested: scalar("remote") === "1",
    backupPower: scalar("backup") === "1",
  });
}

function engineObjectType(value: PublicCctvObjectType): CctvObjectType { return value === "production" ? "industrial" : value; }
function includeRequirement(requirement: CctvTechnicalRequirement, input: PublicCctvCalculatorInput) {
  if (requirement.kind === "camera_installation") return input.cameraInstallationRequested;
  if (requirement.kind === "cable_laying") return input.cableLayingRequested;
  return true;
}
function resultGroup(kind: CctvTechnicalRequirement["kind"]): PublicCctvResultLine["group"] {
  if (kind === "indoor_camera" || kind === "outdoor_camera") return "cameras";
  if (kind === "recorder") return "recorder";
  if (kind === "storage") return "archive";
  if (kind === "external_poe" || kind === "backup_power") return "network";
  return "materials";
}
function requirementLabel(requirement: CctvTechnicalRequirement, locale: PublicRetailLocale): string {
  const labels = locale === "ro" ? {
    indoor_camera: "Cameră pentru interior", outdoor_camera: "Cameră pentru exterior", recorder: "Videorecorder",
    storage: "Stocare pentru arhivă", external_poe: "Comutator PoE", backup_power: "Alimentare de rezervă",
    cable: "Cablu pentru camere", mounting_material: "Materiale de montaj", camera_installation: "Instalarea camerelor",
    cable_laying: "Pozarea cablului", commissioning: "Configurare și punere în funcțiune",
    remote_configuration: "Configurarea vizualizării de pe telefon",
  } : {
    indoor_camera: "Камера для помещения", outdoor_camera: "Уличная камера", recorder: "Видеорегистратор",
    storage: "Накопитель для архива", external_poe: "PoE-коммутатор", backup_power: "Резервное питание",
    cable: "Кабель для камер", mounting_material: "Монтажные материалы", camera_installation: "Монтаж камер",
    cable_laying: "Прокладка кабеля", commissioning: "Настройка и пусконаладка",
    remote_configuration: "Настройка просмотра с телефона",
  };
  return labels[requirement.kind];
}
function unitLabel(unit: CctvTechnicalRequirement["unit"], locale: PublicRetailLocale): string {
  if (unit === "meters") return locale === "ro" ? "m" : "м";
  if (unit === "service") return locale === "ro" ? "serviciu" : "услуга";
  return locale === "ro" ? "buc." : "шт.";
}
function explainDecisions(technical: ReturnType<typeof calculateCctvTechnicalPlan>, locale: PublicRetailLocale): string[] {
  const recorder = technical.compatibility.recorder;
  const poe = technical.compatibility.poe;
  const input = technical.normalizedInput;
  const messages: string[] = [];
  if (recorder.channels) messages.push(locale === "ro"
    ? `Pentru ${input.indoorCameraCount + input.outdoorCameraCount} camere a fost ales un recorder cu ${recorder.channels} canale.`
    : `Для ${input.indoorCameraCount + input.outdoorCameraCount} камер выбран регистратор на ${recorder.channels} каналов.`);
  messages.push(locale === "ro" ? `Arhiva este calculată pentru aproximativ ${input.archiveDays} zile.` : `Архив рассчитан примерно на ${input.archiveDays} дней.`);
  if (poe.externalPortsRequired > 0) messages.push(locale === "ro"
    ? "Pentru alimentarea camerelor este adăugat un comutator PoE separat."
    : "Для питания камер добавлен отдельный PoE-коммутатор.");
  else if (recorder.integratedPoePorts) messages.push(locale === "ro"
    ? "Camerele sunt alimentate prin PoE-ul integrat al recorderului."
    : "Камеры получают питание через встроенный PoE видеорегистратора.");
  return messages;
}
function subtotal(lines: PublicCctvResultLine[], groups: PublicCctvResultLine["group"][], currency: string | null) {
  const selected = lines.filter((line) => groups.includes(line.group));
  if (!currency || selected.some((line) => line.amount === null || line.currency !== currency)) return null;
  return roundMoney(selected.reduce((sum, line) => sum + line.amount!, 0));
}
function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function roundTiming(value: number) { return Math.round(value * 10) / 10; }
