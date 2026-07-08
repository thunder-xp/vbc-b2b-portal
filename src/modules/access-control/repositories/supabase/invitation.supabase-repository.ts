import { createClient } from "@/src/lib/supabase/server";

import type {
  CreateInvitationInput,
  InvitationRepository,
  UpdateInvitationStatusInput,
} from "../invitation.repository";
import { InvitationStatus, type Invitation } from "../../types";
import {
  mapInvitationRow,
  type InvitationRow,
} from "./mappers";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../index";

const INVITATION_COLUMNS =
  "id, company_id, email, role_id, invited_by, accepted_by, status, expires_at, accepted_at, created_at, updated_at";

export class SupabaseInvitationRepository implements InvitationRepository {
  async findPendingByEmail(email: string): Promise<Invitation | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invitations")
      .select(INVITATION_COLUMNS)
      .eq("email", email)
      .eq("status", InvitationStatus.Pending)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapInvitationRow(data as InvitationRow) : null;
  }

  async findById(id: string): Promise<Invitation | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invitations")
      .select(INVITATION_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapInvitationRow(data as InvitationRow) : null;
  }

  async create(input: CreateInvitationInput): Promise<Invitation> {
    void input;
    throw new RepositoryOperationNotAvailableError("invitations.create");
  }

  async updateStatus(input: UpdateInvitationStatusInput): Promise<Invitation> {
    void input;
    throw new RepositoryOperationNotAvailableError("invitations.updateStatus");
  }
}
