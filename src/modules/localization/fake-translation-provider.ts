import type {
  LocalizationTranslationProvider,
  LocalizationTranslationRequest,
  LocalizationTranslationResult,
} from "./translation-provider";

export class FakeLocalizationTranslationProvider implements LocalizationTranslationProvider {
  constructor(private readonly translateName: (source: string) => string = (source) => `RO: ${source}`) {}

  async translate(request: LocalizationTranslationRequest): Promise<LocalizationTranslationResult> {
    const sourceName = String(request.source.name ?? "");
    const description = String(request.source.description ?? "").trim() || null;
    return {
      content: request.entityType === "product"
        ? {
            localizedName: this.translateName(sourceName),
            shortDescription: description,
            description,
            seoTitle: `${this.translateName(sourceName)} | Novotech`,
            seoDescription: description,
          }
        : {
            localizedName: this.translateName(sourceName),
            intro: description,
            seoTitle: `${this.translateName(sourceName)} | Novotech`,
            seoDescription: description,
          },
      providerMetadata: { provider: "deterministic_fake", model: "test-v1" },
    };
  }
}
