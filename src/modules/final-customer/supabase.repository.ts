import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { FinalCustomerRepository } from "./repository";
import type { FinalCustomerAccount, FinalCustomerOrderSummary } from "./types";

const ACCOUNT_COLUMNS = "id,auth_user_id,customer_identity_id,status,identity_resolution_status,display_name,email,created_at,last_login_at";

export class SupabaseFinalCustomerRepository implements FinalCustomerRepository {
  async findAccountByAuthUser(authUserId: string) {
    const { data, error } = await createAdminClient()
      .from("customer_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw repositoryError("read account", error.code);
    return data ? mapAccount(data) : null;
  }

  async createAccount(input: Parameters<FinalCustomerRepository["createAccount"]>[0]) {
    const admin = createAdminClient();
    const reviewRequired = input.resolutionStatus === "AMBIGUOUS" || input.resolutionStatus === "CONFLICT";
    const { data, error } = await admin
      .from("customer_accounts")
      .insert({
        auth_user_id: input.authUserId,
        customer_identity_id: input.customerIdentityId,
        status: reviewRequired ? "IDENTITY_REVIEW_REQUIRED" : "ACTIVE",
        identity_resolution_status: input.resolutionStatus,
      })
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") {
        const existing = await this.findAccountByAuthUser(input.authUserId);
        if (existing) return existing;
      }
      throw repositoryError("create account", error.code);
    }

    const events = [{
      customer_account_id: data.id,
      event_type: "CUSTOMER_ACCOUNT_CREATED",
      safe_metadata: { resolutionStatus: input.resolutionStatus },
    }];
    events.push({
      customer_account_id: data.id,
      event_type: reviewRequired ? "IDENTITY_REVIEW_REQUIRED" : "CUSTOMER_IDENTITY_LINKED",
      safe_metadata: { resolutionStatus: input.resolutionStatus },
    });
    const { error: eventError } = await admin.from("customer_account_events").insert(events);
    if (eventError) throw repositoryError("record account event", eventError.code);

    if (data.customer_identity_id) {
      const { error: identityEventError } = await admin.from("customer_identity_events").insert({
        customer_identity_id: data.customer_identity_id,
        event_type: "CONTEXT_LINKED",
        source_context: "FINAL_CUSTOMER_ACCOUNT",
        source_record_id: data.id,
        safe_metadata: { resolutionStatus: input.resolutionStatus },
      });
      if (identityEventError) throw repositoryError("record identity link", identityEventError.code);
    }
    return mapAccount(data);
  }

  async findDisplayName(customerIdentityId: string | null) {
    if (!customerIdentityId) return null;
    const { data, error } = await createAdminClient()
      .from("retail_customers")
      .select("name")
      .eq("customer_identity_id", customerIdentityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw repositoryError("read display name", error.code);
    return data?.name?.trim() || null;
  }

  async listOrders(customerIdentityId: string | null, limit: number) {
    if (!customerIdentityId) return [];
    const admin = createAdminClient();
    const { data: customers, error: customerError } = await admin
      .from("retail_customers")
      .select("id")
      .eq("customer_identity_id", customerIdentityId)
      .limit(100);
    if (customerError) throw repositoryError("resolve retail contexts", customerError.code);
    const customerIds = (customers ?? []).map((row) => row.id);
    if (customerIds.length === 0) return [];

    const { data, error } = await admin
      .from("retail_orders")
      .select("id,public_number,status,created_at,priced_scope_total,currency")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) throw repositoryError("read retail orders", error.code);
    return (data ?? []).map((row): FinalCustomerOrderSummary => ({
      id: row.id,
      number: row.public_number,
      status: row.status,
      createdAt: row.created_at,
      total: Number(row.priced_scope_total),
      currency: row.currency,
    }));
  }

  async updateProfile(accountId: string, displayName: string | null, email: string | null) {
    const admin = createAdminClient();
    const { error } = await admin.from("customer_accounts").update({
      display_name: displayName,
      email,
    }).eq("id", accountId);
    if (error) throw repositoryError("update profile", error.code);
    const { error: eventError } = await admin.from("customer_account_events").insert({
      customer_account_id: accountId,
      event_type: "PROFILE_UPDATED",
      safe_metadata: {
        displayNamePresent: Boolean(displayName),
        emailPresent: Boolean(email),
      },
    });
    if (eventError) throw repositoryError("record profile event", eventError.code);
  }
}

type Row = Record<string, unknown>;

function mapAccount(row: Row): FinalCustomerAccount {
  return {
    id: String(row.id),
    authUserId: String(row.auth_user_id),
    customerIdentityId: row.customer_identity_id ? String(row.customer_identity_id) : null,
    status: row.status as FinalCustomerAccount["status"],
    identityResolutionStatus: row.identity_resolution_status as FinalCustomerAccount["identityResolutionStatus"],
    displayName: row.display_name ? String(row.display_name) : null,
    email: row.email ? String(row.email) : null,
    createdAt: String(row.created_at),
    lastLoginAt: String(row.last_login_at),
  };
}

function repositoryError(operation: string, code?: string) {
  return new Error(`Final Customer repository ${operation} failed: ${code ?? "UNKNOWN"}`);
}
