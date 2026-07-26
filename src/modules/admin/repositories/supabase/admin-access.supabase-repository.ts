import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { AdminAccessRepository } from "../admin-access.repository";
import type {
  AdminAccessCompanyContext,
  AdminAccessInspection,
  AdminAccessSubject,
} from "../../types";

type AccessSubjectRow = {
  user_id: string;
  full_name: string;
  email: string;
  identity_type: "internal" | "partner";
  company_contexts: AdminAccessCompanyContext[] | null;
};

type AccessPermissionRow = {
  user_id: string;
  full_name: string;
  email: string;
  identity_type: "internal" | "partner";
  profile_status: string;
  company_id: string | null;
  company_name: string | null;
  company_status: string | null;
  membership_id: string | null;
  membership_status: string | null;
  role_code: string | null;
  role_name: string | null;
  permission_code: string;
  permission_label: string;
  permission_category: string;
  is_allowed: boolean;
  explanation_source: string;
  delegable: boolean;
  sensitive: boolean;
};

export class SupabaseAdminAccessRepository implements AdminAccessRepository {
  async listSubjects(search: string): Promise<AdminAccessSubject[]> {
    const rows = await this.call<AccessSubjectRow[]>(
      "list_admin_access_subjects",
      { p_search: search || null, p_limit: 50 },
    );
    return rows.map((row) => ({
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      identityType: row.identity_type,
      companyContexts: row.company_contexts ?? [],
    }));
  }

  async inspect(
    userId: string,
    companyId: string | null,
  ): Promise<AdminAccessInspection | null> {
    const rows = await this.call<AccessPermissionRow[]>(
      "inspect_admin_effective_access",
      { p_user_id: userId, p_company_id: companyId },
    );
    const first = rows[0];
    if (!first) return null;
    return {
      userId: first.user_id,
      fullName: first.full_name,
      email: first.email,
      identityType: first.identity_type,
      profileStatus: first.profile_status,
      companyId: first.company_id,
      companyName: first.company_name,
      companyStatus: first.company_status,
      membershipId: first.membership_id,
      membershipStatus: first.membership_status,
      roleCode: first.role_code,
      roleName: first.role_name,
      permissions: rows.map((row) => ({
        code: row.permission_code,
        label: row.permission_label,
        category: row.permission_category,
        allowed: row.is_allowed,
        source: row.explanation_source,
        delegable: row.delegable,
        sensitive: row.sensitive,
      })),
    };
  }

  private async call<T>(
    operation: string,
    input: Record<string, unknown>,
  ): Promise<T> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(operation, input);
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation,
        table: "admin_access_projection",
        payloadKeys: Object.keys(input),
        cause: error,
      });
    }
    return data as T;
  }
}
