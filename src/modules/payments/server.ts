import "server-only";

import { createMaibCheckoutV2Adapter, maibConfigurationSummary } from "./providers/maib/maib-checkout-v2.adapter";
import { SupabaseRetailPaymentRepository } from "./repositories/supabase/retail-payment.supabase-repository";
import { RetailPaymentService } from "./services/retail-payment.service";

export function createRetailPaymentService() {
  return new RetailPaymentService(new SupabaseRetailPaymentRepository(), createMaibCheckoutV2Adapter());
}

export function createMaibReviewPaymentService(environment: Readonly<Record<string, string | undefined>> = process.env) {
  return new RetailPaymentService(
    new SupabaseRetailPaymentRepository(),
    createMaibCheckoutV2Adapter(maibReviewProviderEnvironment(environment)),
  );
}

export function maibReviewConfigurationSummary(environment: Readonly<Record<string, string | undefined>> = process.env) {
  return maibConfigurationSummary(maibReviewProviderEnvironment(environment));
}

export function maibReviewProviderEnvironment(environment: Readonly<Record<string, string | undefined>> = process.env) {
  return {
    MAIB_PAYMENT_MODE: environment.MAIB_REVIEW_PAYMENT_MODE,
    MAIB_CLIENT_ID: environment.MAIB_REVIEW_CLIENT_ID,
    MAIB_CLIENT_SECRET: environment.MAIB_REVIEW_CLIENT_SECRET,
    MAIB_SIGNATURE_KEY: environment.MAIB_REVIEW_SIGNATURE_KEY,
    MAIB_API_BASE_URL: environment.MAIB_REVIEW_API_BASE_URL,
    MAIB_CALLBACK_MAX_SKEW_SECONDS: environment.MAIB_CALLBACK_MAX_SKEW_SECONDS,
    PUBLIC_APP_URL: environment.PUBLIC_APP_URL,
  };
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
