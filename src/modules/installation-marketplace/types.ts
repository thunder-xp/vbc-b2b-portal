export const INSTALLATION_OBJECT_TYPES = ["APARTMENT", "HOUSE", "OFFICE", "SHOP", "WAREHOUSE", "OTHER"] as const;
export const INSTALLATION_NEED_TYPES = ["INSTALL_PURCHASED_EQUIPMENT", "DESIGN_AND_INSTALL", "CONSULTATION"] as const;
export const INSTALLATION_DECLINE_REASONS = ["OUT_OF_AREA", "NO_CAPACITY", "NOT_MY_SPECIALIZATION", "TIMING", "OTHER"] as const;

export type InstallationObjectType = typeof INSTALLATION_OBJECT_TYPES[number];
export type InstallationNeedType = typeof INSTALLATION_NEED_TYPES[number];
export type InstallationDeclineReason = typeof INSTALLATION_DECLINE_REASONS[number];
export type InstallationProjectStatus = "DRAFT" | "PARTNER_PENDING" | "PARTNER_ACCEPTED" | "CONTACTED" | "SCHEDULED" | "INSTALLED" | "CUSTOMER_CONFIRMED" | "CLOSED" | "PARTNER_DECLINED" | "CANCELLED" | "EXPIRED" | "DISPUTED";

export type InstallationProjectSummary = Readonly<{
  id: string; sourceType: "PRODUCT" | "ORDER" | "CUSTOM"; objectType: InstallationObjectType;
  locality: string; needType: InstallationNeedType; status: InstallationProjectStatus;
  revision: number; createdAt: string; updatedAt: string; itemCount: number; partnerName: string | null;
}>;
export type InstallationProjectItem = Readonly<{
  id: string; publicProductId: string; orderLineId: string | null; quantity: number;
  name: string | null; sku: string | null; slug: string | null; imageUrl: string | null;
}>;

export type InstallationPartnerPublic = Readonly<{
  providerId: string; displayName: string; description: string | null; logoPath: string | null;
  availability?: "available" | "limited"; coverage?: string; competencies?: string[];
  verifiedReviewCount: number; averageVerifiedRating: number | null; completedVerifiedInstallations: number;
}>;

export type InstallationProjectDetail = InstallationProjectSummary & Readonly<{
  sourceOrderId: string | null; description: string | null; contactConsent: boolean;
  items: InstallationProjectItem[];
  assignment: null | Readonly<{
    id: string; status: "PARTNER_PENDING" | "PARTNER_ACCEPTED" | "PARTNER_DECLINED" | "WITHDRAWN" | "EXPIRED";
    revision: number; selectedAt: string; acceptedAt: string | null; contactedAt: string | null;
    scheduledAt: string | null; plannedFor: string | null; completedAt: string | null;
    declineReason: InstallationDeclineReason | null; partner: InstallationPartnerPublic;
  }>;
  review: null | Readonly<{
    id: string; overallRating: number; workmanshipRating: number; communicationRating: number;
    agreementRating: number; comment: string | null; verificationStatus: "VERIFIED_INSTALLATION";
    moderationStatus: "PUBLISHED" | "PENDING_REVIEW" | "HIDDEN"; createdAt: string;
  }>;
  timeline: ReadonlyArray<{ id: string; type: string; createdAt: string }>;
}>;

export type InstallationShortlistPartner = InstallationPartnerPublic & Readonly<{
  availability: "available" | "limited"; coverage: string; competencies: string[];
  recommended: boolean; learningState: "ESTABLISHED" | "LEARNING" | "NEW_PARTNER";
  typicalResponse: "FAST" | "SAME_DAY" | "LONGER" | null;
}>;

export const INSTALLATION_RANKING_REASON_CODES = [
  "EXACT_SERVICE_AREA", "BROADER_SERVICE_AREA", "SERVICE_AREA_UNSPECIFIED", "EXACT_CAPABILITY",
  "STRONG_VERIFIED_HISTORY", "FAST_RESPONSE", "HIGH_COMPLETION_CONFIDENCE",
  "NEW_PARTNER_EXPLORATION", "UNDEREXPOSED_CANDIDATE", "LOW_SAMPLE_CONFIDENCE", "DISPUTE_SIGNAL",
  "PARTNER_INACTIVE", "PARTNER_SUSPENDED", "PUBLIC_LISTING_DISABLED", "MARKETPLACE_DISABLED",
  "PROFILE_UNPUBLISHED", "PARTNER_UNAVAILABLE", "CAPABILITY_MISMATCH", "SERVICE_AREA_MISMATCH",
] as const;
export type InstallationRankingReasonCode = typeof INSTALLATION_RANKING_REASON_CODES[number];

export type InstallationRankingCandidateEvidence = Readonly<{
  providerId: string; partnerCompanyId: string; displayName: string; description: string | null;
  logoPath: string | null; availability: "available" | "limited" | "unavailable";
  companyActive: boolean; publicListingEnabled: boolean; providerOperationalStatus: "active" | "inactive" | "suspended";
  providerApproved: boolean; marketplaceEnabled: boolean; profilePublished: boolean;
  exactCapability: boolean; hasAnyActiveRegion: boolean; geographyRank: number | null;
  verifiedReviewCount: number; averageOverallRating: number | null; averageWorkmanshipRating: number | null;
  averageCommunicationRating: number | null; averageAgreementRating: number | null;
  assignmentCount: number; responseSampleCount: number; acceptedCount: number; declinedCount: number;
  expiredCount: number; installedCount: number; customerConfirmedCount: number; disputeCount: number;
  cancellationCount: number; medianResponseMinutes: number | null; eligibleImpressions30d: number;
}>;

export type InstallationRankingEvidence = Readonly<{
  projectId: string; customerAccountId: string; systemType: string; locality: string;
  regionCode: string | null; generatedAt: string; candidates: InstallationRankingCandidateEvidence[];
}>;

export type EligibilityResult = Readonly<{ eligible: boolean; excludedReasons: InstallationRankingReasonCode[] }>;
export type RelevanceResult = Readonly<{ score: number; geographyTier: "EXACT" | "BROADER" | "UNSPECIFIED"; reasonCodes: InstallationRankingReasonCode[] }>;
export type QualityResult = Readonly<{ score: number; adjustedRating: number; rawRating: number | null; sampleSize: number; confidence: number; evidenceState: "SUFFICIENT" | "LOW_SAMPLE" | "NO_HISTORY"; reasonCodes: InstallationRankingReasonCode[] }>;
export type ReliabilityResult = Readonly<{ score: number; confidence: number; evidenceState: "SUFFICIENT" | "PARTIAL" | "NO_HISTORY"; acceptanceRate: number | null; completionRate: number | null; confirmationRate: number | null; medianResponseMinutes: number | null; reasonCodes: InstallationRankingReasonCode[] }>;
export type ExposureResult = Readonly<{ score: number; impressions30d: number; learningState: "ESTABLISHED" | "LEARNING" | "NEW_PARTNER"; reasonCodes: InstallationRankingReasonCode[] }>;

export type InstallationRankingCandidateDecision = Readonly<{
  providerId: string; displayName: string; eligible: boolean; finalPosition: number | null;
  internalScore: number | null; reasonCodes: InstallationRankingReasonCode[];
  eligibility: EligibilityResult; relevance: RelevanceResult | null; quality: QualityResult | null;
  reliability: ReliabilityResult | null; exposure: ExposureResult | null;
}>;

export type InstallationRankingDecision = Readonly<{
  policyVersion: string; projectId: string; generatedAt: string; evidenceFingerprint: string;
  candidates: InstallationRankingCandidateDecision[]; orderedProviderIds: string[];
  shadowV1ProviderIds: string[]; shortlist: InstallationShortlistPartner[];
}>;

export type InstallationRankingAdminDiagnostics = Readonly<{
  policyVersion: string; decisionCount: number; deduplicatedImpressions: number;
  top1ImpressionShare: number; top3ImpressionShare: number; top5ImpressionShare: number;
  exposureHhi: number; latestDecision: null | Readonly<{
    id: string; projectId: string; policyVersion: string; candidateCount: number; createdAt: string;
    orderedProviderIds: string[]; shadowV1ProviderIds: string[]; decision: { candidates: InstallationRankingCandidateDecision[] };
  }>;
}>;

export type PartnerInstallationProject = Readonly<{
  assignmentId: string; projectId: string; status: InstallationProjectStatus;
  assignmentStatus: "PARTNER_PENDING" | "PARTNER_ACCEPTED" | "PARTNER_DECLINED" | "WITHDRAWN" | "EXPIRED";
  revision: number; assignmentRevision: number; locality: string; objectType: InstallationObjectType;
  needType: InstallationNeedType; description: string | null; selectedAt: string;
  acceptedAt: string | null; plannedFor: string | null; items: InstallationProjectItem[];
  contact: null | { name: string; phone: string; email: string | null };
  privateLocation: Record<string, unknown> | null;
}>;

export type InstallationMarketplaceAdminReport = Readonly<{
  projects: ReadonlyArray<InstallationProjectSummary & { assignmentId: string | null }>;
  reviews: ReadonlyArray<{ id: string; projectId: string; partnerCompanyId: string; overallRating: number;
    comment: string | null; verificationStatus: "VERIFIED_INSTALLATION"; moderationStatus: "PUBLISHED" | "PENDING_REVIEW" | "HIDDEN";
    revision: number; createdAt: string }>;
}>;
