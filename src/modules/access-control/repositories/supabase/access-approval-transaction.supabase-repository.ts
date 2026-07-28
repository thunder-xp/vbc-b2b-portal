import { createClient } from "@/src/lib/supabase/server";

import type {
  AccessApprovalTransactionRepository,
  AccessApprovalTransactionResult,
  ApprovalCompanyBranch,
  ApprovalMembershipOutcome,
  ExecuteAccessApprovalInput,
} from "../access-approval-transaction.repository";
import { RepositoryUnexpectedError } from "../index";
import {
  mapAccessRequestRow,
  mapCompanyMembershipRow,
  mapPartnerCompanyRow,
  mapUserProfileRow,
  type AccessRequestRow,
  type CompanyMembershipRow,
  type PartnerCompanyRow,
  type UserProfileRow,
} from "./mappers";

type ApprovalRpcRow = {
  request: AccessRequestRow;
  company: PartnerCompanyRow;
  membership: CompanyMembershipRow;
  requester: UserProfileRow;
  company_branch: ApprovalCompanyBranch;
  membership_outcome: ApprovalMembershipOutcome;
  audit_event_id: string | null;
  idempotent: boolean;
};

export class SupabaseAccessApprovalTransactionRepository
  implements AccessApprovalTransactionRepository
{
  async approve(
    input: ExecuteAccessApprovalInput,
  ): Promise<AccessApprovalTransactionResult> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "approve_partner_access_request_v2",
      {
        p_request_id: input.requestId,
        p_external_1c_id: input.external1cId,
        p_external_1c_code: input.external1cCode,
        p_external_1c_contract_id: input.external1cContractId,
        p_external_1c_price_type_id: input.external1cPriceTypeId,
        p_decision_reason: input.decisionReason,
        p_correlation_id: input.correlationId,
      },
    );

    if (error) {
      console.error({
        event: "partner_access_approval_rpc_failed",
        operation: "approve_partner_access_request_v2",
        table: "access_requests",
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payloadKeys: [
          "requestId",
          "external1cId",
          "external1cCode",
          "external1cContractId",
          "external1cPriceTypeId",
          "decisionReason",
          "correlationId",
        ],
      });
      throw new RepositoryUnexpectedError({
        operation: "approve_partner_access_request_v2",
        table: "access_requests",
        payloadKeys: [
          "requestId",
          "external1cId",
          "external1cCode",
          "external1cContractId",
          "external1cPriceTypeId",
          "decisionReason",
          "correlationId",
        ],
        cause: error,
      });
    }

    const row = data as ApprovalRpcRow | null;

    if (!row?.request || !row.company || !row.membership || !row.requester) {
      throw new RepositoryUnexpectedError({
        operation: "approve_partner_access_request_v2",
        table: "access_requests",
      });
    }

    return {
      request: mapAccessRequestRow(row.request),
      company: mapPartnerCompanyRow(row.company),
      membership: mapCompanyMembershipRow(row.membership),
      requester: mapUserProfileRow(row.requester),
      companyBranch: row.company_branch,
      membershipOutcome: row.membership_outcome,
      auditEventId: row.audit_event_id,
      idempotent: row.idempotent,
    };
  }
}
