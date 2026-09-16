import "server-only";

import { createMaibCheckoutV2Adapter, maibConfigurationSummary } from "./providers/maib/maib-checkout-v2.adapter";
import { SupabaseRetailPaymentRepository } from "./repositories/supabase/retail-payment.supabase-repository";
import { RetailPaymentService } from "./services/retail-payment.service";

export function createRetailPaymentService() {
  return new RetailPaymentService(new SupabaseRetailPaymentRepository(), createMaibCheckoutV2Adapter());
}

export async function getRetailPaymentReturnState(paymentAttemptId: string) {
  return new SupabaseRetailPaymentRepository().getReturnState(paymentAttemptId);
}

export { maibConfigurationSummary };
