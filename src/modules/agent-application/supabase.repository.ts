import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { CommercialAgentApplicationRepository } from "./repository";
import type { CommercialAgentApplication } from "./types";

export class SupabaseCommercialAgentApplicationRepository implements CommercialAgentApplicationRepository {
  async findByApplicant(applicantUserId: string) {
    const { data, error } = await createAdminClient()
      .from("commercial_agent_applications")
      .select("*")
      .eq("applicant_user_id", applicantUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw repositoryError("find applicant application", error.code);
    return data ? mapApplication(data) : null;
  }

  async ensureDraft(applicantUserId: string, email: string) {
    const { data, error } = await createAdminClient().rpc("ensure_commercial_agent_application_draft", {
      p_applicant_user_id: applicantUserId,
      p_email: email,
    });
    if (error) throw repositoryError("ensure application draft", error.code);
    return data ? mapApplication(data) : null;
  }

  async submit(applicantUserId: string, input: Parameters<CommercialAgentApplicationRepository["submit"]>[1]) {
    const { data, error } = await createAdminClient().rpc("submit_commercial_agent_application", {
      p_applicant_user_id: applicantUserId,
      p_display_name: input.displayName,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_locality: input.locality ?? null,
      p_profession: input.profession ?? null,
      p_workplace: input.workplace ?? null,
      p_agent_type: input.agentType,
      p_legal_name: input.legalName ?? null,
    });
    if (error || !data) throw repositoryError("submit application", error?.code);
    return mapApplication(data);
  }

  async withdraw(applicantUserId: string) {
    const { data, error } = await createAdminClient().rpc("withdraw_commercial_agent_application", {
      p_applicant_user_id: applicantUserId,
    });
    if (error || !data) throw repositoryError("withdraw application", error?.code);
    return mapApplication(data);
  }

  async listForAdmin() {
    const { data, error } = await createAdminClient()
      .from("commercial_agent_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw repositoryError("list applications", error.code);
    return (data ?? []).map(mapApplication);
  }

  async getForAdmin(applicationId: string) {
    const { data, error } = await createAdminClient()
      .from("commercial_agent_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw repositoryError("get application", error.code);
    return data ? mapApplication(data) : null;
  }

  async review(input: Parameters<CommercialAgentApplicationRepository["review"]>[0]) {
    const { data, error } = await createAdminClient().rpc("review_commercial_agent_application", {
      p_application_id: input.applicationId,
      p_actor_user_id: input.actorUserId,
      p_action: input.action,
      p_safe_note: input.safeNote ?? null,
    });
    if (error || !data) throw repositoryError("review application", error?.code);
    return mapApplication(data);
  }
}

type DatabaseRow = Record<string, unknown>;

function mapApplication(row: DatabaseRow): CommercialAgentApplication {
  return {
    id: text(row.id),
    applicantUserId: text(row.applicant_user_id),
    status: row.status as CommercialAgentApplication["status"],
    displayName: nullableText(row.display_name),
    phone: nullableText(row.phone),
    email: nullableText(row.email),
    locality: nullableText(row.locality),
    profession: nullableText(row.profession),
    workplace: nullableText(row.workplace),
    agentType: row.agent_type as CommercialAgentApplication["agentType"],
    legalName: nullableText(row.legal_name),
    applicantVisibleNote: nullableText(row.applicant_visible_note),
    submittedAt: nullableText(row.submitted_at),
    reviewedAt: nullableText(row.reviewed_at),
    reviewedBy: nullableText(row.reviewed_by),
    provisionedAgentId: nullableText(row.provisioned_agent_id),
    revision: Number(row.revision),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function text(value: unknown) {
  return String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function repositoryError(operation: string, code?: string) {
  return new Error(`Commercial Agent application repository ${operation} failed: ${code ?? "UNKNOWN"}`);
}
