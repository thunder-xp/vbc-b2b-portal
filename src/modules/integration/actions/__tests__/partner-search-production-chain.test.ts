import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/env", () => ({ getOneCEnv: vi.fn() }));
vi.mock("../../../access-control/actions/service-factory", () => ({
  createUserProfileService: vi.fn(),
  getAuthenticatedUserId: vi.fn(),
}));
vi.mock("../../services", () => ({ createPartnerLookupService: vi.fn() }));

import { mapPartnerSearchResultToActionDto } from "../partner-search-result.mapper";
import { OneCProvider } from "../../providers/one-c";
import { DefaultPartnerLookupService } from "../../services/partner-lookup.service";
import {
  PartnerPipelineValidationError,
  validatePartnerSearchPage,
} from "../../services/partner-search-validation";

const PARTNER_ONE = "18e36ea4-f68f-11f0-4393-7239d3b7bd5c";
const PARTNER_TWO = "2ce36ea4-f68f-11f0-4393-7239d3b7bd5c";

describe("partner search production call chain", () => {
  it("maps two real OData rows through provider, service, and action result mapper", async () => {
    const responses = [collection([
      partnerRow(PARTNER_ONE),
      partnerRow(PARTNER_TWO),
    ])];
    const fetchMock = vi.fn().mockImplementation(async () => responses.shift() ?? collection([]));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OneCProvider({
      baseUrl: "https://erp-api.nsd.md/novotech/odata/standard.odata",
      username: "odata-user",
      password: "odata-password",
      requestTimeoutMs: 10000,
      partnerSearchPageSize: 50,
      partnerSearchMaxPages: 10,
      useMockPartners: false,
    });
    const service = new DefaultPartnerLookupService(provider.partners);

    const page = await service.searchPartners({ query: "NOVOTECH", limit: 20 });
    const actionData = page.items.map(mapPartnerSearchResultToActionDto);

    expect(page).toMatchObject({ nextCursor: null });
    expect(page.items).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[0] as URL).searchParams.get("$filter")).toBe("substringof('NOVOTECH',Description) eq true");
    for (const [url, init] of fetchMock.mock.calls as [URL, RequestInit][]) {
      expect(url.searchParams.getAll("$format")).toEqual(["json"]);
      expect(new Headers(init.headers).get("Accept")).toBe("application/json");
    }
    expect(actionData).toEqual([
      expect.objectContaining({ displayName: "NOVOTECH SYSTEMS", external1cId: PARTNER_ONE }),
      expect.objectContaining({ displayName: "NOVOTECH SYSTEMS 2", external1cId: PARTNER_TWO }),
    ]);
  });

  it("rejects the old REST partners wrapper with safe issue paths", () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => validatePartnerSearchPage({ partners: [] }, "provider_output")).toThrow(PartnerPipelineValidationError);
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_partner_pipeline_validation_failed",
      stage: "provider_output",
      issuePaths: expect.arrayContaining(["items"]),
    }));
  });
});

function collection(value: unknown[]): Response {
  return new Response(JSON.stringify({ "odata.metadata": "metadata", value }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function partnerRow(reference: string) {
  return {
    Ref_Key: reference,
    Code: "000152",
    Description: reference === PARTNER_ONE ? "NOVOTECH SYSTEMS" : "NOVOTECH SYSTEMS 2",
    НаименованиеПолное: null,
    ИНН: null,
    Покупатель: true,
    Поставщик: false,
    Недействителен: false,
    DeletionMark: false,
    IsFolder: false,
  };
}
