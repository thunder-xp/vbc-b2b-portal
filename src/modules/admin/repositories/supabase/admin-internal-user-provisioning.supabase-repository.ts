import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type {
  AdminInternalUserProvisioningRepository,
  BeginFinanceOperatorProvisioningResult,
  InternalUserProvisioningState,
} from "../admin-internal-user-provisioning.repository";

type BeginRow = { request_id: string; newly_created: boolean };
type StateRow = {
  request_id: string;
  email: string;
  display_name: string;
  role_code: string;
  provisioning_status: "invited" | "active";
};

export class SupabaseAdminInternalUserProvisioningRepository
  implements AdminInternalUserProvisioningRepository
{
  async begin(
    email: string,
    displayName: string,
    reason: string,
  ): Promise<BeginFinanceOperatorProvisioningResult> {
    const rows = await this.call<BeginRow[]>("begin_finance_operator_provisioning", {
      p_email: email,
      p_display_name: displayName,
      p_reason: reason,
    });
    const row = rows[0];
    if (!row) throw this.unexpected("begin_finance_operator_provisioning", ["p_email", "p_display_name", "p_reason"]);
    return { requestId: row.request_id, newlyCreated: row.newly_created };
  }

  async markInvited(requestId: string, authUserId: string): Promise<void> {
    await this.call("mark_finance_operator_invited", {
      p_request_id: requestId,
      p_auth_user_id: authUserId,
    });
  }

  async markFailed(requestId: string, safeErrorCode: string): Promise<void> {
    await this.call("fail_finance_operator_provisioning", {
      p_request_id: requestId,
      p_safe_error_code: safeErrorCode,
    });
  }

  async activateCurrent(): Promise<string> {
    return this.call<string>("activate_invited_finance_operator", {});
  }

  async getCurrent(): Promise<InternalUserProvisioningState | null> {
    const rows = await this.call<StateRow[]>("get_my_internal_user_provisioning", {});
    const row = rows[0];
    return row ? {
      requestId: row.request_id,
      email: row.email,
      displayName: row.display_name,
      roleCode: row.role_code,
      status: row.provisioning_status,
    } : null;
  }

  private async call<T = unknown>(operation: string, input: Record<string, unknown>): Promise<T> {
    const client = await createClient();
    const { data, error } = await client.rpc(operation, input);
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation,
        table: "internal_user_provisioning_requests",
        payloadKeys: Object.keys(input),
        cause: error,
      });
    }
    return data as T;
  }

  private unexpected(operation: string, payloadKeys: string[]): RepositoryUnexpectedError {
    return new RepositoryUnexpectedError({
      operation,
      table: "internal_user_provisioning_requests",
      payloadKeys,
      cause: new Error("Provisioning RPC returned no result."),
    });
  }
}
