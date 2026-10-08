import { CCTV_OBJECT_TYPES, validateCctvInput, type CctvCalculatorInput, type CctvObjectType } from "./proposal-generator-calculator";

export const GUIDED_ZONE_TYPES = ["entrance", "perimeter", "parking", "gate", "checkout", "reception", "sales", "office", "corridor", "storage", "production", "loading", "inside", "custom"] as const;
export type GuidedZoneType = typeof GUIDED_ZONE_TYPES[number];
export type GuidedZone = {
  id: string; type: GuidedZoneType; label: string; placement: "indoor" | "outdoor"; quantity: number;
  colorNight: boolean; licensePlateRecognition: boolean; videoAnalytics: boolean;
};
export type GuidedZoneRequirements = {
  objectType: CctvObjectType; zones: GuidedZone[];
  system: Omit<CctvCalculatorInput, "objectType" | "indoorCameraCount" | "outdoorCameraCount">;
};

// Suggestions are optional requirement intents. They contain no product or pricing identity.
export function suggestedGuidedZones(objectType: CctvObjectType): readonly GuidedZoneType[] {
  switch (objectType) {
    case "house": return ["entrance", "perimeter", "gate", "parking", "inside"];
    case "retail": return ["entrance", "checkout", "sales", "storage", "parking"];
    case "warehouse": return ["entrance", "storage", "loading", "perimeter", "gate"];
    case "apartment": return ["entrance", "inside"];
    case "office": return ["entrance", "reception", "office", "corridor"];
    case "industrial": return ["entrance", "production", "storage", "perimeter"];
    case "horeca": return ["entrance", "reception", "checkout", "storage"];
    default: return ["entrance", "inside", "perimeter", "custom"];
  }
}

export function createGuidedZone(type: GuidedZoneType, id: string): GuidedZone {
  return { id, type, label: "", placement: ["perimeter", "parking", "gate", "loading"].includes(type) ? "outdoor" : "indoor",
    quantity: 1, colorNight: false, licensePlateRecognition: false, videoAnalytics: false };
}

export function guidedPointCounts(zones: readonly GuidedZone[]) {
  return zones.reduce((total, zone) => ({
    indoorCameraCount: total.indoorCameraCount + (zone.placement === "indoor" ? zone.quantity : 0),
    outdoorCameraCount: total.outdoorCameraCount + (zone.placement === "outdoor" ? zone.quantity : 0),
  }), { indoorCameraCount: 0, outdoorCameraCount: 0 });
}

export function translateGuidedZones(input: GuidedZoneRequirements): CctvCalculatorInput {
  if (!CCTV_OBJECT_TYPES.includes(input.objectType) || !Array.isArray(input.zones) || input.zones.length > 128) throw new Error("Invalid guided zones.");
  if ([input.system.colorNight, input.system.licensePlateRecognition, input.system.videoAnalytics, input.system.backupPower, input.system.installationRequested, input.system.commissioningRequested, input.system.remoteViewingRequested].some((flag) => typeof flag !== "boolean")) throw new Error("Invalid explicit requirement flags.");
  for (const zone of input.zones) {
    if (!GUIDED_ZONE_TYPES.includes(zone.type) || !["indoor", "outdoor"].includes(zone.placement)
      || !Number.isInteger(zone.quantity) || zone.quantity < 0 || zone.quantity > 128
      || typeof zone.label !== "string" || zone.label.length > 100
      || [zone.colorNight, zone.licensePlateRecognition, zone.videoAnalytics].some((flag) => typeof flag !== "boolean")) throw new Error("Invalid guided zone.");
  }
  const parameters: CctvCalculatorInput = {
    ...input.system, objectType: input.objectType, ...guidedPointCounts(input.zones),
    colorNight: input.system.colorNight || input.zones.some((zone) => zone.quantity > 0 && zone.colorNight),
    licensePlateRecognition: input.system.licensePlateRecognition || input.zones.some((zone) => zone.quantity > 0 && zone.licensePlateRecognition),
    videoAnalytics: input.system.videoAnalytics || input.zones.some((zone) => zone.quantity > 0 && zone.videoAnalytics),
  };
  if (!parameters.indoorCameraCount && !parameters.outdoorCameraCount) throw new Error("At least one observation point is required.");
  validateCctvInput(parameters);
  return parameters;
}

export function guidedZoneFacts(input: GuidedZoneRequirements, allowEmpty = false) {
  const parameters = allowEmpty && !input.zones.some((zone) => zone.quantity > 0)
    ? { ...input.system, objectType: input.objectType, ...guidedPointCounts(input.zones) } : translateGuidedZones(input);
  return {
    zoneCount: input.zones.length,
    zoneTypes: [...new Set(input.zones.map((zone) => zone.type))],
    observationPointCount: parameters.indoorCameraCount + parameters.outdoorCameraCount,
    indoorPointCount: parameters.indoorCameraCount, outdoorPointCount: parameters.outdoorCameraCount,
    selectedArchiveDays: parameters.archiveDays,
    selectedResolutionTier: parameters.indoorResolutionMp === parameters.outdoorResolutionMp ? `${parameters.indoorResolutionMp}mp` : "mixed",
    advancedRequirementFlags: [parameters.colorNight && "color_night", parameters.licensePlateRecognition && "license_plate_recognition", parameters.videoAnalytics && "video_analytics", parameters.backupPower && "backup_power"].filter((value): value is string => Boolean(value)),
  };
}

export type GuidedProgress = { flowId: string; stage: "object" | "zones" | "requirements" | "review" | "replacement"; facts: ReturnType<typeof guidedZoneFacts>; objectType: CctvObjectType; sessionId?: string; manualReplacementCount?: number };
