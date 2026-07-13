import { IntegrationValidationError } from "../errors";
import {
  ONE_C_BCRU_CODE,
  ONE_C_BCRU_MARKUP_PERCENT,
  ONE_C_BCRU_REF,
  ONE_C_USD_REF,
  type ExchangeRateProvider,
  type OneCExchangeRateDocumentSource,
} from "../providers/one-c";

export type PublishedExchangeRate = {
  id: string;
  sourceCode: "113";
  sourceRef: string;
  sourceDocumentType: OneCExchangeRateDocumentSource;
  sourceDocumentDate: string;
  usdMdlRate: number;
  bcruMdlPerUsdRate: number;
  markupPercent: number;
  publishedAt: string;
};

export interface ExchangeRatePublisher {
  publish(input: Omit<PublishedExchangeRate, "id" | "publishedAt">): Promise<PublishedExchangeRate>;
}

export class ExchangeRateSyncService {
  constructor(private readonly provider: ExchangeRateProvider, private readonly publisher: ExchangeRatePublisher) {}

  async sync(): Promise<PublishedExchangeRate> {
    const candidate = await this.provider.fetchLatestUsdRate();
    if (!candidate) throw new IntegrationValidationError("No valid current USD document rate was found in 1C.");
    const bcruMdlPerUsdRate = candidate.mdlPerUsdRate * (1 + ONE_C_BCRU_MARKUP_PERCENT / 100);
    if (!Number.isFinite(bcruMdlPerUsdRate) || bcruMdlPerUsdRate <= 0) throw new IntegrationValidationError("Calculated BCRU rate is invalid.");
    return this.publisher.publish({
      sourceCode: ONE_C_BCRU_CODE,
      sourceRef: ONE_C_BCRU_REF,
      sourceDocumentType: candidate.source,
      sourceDocumentDate: candidate.documentDate,
      usdMdlRate: candidate.mdlPerUsdRate,
      bcruMdlPerUsdRate,
      markupPercent: ONE_C_BCRU_MARKUP_PERCENT,
    });
  }
}
