import "server-only";

import { createMaibCheckoutV2Adapter, maibConfigurationSummary } from "./providers/maib/maib-checkout-v2.adapter";
import { SupabaseRetailPaymentRepository } from "./repositories/supabase/retail-payment.supabase-repository";
import { RetailPaymentService } from "./services/retail-payment.service";

export function createRetailPaymentService() {
  return new RetailPaymentService(new SupabaseRetailPaymentRepository(), createMaibCheckoutV2Adapter());
}

export async function getRetailPaymentReturnState(paymentAttemptId: string, returnAccessToken: string) {
  return createRetailPaymentService().getReturnState(paymentAttemptId, returnAccessToken);
}

export async function getRetailOrderPaymentStates(retailOrderIds: string[]) {
  return new SupabaseRetailPaymentRepository().listOrderPaymentStates(retailOrderIds);
}

export async function getRecentRetailPaymentStates(limit = 50) {
  return new SupabaseRetailPaymentRepository().listRecentPaymentStates(limit);
}

export async function getRetailOrderPaymentStateByNumber(orderNumber: string) {
  return createRetailPaymentService().getOrderPaymentStateByNumber(orderNumber);
}

export async function verifyMaibConnectivity() {
  return createMaibCheckoutV2Adapter().verifyConnectivity();
}

export { maibConfigurationSummary };
