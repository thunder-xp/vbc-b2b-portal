import type { EstimateLifecycleStatus, EstimateStatus, EstimateVersionStatus } from "../estimates/types";

export type EstimateSalesOpportunityType = "ready_to_send" | "awaiting_customer";

export type EstimateSalesOpportunitySource = {
  versionId: string;
  estimateId: string;
  estimateNumber: string;
  proposalName: string;
  customerName: string | null;
  projectName: string | null;
  amount: number;
  currency: string;
  versionStatus: EstimateVersionStatus;
  estimateStatus: EstimateStatus;
  estimateLifecycleStatus: EstimateLifecycleStatus;
  sentAt: string | null;
  createdAt: string;
  readyDocumentId: string | null;
};

export type EstimateSalesOpportunityPermissions = {
  canView: boolean;
  canSend: boolean;
};

export type PartnerEstimateSalesOpportunity = {
  id: string;
  type: EstimateSalesOpportunityType;
  priority: 1 | 2;
  estimateId: string;
  versionId: string;
  estimateNumber: string;
  proposalName: string;
  customerName: string | null;
  projectName: string | null;
  amount: number;
  currency: string;
  waitingSince: string;
  href: string;
};
