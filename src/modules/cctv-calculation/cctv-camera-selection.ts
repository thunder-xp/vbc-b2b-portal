import type { CctvObjectType, CctvTechnicalInput, CctvTechnicalRequirement } from "./cctv-engine";

export const CCTV_CAMERA_SELECTION_POLICY_VERSION = "cctv_camera_selection_v1";
export type CctvCameraPlacement = "indoor" | "outdoor";
export type CctvCameraPriority = "high" | "normal" | "low";

export type CctvCameraCandidate = {
  candidateId: string; objectType: CctvObjectType; placement: CctvCameraPlacement; productId: string;
  manualPriority: CctvCameraPriority; enabled: boolean; resolutionMp: number; networkCamera: boolean;
  poeSupported: boolean | null; colorNight: boolean | null; anpr: boolean | null; videoAnalytics: boolean | null;
  technicalVerified: boolean; availableStock: number; recentSalesQty: number; lastSaleAt: string | null;
  signalUpdatedAt: string | null;
};

export type CctvCameraCandidateRecord = CctvCameraCandidate & {
  sku: string;
  name: string;
  imageUrl: string | null;
  publicProduct: unknown | null;
};

export type CctvCameraPoolAdminRow = CctvCameraCandidateRecord & {
  notes: string | null;
  version: number;
  evidenceSource: string | null;
  publicPublished: boolean;
  retailPriceAmount: number | null;
  retailPriceCurrency: string | null;
};

export type CctvCameraCandidateSearchRow = {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  resolutionMp: number;
  colorNight: boolean | null;
  anpr: boolean | null;
  videoAnalytics: boolean | null;
  technicalVerified: boolean;
  availableStock: number;
  recentSalesQty: number;
  retailPriceAmount: number | null;
  retailPriceCurrency: string | null;
  alreadyInPool: boolean;
};

export type CctvCameraRanking = CctvCameraCandidate & {
  score: number; priorityScore: number; stockDepthScore: number; slowSalesScore: number;
};
type CameraRequirement = Pick<CctvTechnicalRequirement, "kind" | "cameraResolutionMp">;

export function selectCctvCameraCandidates(
  input: Pick<CctvTechnicalInput, "objectType" | "colorNight" | "licensePlateRecognition" | "videoAnalytics">,
  requirement: CameraRequirement,
  candidates: readonly CctvCameraCandidate[],
): { policyVersion: typeof CCTV_CAMERA_SELECTION_POLICY_VERSION; eligible: CctvCameraRanking[]; recommended: CctvCameraRanking | null } {
  const placement = requirement.kind === "indoor_camera" ? "indoor" : requirement.kind === "outdoor_camera" ? "outdoor" : null;
  const requiredResolutionMp = requirement.cameraResolutionMp;
  if (!placement || requiredResolutionMp == null) return { policyVersion: CCTV_CAMERA_SELECTION_POLICY_VERSION, eligible: [], recommended: null };
  const eligibleIn = (objectType: CctvObjectType) => candidates.filter((candidate) => candidate.enabled
    && candidate.objectType === objectType && candidate.placement === placement && candidate.technicalVerified && candidate.networkCamera
    && candidate.resolutionMp >= requiredResolutionMp && candidate.availableStock > 0
    && (!input.colorNight || candidate.colorNight === true)
    && (!input.licensePlateRecognition || candidate.anpr === true)
    && (!input.videoAnalytics || candidate.videoAnalytics === true))
    .map(rankCandidate)
    .sort((left, right) => right.score - left.score || priorityWeight(right.manualPriority) - priorityWeight(left.manualPriority)
      || left.productId.localeCompare(right.productId));
  const exact = eligibleIn(input.objectType);
  const eligible = exact.length ? exact : eligibleIn("other");
  return { policyVersion: CCTV_CAMERA_SELECTION_POLICY_VERSION, eligible, recommended: eligible[0] ?? null };
}

export function selectEconomyAlternative<T extends CctvCameraRanking>(
  ranked: readonly T[], prices: ReadonlyMap<string, number>, recommendedProductId: string | null,
): T | null {
  return ranked.filter((candidate) => candidate.productId !== recommendedProductId && prices.has(candidate.productId))
    .sort((left, right) => prices.get(left.productId)! - prices.get(right.productId)!
      || left.productId.localeCompare(right.productId))[0] ?? null;
}

function rankCandidate(candidate: CctvCameraCandidate): CctvCameraRanking {
  const priorityScore = priorityWeight(candidate.manualPriority) * 100;
  const stockDepthScore = Math.min(100, Math.round(Math.log2(candidate.availableStock + 1) * 15));
  const velocity = candidate.recentSalesQty / 90;
  const slowSalesScore = Math.max(0, 100 - Math.min(100, Math.round(velocity * 20)));
  return { ...candidate, priorityScore, stockDepthScore, slowSalesScore, score: priorityScore + stockDepthScore + slowSalesScore };
}

function priorityWeight(priority: CctvCameraPriority): number { return priority === "high" ? 2 : priority === "normal" ? 1 : 0; }
