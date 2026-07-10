import { createClient } from "@/src/lib/supabase/server";
import { randomUUID } from "node:crypto";

import type {
  AccessRequestRepository,
  CreateAccessRequestInput,
  FindPendingAccessRequestDuplicateInput,
  UpdateAccessRequestStatusInput,
} from "../access-request.repository";
import { AccessRequestStatus, type AccessRequest } from "../../types";
import {
  mapAccessRequestRow,
  type AccessRequestRow,
} from "./mappers";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../index";

const ACCESS_REQUEST_COLUMNS =
  "id, user_profile_id, company_id, requested_external_1c_id, requested_company_name, requested_fiscal_code, contact_phone, message, status, reviewed_by, reviewed_at, decision_reason, created_at, updated_at";

type SupabaseRepositoryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export class SupabaseAccessRequestRepository
  implements AccessRequestRepository
{
  async findById(id: string): Promise<AccessRequest | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("access_requests")
      .select(ACCESS_REQUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throwRepositoryError({
        operation: "access_requests.findById",
        table: "access_requests",
        error,
      });
    }

    return data ? mapAccessRequestRow(data as AccessRequestRow) : null;
  }

  async findByUserId(userId: string): Promise<AccessRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("access_requests")
      .select(ACCESS_REQUEST_COLUMNS)
      .eq("user_profile_id", userId);

    if (error) {
      throwRepositoryError({
        operation: "access_requests.findByUserId",
        table: "access_requests",
        error,
      });
    }

    return (data as AccessRequestRow[]).map(mapAccessRequestRow);
  }

  async findPendingReview(): Promise<AccessRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("access_requests")
      .select(ACCESS_REQUEST_COLUMNS)
      .eq("status", AccessRequestStatus.PendingReview)
      .order("created_at", { ascending: true });

    if (error) {
      throwRepositoryError({
        operation: "access_requests.findPendingReview",
        table: "access_requests",
        error,
      });
    }

    return (data as AccessRequestRow[]).map(mapAccessRequestRow);
  }

  async findPendingDuplicate(
    input: FindPendingAccessRequestDuplicateInput,
  ): Promise<AccessRequest | null> {
    const supabase = await createClient();
    let query = supabase
      .from("access_requests")
      .select(ACCESS_REQUEST_COLUMNS)
      .eq("user_profile_id", input.userId)
      .eq("status", AccessRequestStatus.PendingReview);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throwRepositoryError({
        operation: "access_requests.findPendingDuplicate",
        table: "access_requests",
        error,
      });
    }

    return data ? mapAccessRequestRow(data as AccessRequestRow) : null;
  }

  async create(input: CreateAccessRequestInput): Promise<AccessRequest> {
    const supabase = await createClient();
    const requestId = randomUUID();
    const now = new Date().toISOString();
    const insertPayload: {
      id: string;
      user_profile_id: string;
      requested_external_1c_id?: string | null;
      requested_company_name: string | null;
      requested_fiscal_code: string | null;
      contact_phone: string | null;
      message: string | null;
    } = {
      id: requestId,
      user_profile_id: input.userId,
      requested_company_name: input.requestedCompanyName ?? null,
      requested_fiscal_code: input.requestedFiscalCode ?? null,
      contact_phone: input.contactPhone ?? null,
      message: input.message ?? null,
    };

    if (input.requestedExternal1cId !== undefined) {
      insertPayload.requested_external_1c_id = input.requestedExternal1cId;
    }

    console.info("[access-request-submit] repository insert payload", {
      fields: Object.keys(insertPayload),
      userId: insertPayload.user_profile_id,
      external1cIdPresent: "requested_external_1c_id" in insertPayload,
      requestedCompanyNamePresent: Boolean(insertPayload.requested_company_name),
      requestedFiscalCodePresent: Boolean(insertPayload.requested_fiscal_code),
      contactPhonePresent: Boolean(insertPayload.contact_phone),
      messagePresent: Boolean(insertPayload.message),
      expectedStatusFromDatabaseDefault: AccessRequestStatus.PendingReview,
    });

    const { data, error } = await supabase
      .from("access_requests")
      .insert(insertPayload);

    if (error) {
      throwRepositoryError({
        operation: "access_requests.create",
        table: "access_requests",
        error,
        payloadKeys: Object.keys(insertPayload),
      });
    }

    console.info("[access-request-submit] repository insert succeeded", {
      operation: "access_requests.create",
      table: "access_requests",
      returnedDataPresent: Boolean(data),
      selectedAfterInsert: false,
      requestId,
    });

    return {
      id: requestId,
      userId: input.userId,
      companyId: null,
      requestedExternal1cId: null,
      requestedCompanyName: input.requestedCompanyName ?? null,
      requestedFiscalCode: input.requestedFiscalCode ?? null,
      contactPhone: input.contactPhone ?? null,
      message: input.message ?? null,
      status: AccessRequestStatus.PendingReview,
      reviewedBy: null,
      reviewedAt: null,
      decisionReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateStatus(
    input: UpdateAccessRequestStatusInput,
  ): Promise<AccessRequest> {
    if (
      input.status !== AccessRequestStatus.Cancelled &&
      input.status !== AccessRequestStatus.Approved &&
      input.status !== AccessRequestStatus.Rejected
    ) {
      throw new RepositoryOperationNotAvailableError(
        "access_requests.updateStatus",
      );
    }

    const supabase = await createClient();
    const updatePayload: {
      status: AccessRequestStatus;
      company_id?: string | null;
      requested_external_1c_id?: string | null;
      reviewed_by?: string | null;
      reviewed_at?: string | null;
      decision_reason?: string | null;
    } = {
      status: input.status,
    };

    if (input.companyId !== undefined) {
      updatePayload.company_id = input.companyId;
    }

    if (input.requestedExternal1cId !== undefined) {
      updatePayload.requested_external_1c_id = input.requestedExternal1cId;
    }

    if (input.reviewedBy !== undefined) {
      updatePayload.reviewed_by = input.reviewedBy;
    }

    if (input.reviewedAt !== undefined) {
      updatePayload.reviewed_at = input.reviewedAt;
    }

    if (input.decisionReason !== undefined) {
      updatePayload.decision_reason = input.decisionReason;
    }

    const { data, error } = await supabase
      .from("access_requests")
      .update(updatePayload)
      .eq("id", input.id)
      .eq("status", AccessRequestStatus.PendingReview)
      .select(ACCESS_REQUEST_COLUMNS)
      .single();

    if (error) {
      throwRepositoryError({
        operation: "access_requests.updateStatus",
        table: "access_requests",
        error,
        payloadKeys: Object.keys(updatePayload),
      });
    }

    return mapAccessRequestRow(data as AccessRequestRow);
  }
}

function toSupabaseErrorLog(error: SupabaseRepositoryError) {
  return {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

function throwRepositoryError(input: {
  operation: string;
  table: string;
  error: SupabaseRepositoryError;
  payloadKeys?: string[];
}): never {
  console.error("[access-control-repository] Supabase operation failed", {
    operation: input.operation,
    table: input.table,
    payloadKeys: input.payloadKeys ?? [],
    errorConstructor:
      input.error instanceof Error ? input.error.constructor.name : null,
    errorName: input.error instanceof Error ? input.error.name : null,
    ...toSupabaseErrorLog(input.error),
    stack: input.error instanceof Error ? input.error.stack : null,
  });

  throw new RepositoryUnexpectedError({
    operation: input.operation,
    table: input.table,
    payloadKeys: input.payloadKeys,
    cause: input.error,
  });
}
