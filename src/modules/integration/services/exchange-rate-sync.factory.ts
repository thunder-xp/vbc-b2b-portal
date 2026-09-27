import type { OneCCommercialRatesEnv } from "../../../lib/env";
import { OneCExchangeRateProvider } from "../providers/one-c";
import { ExchangeRateSyncService, SupabaseExchangeRatePublisher } from "../sync";

export function createExchangeRateSyncService(oneCEnv: OneCCommercialRatesEnv): ExchangeRateSyncService {
  return new ExchangeRateSyncService(new OneCExchangeRateProvider(oneCEnv), new SupabaseExchangeRatePublisher());
}
