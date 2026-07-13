import { createAdminClient } from "@/src/lib/supabase/admin";

import { ONE_C_USD_REF, type OneCExchangeRateDocumentSource } from "../providers/one-c";
import type { ExchangeRatePublisher, PublishedExchangeRate } from "./exchange-rate-sync";

export class SupabaseExchangeRatePublisher implements ExchangeRatePublisher {
  async publish(input: Omit<PublishedExchangeRate, "id" | "publishedAt">): Promise<PublishedExchangeRate> {
    const { data, error } = await createAdminClient().rpc("publish_commercial_exchange_rate", {
      p_source_code: input.sourceCode,
      p_source_ref: input.sourceRef,
      p_base_currency_ref: ONE_C_USD_REF,
      p_source_document_type: input.sourceDocumentType,
      p_source_document_date: input.sourceDocumentDate,
      p_source_mdl_per_usd_rate: input.usdMdlRate,
      p_markup_percent: input.markupPercent,
      p_bcru_mdl_per_usd_rate: input.bcruMdlPerUsdRate,
    });
    if (error || !isPublishedRow(data)) throw new Error("Exchange-rate publication failed.");
    return {
      id: data.id,
      sourceCode: "113",
      sourceRef: data.source_ref,
      sourceDocumentType: data.source_document_type as OneCExchangeRateDocumentSource,
      sourceDocumentDate: data.source_document_date,
      usdMdlRate: Number(data.source_mdl_per_usd_rate),
      bcruMdlPerUsdRate: Number(data.rate),
      markupPercent: Number(data.markup_percent),
      publishedAt: data.published_at,
    };
  }
}

type PublishedRow = {
  id: string;
  source_ref: string;
  source_document_type: string;
  source_document_date: string;
  source_mdl_per_usd_rate: number | string;
  rate: number | string;
  markup_percent: number | string;
  published_at: string;
};

function isPublishedRow(value: unknown): value is PublishedRow {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}
