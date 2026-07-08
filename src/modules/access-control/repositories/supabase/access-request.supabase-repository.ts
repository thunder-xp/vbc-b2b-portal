import { createClient } from "@/src/lib/supabase/server";

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
  "id, user_id, company_id, requested_external_1c_id, requested_company_name, message, status, reviewed_by, reviewed_at, created_at, updated_at";

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
      throw new RepositoryUnexpectedError();
    }

    return data ? mapAccessRequestRow(data as AccessRequestRow) : null;
  }

  async findByUserId(userId: string): Promise<AccessRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("access_requests")
      .select(ACCESS_REQUEST_COLUMNS)
      .eq("user_id", userId);

    if (error) {
      throw new RepositoryUnexpectedError();
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
      .eq("user_id", input.userId)
      .eq("status", AccessRequestStatus.Pending);

    if (input.companyId) {
      query = query.eq("company_id", input.companyId);
    }

    if (input.requestedExternal1cId) {
      query = query.eq("requested_external_1c_id", input.requestedExternal1cId);
    }

    if (input.requestedCompanyName) {
      query = query.eq("requested_company_name", input.requestedCompanyName);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapAccessRequestRow(data as AccessRequestRow) : null;
  }

  async create(input: CreateAccessRequestInput): Promise<AccessRequest> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("access_requests")
      .insert({
        user_id: input.userId,
        company_id: input.companyId ?? null,
        requested_external_1c_id: input.requestedExternal1cId ?? null,
        requested_company_name: input.requestedCompanyName ?? null,
        message: input.message ?? null,
      })
      .select(ACCESS_REQUEST_COLUMNS)
      .single();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return mapAccessRequestRow(data as AccessRequestRow);
  }

  async updateStatus(
    input: UpdateAccessRequestStatusInput,
  ): Promise<AccessRequest> {
    if (input.status !== AccessRequestStatus.Cancelled) {
      throw new RepositoryOperationNotAvailableError(
        "access_requests.updateStatus",
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("access_requests")
      .update({
        status: input.status,
      })
      .eq("id", input.id)
      .eq("status", AccessRequestStatus.Pending)
      .select(ACCESS_REQUEST_COLUMNS)
      .single();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return mapAccessRequestRow(data as AccessRequestRow);
  }
}
