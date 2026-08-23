import "server-only";

import { z } from "zod";

import type { LocalizationContent, TranslationJob } from "./types";

export type LocalizationTranslationRequest = TranslationJob & {
  sourceLocale: "ru";
  terminology: Readonly<Record<string, string>>;
};

export type LocalizationTranslationResult = {
  content: LocalizationContent;
  providerMetadata: { provider: string; model: string | null };
};

export interface LocalizationTranslationProvider {
  translate(request: LocalizationTranslationRequest): Promise<LocalizationTranslationResult>;
}

const providerResponse = z.object({
  content: z.object({
    localizedName: z.string().trim().min(1).max(500).nullable(),
    shortDescription: z.string().trim().max(2000).nullable().optional(),
    description: z.string().trim().max(50_000).nullable().optional(),
    intro: z.string().trim().max(10_000).nullable().optional(),
    seoTitle: z.string().trim().min(1).max(200).nullable(),
    seoDescription: z.string().trim().min(1).max(500).nullable(),
  }).strict(),
  model: z.string().trim().min(1).max(120).nullable().optional(),
}).strict();

export class HttpLocalizationTranslationProvider implements LocalizationTranslationProvider {
  constructor(
    private readonly endpoint: string,
    private readonly secret: string,
    private readonly timeoutMs = 12_000,
  ) {}

  async translate(request: LocalizationTranslationRequest): Promise<LocalizationTranslationResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contract: "novotech-localization-v1",
        entityType: request.entityType,
        sourceLocale: request.sourceLocale,
        targetLocale: request.locale,
        sourceHash: request.sourceHash,
        source: request.source,
        terminology: request.terminology,
        rules: {
          preserveSkuAndModels: true,
          preserveTechnicalValuesAndUnits: true,
          prohibitInventedSpecifications: true,
          prohibitCommercialClaims: true,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new LocalizationProviderError(`HTTP_${response.status}`);
    const parsed = providerResponse.safeParse(await response.json());
    if (!parsed.success) throw new LocalizationProviderError("INVALID_RESPONSE");
    return {
      content: preserveProductIdentity(request, parsed.data.content),
      providerMetadata: { provider: "configured_http", model: parsed.data.model ?? null },
    };
  }
}

export class LocalizationProviderError extends Error {
  constructor(readonly safeCode: string) {
    super("Localization translation provider failed.");
    this.name = "LocalizationProviderError";
  }
}

export function createConfiguredTranslationProvider(): LocalizationTranslationProvider | null {
  const endpoint = process.env.LOCALIZATION_TRANSLATION_PROVIDER_URL?.trim();
  const secret = process.env.LOCALIZATION_TRANSLATION_PROVIDER_KEY?.trim();
  return endpoint && secret ? new HttpLocalizationTranslationProvider(endpoint, secret) : null;
}

function preserveProductIdentity(
  request: LocalizationTranslationRequest,
  content: LocalizationContent,
): LocalizationContent {
  if (request.entityType !== "product" || !content.localizedName) return content;
  const sourceName = typeof request.source.name === "string" ? request.source.name : "";
  const protectedTokens = sourceName.match(/\b(?=[A-ZА-Я0-9._/-]*\d)[A-ZА-Я0-9][A-ZА-Я0-9._/-]{2,}\b/gu) ?? [];
  return protectedTokens.every((token) => content.localizedName?.includes(token))
    ? content
    : { ...content, localizedName: sourceName || content.localizedName };
}
