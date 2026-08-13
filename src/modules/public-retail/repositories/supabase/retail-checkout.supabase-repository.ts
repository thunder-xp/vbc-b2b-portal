import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";

import { parsePublicRetailCheckout, parsePublicRetailOrder, parsePublicRetailOrderCreated } from "../../validation";
import type { PublicRetailInstallationStatusDto } from "../../types";
import type { RetailCheckoutRepository } from "../retail-checkout.repository";

export class RetailCheckoutRepositoryError extends Error {
  constructor(readonly code: string | null, readonly detail: string | null = null) {
    super("Retail checkout operation failed.");
    this.name = "RetailCheckoutRepositoryError";
  }
}

export class SupabaseRetailCheckoutRepository implements RetailCheckoutRepository {
  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await createPublicReadClient().rpc(name, args);
    if (error) throw new RetailCheckoutRepositoryError(error.code, error.details);
    return data;
  }

  async getCheckout(tokenHash: string, locale: "ru" | "ro") {
    const data = await this.rpc("get_public_retail_checkout", { p_token_hash: tokenHash, p_locale: locale });
    return data === null ? null : parsePublicRetailCheckout(data);
  }

  async createOrder(tokenHash: string, command: Parameters<RetailCheckoutRepository["createOrder"]>[1]) {
    return parsePublicRetailOrderCreated(await this.rpc("create_public_retail_order", {
      p_token_hash: tokenHash,
      p_locale: command.locale,
      p_checkout_fingerprint: command.checkoutFingerprint,
      p_submission_key: command.submissionKey,
      p_request_fingerprint: command.requestFingerprint,
      p_access_token_hash: command.accessTokenHash,
      p_customer: command.customer,
      p_delivery_address: command.deliveryAddress,
      p_installation_address: command.installationAddress,
    }));
  }

  async getOrder(accessTokenHash: string, locale: "ru" | "ro") {
    const data = await this.rpc("get_public_retail_order", { p_access_token_hash: accessTokenHash, p_locale: locale });
    return data === null ? null : parsePublicRetailOrder(data);
  }
  async getInstallationStatus(accessTokenHash: string, locale: "ru" | "ro") {
    const data = await this.rpc("get_public_retail_installation_status", { p_access_token_hash: accessTokenHash, p_locale: locale });
    if (data === null) return null;
    const value = data as Record<string, unknown>;
    const states = ["selecting_team", "scheduling", "scheduled", "in_progress", "completed_by_provider", "customer_confirmation_pending", "customer_confirmed", "issue_reported", "disputed", "resolved", "cancelled"];
    if (!states.includes(String(value.status)) || typeof value.label !== "string") throw new RetailCheckoutRepositoryError("invalid_response");
    return { status: value.status as PublicRetailInstallationStatusDto["status"], label: value.label, scheduledStartAt: typeof value.scheduledStartAt === "string" ? value.scheduledStartAt : null, scheduledEndAt: typeof value.scheduledEndAt === "string" ? value.scheduledEndAt : null, revision: typeof value.revision === "number" ? value.revision : null, confirmationRequired: value.confirmationRequired === true, issueReportingAllowed: value.issueReportingAllowed === true, providerName: typeof value.providerName === "string" ? value.providerName : null };
  }
  async transitionInstallation(input: Parameters<RetailCheckoutRepository["transitionInstallation"]>[0]) {
    const data = await this.rpc("customer_transition_installation_execution", { p_access_token_hash: input.accessTokenHash, p_command: input.command, p_expected_revision: input.expectedRevision, p_payload: { category: input.category, note: input.note }, p_idempotency_key: input.idempotencyKey });
    const value = data as Record<string, unknown>;
    if (typeof value.state !== "string" || typeof value.revision !== "number" || typeof value.repeated !== "boolean") throw new RetailCheckoutRepositoryError("invalid_response");
    return { state: value.state, revision: value.revision, repeated: value.repeated };
  }
}
