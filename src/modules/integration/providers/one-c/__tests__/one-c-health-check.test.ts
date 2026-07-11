import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPartners: vi.fn(),
  createPartnerLookupService: vi.fn(),
}));

vi.mock("../../../services", () => ({
  createPartnerLookupService: mocks.createPartnerLookupService,
}));

import { runOneCODataHealthCheck } from "../one-c-health-check";
import { categorizeOneCHealthError } from "../one-c-health-check";
import { IntegrationMappingError, IntegrationValidationError } from "../../../errors";
import { OneCODataResponseValidationError } from "../one-c-odata-client";

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";

describe("1C OData health check", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("classifies provider validation and mapping failures without transport", () => {
    expect(categorizeOneCHealthError(new IntegrationValidationError())).toBe("invalid_response");
    expect(categorizeOneCHealthError(new IntegrationMappingError())).toBe("mapping");
  });

  it("reports safe independent checks without returning OData rows or credentials", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ONEC_BASE_URL", "https://erp-api.nsd.md/novotech/odata/standard.odata");
    vi.stubEnv("ONEC_USERNAME", "private-user");
    vi.stubEnv("ONEC_PASSWORD", "private-password");
    vi.stubEnv("ONEC_AUTH_MODE", "basic");
    vi.stubEnv("ONEC_TIMEOUT_MS", "10000");
    vi.stubEnv("ONEC_USE_MOCK_PARTNERS", "false");
    mocks.createPartnerLookupService.mockReturnValue({ searchPartners: mocks.searchPartners });
    mocks.searchPartners.mockResolvedValue({ items: [{ id: "not-exposed" }] });
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      if (url.pathname.endsWith("/$metadata")) return new Response("metadata", { status: 200, headers: { "content-type": "application/xml" } });
      if (url.searchParams.get("$top") === "1") return collection([]);
      return collection([
        { Ref_Key: PARTNER_ID, Code: null, Description: "NOVOTECH SYSTEMS", НаименованиеПолное: null, ИНН: null, Покупатель: null, Поставщик: null, Недействителен: null, DeletionMark: false, IsFolder: false },
        { Ref_Key: null, Description: "not exposed" },
      ]);
    }));

    const report = await runOneCODataHealthCheck(oneCEnv());

    expect(report.configuration).toMatchObject({ baseHost: "erp-api.nsd.md", authMode: "basic", timeoutMs: 10000 });
    expect(report.configuration.checks.every((check) => check.configured)).toBe(true);
    expect(report.metadata).toMatchObject({ passed: true, statusCode: 200, hostname: "erp-api.nsd.md" });
    expect(report.minimalQuery).toMatchObject({ passed: true, jsonParsed: true, valueArray: true, rowCount: 0 });
    expect(report.nameQuery).toMatchObject({ passed: true, rowCount: 2, validMappedRowCount: 1, skippedRowCount: 1 });
    expect(report.nameQuery.validationFailures).toEqual([{ field: "Ref_Key", receivedType: "null" }]);
    expect(JSON.stringify(report)).not.toContain("private-user");
    expect(JSON.stringify(report)).not.toContain("private-password");
    expect(JSON.stringify(report)).not.toContain("NOVOTECH SYSTEMS");
    expect(JSON.stringify(report)).not.toContain("not-exposed");
  });

  it("categorizes independent transport failures without leaking the base path", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ONEC_AUTH_MODE", "basic");
    vi.stubEnv("ONEC_TIMEOUT_MS", "10000");
    vi.stubEnv("ONEC_USE_MOCK_PARTNERS", "false");
    mocks.createPartnerLookupService.mockReturnValue({ searchPartners: mocks.searchPartners });
    mocks.searchPartners.mockRejectedValue(new Error("internal host failure"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket failure")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const report = await runOneCODataHealthCheck({ ...oneCEnv(), baseUrl: "https://internal.example.invalid/odata" });

    expect(report.metadata.errorCategory).toBe("transport");
    expect(report.minimalQuery.errorCategory).toBe("transport");
    expect(report.nameQuery.errorCategory).toBe("transport");
    expect(report.provider).toMatchObject({ passed: false, errorCategory: "unknown", resultCount: 0 });
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "one_c_health_check_failed", stage: "metadata" }));
    expect(JSON.stringify(report)).not.toContain("internal.example.invalid/odata");
  });

  it("reports a provider response failure with its request stage and safe parse diagnostics", async () => {
    mocks.createPartnerLookupService.mockReturnValue({ searchPartners: mocks.searchPartners });
    mocks.searchPartners.mockRejectedValue(new OneCODataResponseValidationError({
      failedStage: "odata_response",
      receivedContentType: "application/json;charset=utf-8",
      requestKind: "partner_code_query",
      resourceName: "Catalog_Контрагенты",
      queryParameterNames: ["$select", "$filter", "$top", "$format"],
      statusCode: 200,
      jsonParseFailure: true,
      parseErrorName: "SyntaxError",
      bodyLength: 24,
      bomDetected: false,
      emptyBody: false,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(collection([])));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const report = await runOneCODataHealthCheck(oneCEnv());

    expect(report.provider).toMatchObject({
      passed: false,
      failedStage: "odata_response",
      receivedContentType: "application/json;charset=utf-8",
      requestKind: "partner_code_query",
      resourceName: "Catalog_Контрагенты",
      statusCode: 200,
      jsonParseFailure: true,
      parseErrorName: "SyntaxError",
      bodyLength: 24,
      bomDetected: false,
      emptyBody: false,
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_health_check_failed",
      stage: "provider",
    }));
  });
});

function collection(value: unknown[]): Response {
  return new Response(JSON.stringify({ "odata.metadata": "metadata", value }), { status: 200, headers: { "content-type": "application/json" } });
}

function oneCEnv() {
  return {
    baseUrl: "https://erp-api.nsd.md/novotech/odata/standard.odata",
    username: "private-user",
    password: "private-password",
    catalogCategoriesPath: "/catalog/categories",
    catalogBrandsPath: "/catalog/brands",
    catalogProductsPath: "/catalog/products",
    productPricesPath: "/pricing/product-prices",
    stockBalancesPath: "/inventory/stock-balances",
    partnerSearchPageSize: 50,
    partnerSearchMaxPages: 10,
    requestTimeoutMs: 10000,
    authMode: "basic" as const,
    useMockCatalog: false,
    useMockPricing: false,
    useMockInventory: false,
    useMockPartners: false,
  };
}
