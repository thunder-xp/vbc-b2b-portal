import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import type { InternalWarrantyLookup, PartnerWarrantyLookup, WarrantySerialDiagnostics } from "./types";

export type WarrantySyncClaim = {
  runId: string;
  lockToken: string;
  mode: string;
  stage: "sale_scan" | "return_scan" | "state_rebuild";
  skip: number;
  pageSize: number;
  rangeStart: string;
  rangeEnd: string;
};

export class WarrantySerialRepositoryError extends Error {
  constructor(readonly operation: string, readonly code: string | null = null) {
    super("Warranty serial data is temporarily unavailable.");
    this.name = "WarrantySerialRepositoryError";
  }
}

export class WarrantySerialRepository {
  async claim(pageSize = 25): Promise<WarrantySyncClaim | null> {
    return this.adminRpc<WarrantySyncClaim | null>("claim_warranty_serial_sync_run", { p_page_size: pageSize });
  }

  async publish(input: {
    runId: string;
    lockToken: string;
    stage: string;
    skip: number;
    headersReceived: number;
    documents: unknown[];
    events: unknown[];
    pageComplete: boolean;
  }) {
    return this.adminRpc<Record<string, unknown>>("publish_warranty_serial_sync_step", {
      p_run_id: input.runId,
      p_lock_token: input.lockToken,
      p_stage: input.stage,
      p_skip: input.skip,
      p_headers_received: input.headersReceived,
      p_documents: input.documents,
      p_events: input.events,
      p_page_complete: input.pageComplete,
    });
  }

  async complete(claim: WarrantySyncClaim): Promise<{ status: "running" | "succeeded"; statesRebuilt: number; totalStatesRebuilt: number }> {
    return this.adminRpc<{ status: "running" | "succeeded"; statesRebuilt: number; totalStatesRebuilt: number }>("complete_warranty_serial_sync_run", {
      p_run_id: claim.runId,
      p_lock_token: claim.lockToken,
    });
  }

  async fail(claim: WarrantySyncClaim, safeErrorCode: string) {
    await this.adminRpc<null>("fail_warranty_serial_sync_run", {
      p_run_id: claim.runId,
      p_lock_token: claim.lockToken,
      p_error_code: safeErrorCode,
    });
  }

  async lookupPartner(companyId: string, serialHash: string, correlationId: string) {
    return this.userRpc<PartnerWarrantyLookup>("lookup_partner_warranty_serial", {
      p_company_id: companyId,
      p_serial_hash: serialHash,
      p_correlation_id: correlationId,
    });
  }

  async getPartnerVerification(companyId: string, verificationId: string) {
    return this.userRpc<PartnerWarrantyLookup | null>("get_partner_warranty_verification", {
      p_company_id: companyId,
      p_verification_id: verificationId,
    });
  }

  async lookupInternal(serialHash: string, correlationId: string) {
    return this.userRpc<InternalWarrantyLookup>("lookup_internal_warranty_serial", {
      p_serial_hash: serialHash,
      p_correlation_id: correlationId,
    });
  }

  async diagnostics() {
    return this.userRpc<WarrantySerialDiagnostics>("get_warranty_serial_diagnostics", {});
  }

  private async adminRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error) throw new WarrantySerialRepositoryError(name, error.code);
    return data as T;
  }

  private async userRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error) throw new WarrantySerialRepositoryError(name, error.code);
    return data as T;
  }
}
