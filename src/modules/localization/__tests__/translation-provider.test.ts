import { describe, expect, it, vi } from "vitest";

import { HttpLocalizationTranslationProvider } from "../translation-provider";

describe("HttpLocalizationTranslationProvider", () => {
  it("preserves model identity when a provider mutates the product name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: { localizedName: "Cameră profesională", description: null, seoTitle: "Cameră", seoDescription: "Descriere" }, model: "provider-v1",
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const provider = new HttpLocalizationTranslationProvider("https://translation.example.test", "secret");
    const result = await provider.translate({
      id: "10000000-0000-4000-8000-000000000001", entityType: "product",
      entityId: "10000000-0000-4000-8000-000000000002", locale: "ro", sourceLocale: "ru",
      sourceHash: "a".repeat(64), source: { name: "Камера DHI-IPC-HFW2441T-ZS 4MP", sku: "400540" }, terminology: {},
    });
    expect(result.content.localizedName).toBe("Камера DHI-IPC-HFW2441T-ZS 4MP");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends no commercial fields outside the governed source payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: { localizedName: "Camere", intro: "Text", seoTitle: "Camere", seoDescription: "Text" }, model: null,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await new HttpLocalizationTranslationProvider("https://translation.example.test", "secret").translate({
      id: "10000000-0000-4000-8000-000000000001", entityType: "category",
      entityId: "10000000-0000-4000-8000-000000000002", locale: "ro", sourceLocale: "ru",
      sourceHash: "a".repeat(64), source: { name: "Камеры" }, terminology: {},
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("stock");
    expect(body.rules).toMatchObject({ preserveSkuAndModels: true, prohibitInventedSpecifications: true });
  });
});
