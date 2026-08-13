import "server-only";
import { createPublicReadClient } from "@/src/lib/supabase/public";
import { parsePublicRetailCart, parsePublicRetailCartMutation, parsePublicRetailCartSummary } from "../../validation";
import type { RetailCartRepository } from "../retail-cart.repository";

export class RetailCartRepositoryError extends Error { constructor(readonly code: string | null = null) { super("Retail cart operation failed."); this.name = "RetailCartRepositoryError"; } }
export class SupabaseRetailCartRepository implements RetailCartRepository {
  private async rpc(name: string, args: Record<string, unknown>) { const { data, error } = await createPublicReadClient().rpc(name, args); if (error) throw new RetailCartRepositoryError(error.code); return data; }
  async getCart(tokenHash: string, locale: "ru" | "ro") { const data = await this.rpc("get_public_retail_cart", { p_token_hash: tokenHash, p_locale: locale }); return data === null ? null : parsePublicRetailCart(data); }
  async getSummary(tokenHash: string) { return parsePublicRetailCartSummary(await this.rpc("get_public_retail_cart_summary", { p_token_hash: tokenHash })); }
  async addProduct(tokenHash: string, command: Parameters<RetailCartRepository["addProduct"]>[1]) { return parsePublicRetailCartMutation(await this.rpc("add_public_retail_cart_product", { p_token_hash: tokenHash, p_public_product_id: command.publicProductId, p_quantity: command.quantity, p_source: command.source, p_request_id: command.requestId, p_fingerprint: command.fingerprint })); }
  async addBundle(tokenHash: string, command: Parameters<RetailCartRepository["addBundle"]>[1]) { return parsePublicRetailCartMutation(await this.rpc("add_public_retail_cart_cctv_bundle_v2", { p_token_hash: tokenHash, p_items: command.items.map((item) => ({ public_product_id: item.publicProductId, quantity: item.quantity, commercial_group: item.commercialGroup, unit_code: item.unitCode })), p_installation_intent: command.installationIntent, p_calculator_input: command.calculatorInput, p_work_scope: command.workScope, p_request_id: command.requestId, p_fingerprint: command.fingerprint })); }
  async updateQuantity(tokenHash: string, input: Parameters<RetailCartRepository["updateQuantity"]>[1]) { return parsePublicRetailCartMutation(await this.rpc("update_public_retail_cart_quantity", { p_token_hash: tokenHash, p_public_product_id: input.publicProductId, p_bundle_id: input.bundleId, p_quantity: input.quantity, p_expected_revision: input.expectedRevision })); }
  async removeItem(tokenHash: string, input: Parameters<RetailCartRepository["removeItem"]>[1]) { return parsePublicRetailCartMutation(await this.rpc("remove_public_retail_cart_item", { p_token_hash: tokenHash, p_public_product_id: input.publicProductId, p_bundle_id: input.bundleId, p_expected_revision: input.expectedRevision })); }
}
