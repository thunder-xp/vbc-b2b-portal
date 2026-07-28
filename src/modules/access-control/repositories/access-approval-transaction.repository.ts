import type {
  AccessRequest,
  CompanyMembership,
  PartnerCompany,
  UserProfile,
} from "../types";

export type ApprovalCompanyBranch = "new_company" | "existing_company";
export type ApprovalMembershipOutcome = "created" | "restored" | "existing";

export interface ExecuteAccessApprovalInput {
  actorUserId: string;
  requestId: string;
  external1cId: string;
  external1cCode: string | null;
  external1cContractId: string | null;
  external1cPriceTypeId: string;
  decisionReason: string | null;
  correlationId: string;
}

export interface AccessApprovalTransactionResult {
  request: AccessRequest;
  company: PartnerCompany;
  membership: CompanyMembership;
  requester: UserProfile;
  companyBranch: ApprovalCompanyBranch;
  membershipOutcome: ApprovalMembershipOutcome;
  auditEventId: string | null;
  idempotent: boolean;
}

export interface AccessApprovalTransactionRepository {
  approve(
    input: ExecuteAccessApprovalInput,
  ): Promise<AccessApprovalTransactionResult>;
}
