import { describe, expect, it, vi } from "vitest";

import { OneCODataProviderError } from "../one-c-odata-client";
import {
  getProductNewSourceRequestDiagnostic,
  OneCProductNewProvider,
} from "../one-c-product-new-provider";

const DHI = "4b7d580e-02a3-11ed-6a9e-7239d3b7bd5c";
const CREATION_REF = "cb442472-ac8c-11f1-639c-bc2411369b92";
const receipts = [
  ["11111111-1111-4111-8111-111111111111", "2022-11-14T09:00:00"],
  ["22222222-2222-4222-8222-222222222222", "2023-07-28T10:00:00"],
  ["33333333-3333-4333-8333-333333333333", "2023-12-15T10:00:00"],
  ["44444444-4444-4444-8444-444444444444", "2025-03-06T10:00:00"],
  ["55555555-5555-4555-8555-555555555555", "2025-06-06T10:00:00"],
  ["66666666-6666-4666-8666-666666666666", "2026-06-26T10:00:00"],
] as const;

describe("OneCProductNewProvider", () => {
  it("paginates every source and keeps the earliest eligible import as DHI market entry", async () => {
    const get = vi.fn(async (resource: string, params: Record<string, string>) => {
      if (resource.startsWith("Catalog_")) {
        return { value: params.$skip === "0"
          ? Array.from({ length: 500 }, (_, index) => creation(index + 1))
          : params.$skip === "500" ? [creation(501)] : [] };
      }
      if (resource === "Document_ПриходнаяНакладная") {
        return { value: receipts.map(([Ref_Key, Date]) => ({
          Ref_Key, Date, Posted: true, DeletionMark: false,
          PS_ЭтоИмпортТМЦ: true, ВидОперации: "ПоступлениеОтПоставщика",
        })) };
      }
      return { value: receipts.map(([Ref_Key], index) => ({
        Ref_Key, LineNumber: index + 1, Номенклатура_Key: DHI, Количество: 1,
      })) };
    });
    const snapshot = await new OneCProductNewProvider({ get }).fetchSnapshot(
      [DHI], new Date("2026-09-10T08:00:00Z"),
    );

    expect(snapshot.facts).toEqual([expect.objectContaining({
      productExternalId: DHI,
      sourceCreatedAt: "2022-07-13T00:00:00",
      marketEntryAt: "2022-11-14T09:00:00",
      marketEntryReceiptRef: receipts[0][0],
      eligibleReceiptCount: 6,
      sourceStatus: "ready",
    })]);
    expect(snapshot).toMatchObject({
      totalCreationRequisiteRows: 501,
      totalEligibleReceipts: 6,
      totalEligibleReceiptLines: 6,
      creationRequisitePageCount: 2,
      receiptHeaderPageCount: 1,
      receiptLinePageCount: 1,
    });
    expect(get.mock.calls.some(([, params]) => params.$skip === "500")).toBe(true);
    expect(get.mock.calls.find(([resource]) => resource === "Document_ПриходнаяНакладная")?.[1].$filter)
      .toBe("Posted eq true and DeletionMark eq false and PS_ЭтоИмпортТМЦ eq true and ВидОперации eq 'ПоступлениеОтПоставщика'");
  });

  it("does not activate NEW from creation alone and excludes ineligible headers", async () => {
    const get = vi.fn(async (resource: string) => {
      if (resource.startsWith("Catalog_")) return { value: [creation(1)] };
      if (resource === "Document_ПриходнаяНакладная") return { value: [{
        Ref_Key: receipts[0][0], Date: receipts[0][1], Posted: false,
        DeletionMark: false, PS_ЭтоИмпортТМЦ: true,
        ВидОперации: "ПоступлениеОтПоставщика",
      }] };
      return { value: [] };
    });
    const snapshot = await new OneCProductNewProvider({ get }).fetchSnapshot([DHI]);
    expect(snapshot.facts[0]).toMatchObject({
      sourceCreatedAt: "2022-07-13T00:00:00",
      marketEntryAt: null,
      sourceStatus: "missing_market_entry",
    });
    expect(snapshot.totalEligibleReceipts).toBe(0);
  });

  it("requires the exact Edm.DateTime creation type", async () => {
    const get = vi.fn(async (resource: string) => resource.startsWith("Catalog_")
      ? { value: [{ ...creation(1), Значение_Type: "Edm.String" }] }
      : { value: [] });
    const snapshot = await new OneCProductNewProvider({ get }).fetchSnapshot([DHI]);
    expect(snapshot.facts[0]).toMatchObject({ sourceCreatedAt: null, sourceStatus: "invalid_creation" });
  });

  it("continues when 1C supplies an explicit OData continuation below the requested page size", async () => {
    const get = vi.fn(async (resource: string, params: Record<string, string>) => {
      if (resource.startsWith("Catalog_")) return params.$skip === "0"
        ? { value: [creation(1)], "@odata.nextLink": "https://erp.example/odata/Catalog_Номенклатура_ДополнительныеРеквизиты?$skiptoken=opaque-cursor&$top=500" }
        : { value: [] };
      return { value: [] };
    });
    const snapshot = await new OneCProductNewProvider({ get }).fetchSnapshot([DHI]);
    expect(snapshot.creationRequisitePageCount).toBe(2);
    expect(get.mock.calls.some(([, params]) => params.$skiptoken === "opaque-cursor")).toBe(true);
  });

  it("attaches bounded source context without credentials or query values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      "odata.error": { message: { value: "Unknown field 'secret-value'" } },
    }), { status: 400, headers: { "content-type": "application/json;charset=utf-8" } })));
    const provider = new OneCProductNewProvider({
      baseUrl: "https://embedded-user:embedded-password@erp-api.nsd.md:8443/novotech/odata/standard.odata/",
      username: "service-user",
      password: "service-password",
      requestTimeoutMs: 10_000,
    });

    let failure: unknown;
    try {
      await provider.fetchSnapshot([DHI]);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(OneCODataProviderError);
    expect(getProductNewSourceRequestDiagnostic(failure)).toMatchObject({
      resourceName: expect.stringMatching(/^Catalog_/),
      requestMethod: "GET",
      sanitizedEndpoint: expect.stringMatching(/^https:\/\/erp-api\.nsd\.md:8443\/novotech\/odata\/standard\.odata\/Catalog_/),
      httpStatus: 400,
      responseContentType: "application/json;charset=utf-8",
      networkCategory: "odata_error",
      pageNumber: 1,
      pageSize: 500,
      odataFilterName: "creation_requisite_ref",
      safeErrorExcerpt: "Unknown field '[redacted]'",
    });
    expect(JSON.stringify(getProductNewSourceRequestDiagnostic(failure))).not.toContain("embedded-password");
    expect(JSON.stringify(getProductNewSourceRequestDiagnostic(failure))).not.toContain("service-password");
  });
});

function creation(LineNumber: number) {
  return {
    Ref_Key: DHI, LineNumber, Свойство_Key: CREATION_REF,
    Значение: "2022-07-13T00:00:00", ТекстоваяСтрока: "",
    Значение_Type: "Edm.DateTime",
  };
}
