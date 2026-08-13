import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";

import { parsePublicRetailCheckout, parsePublicRetailOrder, parsePublicRetailOrderCreated } from "../../validation";
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
}
