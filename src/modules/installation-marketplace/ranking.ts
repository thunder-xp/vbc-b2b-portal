import type {
  EligibilityResult, ExposureResult, InstallationRankingCandidateDecision,
  InstallationRankingCandidateEvidence, InstallationRankingDecision, InstallationRankingEvidence,
  InstallationRankingReasonCode, InstallationShortlistPartner, QualityResult, ReliabilityResult, RelevanceResult,
} from "./types";

export const INSTALLATION_RANKING_POLICY = Object.freeze({
  version: "installation-ranking-v2.1",
  qualityPriorMean: 4,
  qualityPriorWeight: 5,
  qualitySufficientSample: 5,
  reliabilityMinimumSample: 3,
  disputeMinimumSample: 5,
  responseFastMinutes: 120,
  responseSameDayMinutes: 480,
  responseSlowMinutes: 1440,
  exposureLookbackDays: 30,
  impressionDedupeMinutes: 30,
  explorationEpochDays: 7,
  explorationReservedSlots: 1,
  weights: Object.freeze({ relevance: 0.45, quality: 0.25, reliability: 0.2, exposure: 0.1 }),
});

export function rankInstallationPartners(evidence: InstallationRankingEvidence, limit = 5): InstallationRankingDecision {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 5);
  const maxExposure = Math.max(0, ...evidence.candidates.filter((candidate) => evaluateEligibility(candidate,evidence.regionCode).eligible).map((candidate) => candidate.eligibleImpressions30d));
  const decisions = evidence.candidates.map((candidate) => decideCandidate(candidate, evidence.regionCode, maxExposure));
  const eligible = decisions.filter((candidate) => candidate.eligible);
  const byProvider = new Map(evidence.candidates.map((candidate) => [candidate.providerId, candidate]));
  const baseOrder = [...eligible].sort((a, b) => compareBase(a, b));
  const ordered = applyFairExposure(baseOrder, evidence, boundedLimit);
  const orderedIds = ordered.map((candidate) => candidate.providerId);
  const positions = new Map(orderedIds.map((providerId, index) => [providerId, index + 1]));
  const candidates = decisions.map((candidate) => ({ ...candidate, finalPosition: positions.get(candidate.providerId) ?? null }));
  const shortlist = ordered.map((decision, index): InstallationShortlistPartner => {
    const source = byProvider.get(decision.providerId)!;
    return {
      providerId: source.providerId, displayName: source.displayName, description: source.description,
      logoPath: source.logoPath, availability: source.availability === "unavailable" ? "limited" : source.availability,
      coverage: evidence.locality, competencies: [evidence.systemType],
      verifiedReviewCount: source.verifiedReviewCount,
      averageVerifiedRating: source.averageOverallRating,
      completedVerifiedInstallations: source.customerConfirmedCount,
      recommended: index === 0,
      learningState: decision.exposure?.learningState ?? "LEARNING",
      typicalResponse: responseLabel(decision.reliability),
    };
  });
  const shadowV1ProviderIds = evidence.candidates.filter((candidate) => isEligible(candidate, evidence.regionCode).eligible)
    .sort((a, b) => (geoScore(b.geographyRank, evidence.regionCode) - geoScore(a.geographyRank, evidence.regionCode))
      || Number(b.availability === "available") - Number(a.availability === "available")
      || a.displayName.localeCompare(b.displayName) || a.providerId.localeCompare(b.providerId))
    .slice(0, boundedLimit).map((candidate) => candidate.providerId);
  return {
    policyVersion: INSTALLATION_RANKING_POLICY.version, projectId: evidence.projectId,
    generatedAt: evidence.generatedAt, evidenceFingerprint: "", candidates,
    orderedProviderIds: orderedIds, shadowV1ProviderIds, shortlist,
  };
}

export function evaluateEligibility(candidate: InstallationRankingCandidateEvidence, regionCode: string | null): EligibilityResult {
  const reasons: InstallationRankingReasonCode[] = [];
  if (!candidate.companyActive) reasons.push("PARTNER_INACTIVE");
  if (candidate.providerOperationalStatus === "suspended") reasons.push("PARTNER_SUSPENDED");
  else if (candidate.providerOperationalStatus !== "active" || !candidate.providerApproved) reasons.push("PARTNER_INACTIVE");
  if (!candidate.publicListingEnabled) reasons.push("PUBLIC_LISTING_DISABLED");
  if (!candidate.marketplaceEnabled) reasons.push("MARKETPLACE_DISABLED");
  if (!candidate.profilePublished) reasons.push("PROFILE_UNPUBLISHED");
  if (candidate.availability === "unavailable") reasons.push("PARTNER_UNAVAILABLE");
  if (!candidate.exactCapability) reasons.push("CAPABILITY_MISMATCH");
  if (regionCode ? candidate.geographyRank === null : !candidate.hasAnyActiveRegion) reasons.push("SERVICE_AREA_MISMATCH");
  return { eligible: reasons.length === 0, excludedReasons: unique(reasons) };
}

export function evaluateRelevance(candidate: InstallationRankingCandidateEvidence, regionCode: string | null): RelevanceResult {
  const reasons: InstallationRankingReasonCode[] = ["EXACT_CAPABILITY"];
  let geographyTier: RelevanceResult["geographyTier"] = "UNSPECIFIED";
  let geography = 0.2;
  if (regionCode && candidate.geographyRank === 0) { geographyTier = "EXACT"; geography = 0.4; reasons.push("EXACT_SERVICE_AREA"); }
  else if (regionCode && candidate.geographyRank !== null) { geographyTier = "BROADER"; geography = 0.28; reasons.push("BROADER_SERVICE_AREA"); }
  else reasons.push("SERVICE_AREA_UNSPECIFIED");
  return { score: round4(0.5 + geography + (candidate.availability === "available" ? 0.1 : 0.05)), geographyTier, reasonCodes: reasons };
}

export function evaluateQuality(candidate: InstallationRankingCandidateEvidence): QualityResult {
  const sample = candidate.verifiedReviewCount;
  const raw = weightedRating(candidate);
  const observed = raw ?? INSTALLATION_RANKING_POLICY.qualityPriorMean;
  const adjusted = (INSTALLATION_RANKING_POLICY.qualityPriorMean * INSTALLATION_RANKING_POLICY.qualityPriorWeight + observed * sample)
    / (INSTALLATION_RANKING_POLICY.qualityPriorWeight + sample);
  const confidence = sample / (INSTALLATION_RANKING_POLICY.qualityPriorWeight + sample);
  const state = sample === 0 ? "NO_HISTORY" : sample < INSTALLATION_RANKING_POLICY.qualitySufficientSample ? "LOW_SAMPLE" : "SUFFICIENT";
  const reasons: InstallationRankingReasonCode[] = [];
  if (state !== "SUFFICIENT") reasons.push("LOW_SAMPLE_CONFIDENCE");
  if (state === "SUFFICIENT" && adjusted >= 4.3) reasons.push("STRONG_VERIFIED_HISTORY");
  return { score: round4((adjusted - 1) / 4), adjustedRating: round4(adjusted), rawRating: raw === null ? null : round4(raw), sampleSize: sample, confidence: round4(confidence), evidenceState: state, reasonCodes: reasons };
}

export function evaluateReliability(candidate: InstallationRankingCandidateEvidence): ReliabilityResult {
  const minimum = INSTALLATION_RANKING_POLICY.reliabilityMinimumSample;
  const parts: number[] = []; const reasons: InstallationRankingReasonCode[] = [];
  const denominator = candidate.acceptedCount + candidate.declinedCount + candidate.expiredCount;
  const acceptanceRate = denominator >= minimum ? candidate.acceptedCount / denominator : null;
  if (acceptanceRate !== null) parts.push(acceptanceRate);
  const completionRate = candidate.acceptedCount >= minimum ? candidate.installedCount / candidate.acceptedCount : null;
  if (completionRate !== null) { parts.push(clamp01(completionRate)); if (completionRate >= 0.8) reasons.push("HIGH_COMPLETION_CONFIDENCE"); }
  const confirmationRate = candidate.installedCount >= minimum ? candidate.customerConfirmedCount / candidate.installedCount : null;
  if (confirmationRate !== null) parts.push(clamp01(confirmationRate));
  if (candidate.responseSampleCount >= minimum && candidate.medianResponseMinutes !== null) {
    parts.push(responseScore(candidate.medianResponseMinutes));
    if (candidate.medianResponseMinutes <= INSTALLATION_RANKING_POLICY.responseFastMinutes) reasons.push("FAST_RESPONSE");
  }
  const disputeBase = candidate.customerConfirmedCount + candidate.disputeCount;
  if (disputeBase >= INSTALLATION_RANKING_POLICY.disputeMinimumSample) parts.push(1 - candidate.disputeCount / disputeBase);
  if (candidate.disputeCount > 0) reasons.push("DISPUTE_SIGNAL");
  const evidenceState = parts.length === 0 ? "NO_HISTORY" : parts.length >= 3 ? "SUFFICIENT" : "PARTIAL";
  return {
    score: round4(parts.length ? parts.reduce((sum, value) => sum + value, 0) / parts.length : 0.5),
    confidence: round4(Math.min(1, parts.length / 3)), evidenceState,
    acceptanceRate: nullableRound(acceptanceRate), completionRate: nullableRound(completionRate), confirmationRate: nullableRound(confirmationRate),
    medianResponseMinutes: candidate.responseSampleCount >= minimum ? candidate.medianResponseMinutes : null, reasonCodes: unique(reasons),
  };
}

export function evaluateExposure(candidate: InstallationRankingCandidateEvidence, maxExposure: number): ExposureResult {
  const isNew = candidate.assignmentCount === 0 && candidate.verifiedReviewCount === 0;
  const learning = !isNew && (candidate.assignmentCount < INSTALLATION_RANKING_POLICY.reliabilityMinimumSample || candidate.verifiedReviewCount < INSTALLATION_RANKING_POLICY.qualitySufficientSample);
  const score = maxExposure === 0 ? 0.5 : 1 - candidate.eligibleImpressions30d / maxExposure;
  const reasons: InstallationRankingReasonCode[] = [];
  if (isNew) reasons.push("NEW_PARTNER_EXPLORATION");
  if (candidate.eligibleImpressions30d === 0 || (maxExposure > 0 && candidate.eligibleImpressions30d < maxExposure * 0.5)) reasons.push("UNDEREXPOSED_CANDIDATE");
  return { score: round4(clamp01(score)), impressions30d: candidate.eligibleImpressions30d, learningState: isNew ? "NEW_PARTNER" : learning ? "LEARNING" : "ESTABLISHED", reasonCodes: reasons };
}

function decideCandidate(candidate: InstallationRankingCandidateEvidence, regionCode: string | null, maxExposure: number): InstallationRankingCandidateDecision {
  const eligibility = evaluateEligibility(candidate, regionCode);
  if (!eligibility.eligible) return { providerId: candidate.providerId, displayName: candidate.displayName, eligible: false, finalPosition: null, internalScore: null, reasonCodes: eligibility.excludedReasons, eligibility, relevance: null, quality: null, reliability: null, exposure: null };
  const relevance = evaluateRelevance(candidate, regionCode);
  const quality = evaluateQuality(candidate);
  const reliability = evaluateReliability(candidate);
  const exposure = evaluateExposure(candidate, maxExposure);
  const weights = INSTALLATION_RANKING_POLICY.weights;
  const score = relevance.score * weights.relevance + quality.score * weights.quality + reliability.score * weights.reliability + exposure.score * weights.exposure;
  return { providerId: candidate.providerId, displayName: candidate.displayName, eligible: true, finalPosition: null, internalScore: round4(score), reasonCodes: unique([...relevance.reasonCodes, ...quality.reasonCodes, ...reliability.reasonCodes, ...exposure.reasonCodes]), eligibility, relevance, quality, reliability, exposure };
}

function applyFairExposure(base: InstallationRankingCandidateDecision[], evidence: InstallationRankingEvidence, limit: number) {
  const selected = base.slice(0, limit);
  const reservedSlots: number = INSTALLATION_RANKING_POLICY.explorationReservedSlots;
  if (reservedSlots < 1 || limit < 3 || base.length <= limit) return selected;
  const selectedIds = new Set(selected.map((candidate) => candidate.providerId));
  const epoch = Math.floor(new Date(evidence.generatedAt).getTime() / (INSTALLATION_RANKING_POLICY.explorationEpochDays * 86400000));
  const exploration = base.filter((candidate) => !selectedIds.has(candidate.providerId) && candidate.exposure && (candidate.exposure.learningState !== "ESTABLISHED" || candidate.exposure.reasonCodes.includes("UNDEREXPOSED_CANDIDATE")))
    .sort((a, b) => (b.relevance?.score ?? 0) - (a.relevance?.score ?? 0)
      || (a.exposure?.impressions30d ?? 0) - (b.exposure?.impressions30d ?? 0)
      || stableHash(`${evidence.projectId}:${epoch}:${a.providerId}`) - stableHash(`${evidence.projectId}:${epoch}:${b.providerId}`)
      || a.providerId.localeCompare(b.providerId))[0];
  if (exploration) selected[selected.length - 1] = exploration;
  return selected;
}

function compareBase(a: InstallationRankingCandidateDecision, b: InstallationRankingCandidateDecision) {
  return (b.internalScore ?? 0) - (a.internalScore ?? 0)
    || (b.relevance?.score ?? 0) - (a.relevance?.score ?? 0)
    || a.displayName.localeCompare(b.displayName) || a.providerId.localeCompare(b.providerId);
}
function isEligible(candidate: InstallationRankingCandidateEvidence, regionCode: string | null) { return evaluateEligibility(candidate, regionCode); }
function geoScore(rank: number | null, regionCode: string | null) { return !regionCode ? 0 : rank === 0 ? 2 : rank === null ? -1 : 1; }
function weightedRating(candidate: InstallationRankingCandidateEvidence) {
  const values = [candidate.averageOverallRating, candidate.averageWorkmanshipRating, candidate.averageCommunicationRating, candidate.averageAgreementRating];
  return values.some((value) => value === null) ? null : values[0]! * 0.5 + values[1]! * 0.2 + values[2]! * 0.15 + values[3]! * 0.15;
}
function responseScore(minutes: number) { return minutes <= INSTALLATION_RANKING_POLICY.responseFastMinutes ? 1 : minutes <= INSTALLATION_RANKING_POLICY.responseSameDayMinutes ? 0.8 : minutes <= INSTALLATION_RANKING_POLICY.responseSlowMinutes ? 0.55 : 0.3; }
function responseLabel(result: ReliabilityResult | null): InstallationShortlistPartner["typicalResponse"] { const minutes=result?.medianResponseMinutes; return minutes===null||minutes===undefined?null:minutes<=INSTALLATION_RANKING_POLICY.responseFastMinutes?"FAST":minutes<=INSTALLATION_RANKING_POLICY.responseSameDayMinutes?"SAME_DAY":"LONGER"; }
function stableHash(value: string) { let hash = 2166136261; for (let index=0; index<value.length; index+=1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function clamp01(value: number) { return Math.min(1, Math.max(0, value)); }
function round4(value: number) { return Math.round(value * 10000) / 10000; }
function nullableRound(value: number | null) { return value === null ? null : round4(value); }
