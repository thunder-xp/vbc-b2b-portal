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
