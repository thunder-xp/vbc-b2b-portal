import { describe, expect, it, vi } from "vitest";
import { OneCODataHttpError, type OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { OneCWarrantySerialProvider } from "../one-c-warranty-serial.provider";

const saleRef = "11111111-1111-1111-1111-111111111111";
const returnRef = "22222222-2222-2222-2222-222222222222";
const buyerRef = "33333333-3333-3333-3333-333333333333";
const productRef = "44444444-4444-4444-4444-444444444444";
const serialRef = "55555555-5555-5555-5555-555555555555";

describe("OneCWarrantySerialProvider", () => {
  it("retries bounded transient 1C server failures", async () => {
    const diagnostic = { failedStage: "http_response", receivedContentType: "application/json", requestKind: "warranty_sale_headers", resourceName: "Document", queryParameterNames: [], statusCode: 500, jsonParseFailure: false, parseErrorName: null, bodyLength: 0, bomDetected: false, emptyBody: false };
    const getLiteralDateRange = vi.fn()
      .mockRejectedValueOnce(new OneCODataHttpError(diagnostic))
      .mockResolvedValue({ value: [] });
    const provider = new OneCWarrantySerialProvider({ get: vi.fn(), getLiteralDateRange } as unknown as OneCODataClient);

    await expect(provider.fetchPage({ stage: "sale_scan", skip: 0, top: 25, rangeStart: "2021-01-01", rangeEnd: "2026-08-06" })).resolves.toMatchObject({ headersReceived: 0, pageComplete: true });
    expect(getLiteralDateRange).toHaveBeenCalledTimes(2);
  });

  it("joins serials to exact stock lines and caches product and serial catalog reads", async () => {
    const get = vi.fn(async (resource: string) => {
      if (resource.startsWith("Document_РасходнаяНакладная(")) return detail(saleRef);
      if (resource.startsWith("Catalog_СерииНоменклатуры")) return { Ref_Key: serialRef, Description: " ab-12 ", DeletionMark: false };
      if (resource.startsWith("Catalog_Номенклатура")) return { Ref_Key: productRef, Артикул: "400123", Description: "Camera", ГарантийныйСрок: "36", DeletionMark: false, Недействителен: false };
      throw new Error(resource);
    });
    const getLiteralDateRange = vi.fn().mockResolvedValue({ value: [header(saleRef)] });
    const result = await new OneCWarrantySerialProvider({ get, getLiteralDateRange } as unknown as OneCODataClient).fetchPage({ stage: "sale_scan", skip: 0, top: 25, rangeStart: "2021-01-01", rangeEnd: "2026-08-06" });
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({ serial: "ab-12", productRef, counterpartyRef: buyerRef, sourceLinkKey: "A", warrantyMonthsSnapshot: 36, eventType: "sale_observed" });
    expect(get.mock.calls.filter(([resource]) => String(resource).startsWith("Catalog_СерииНоменклатуры"))).toHaveLength(1);
    expect(get.mock.calls.filter(([resource]) => String(resource).startsWith("Catalog_Номенклатура"))).toHaveLength(1);
    expect(getLiteralDateRange).toHaveBeenCalledWith("Document_РасходнаяНакладная", expect.objectContaining({ top: 25, skip: 0 }), expect.anything());
  });

  it("creates conflict evidence when a return lacks an exact source sale", async () => {
    const get = vi.fn(async (resource: string) => {
      if (resource.startsWith("Document_ПриходнаяНакладная(")) return { ...detail(returnRef), ВидОперации: "ВозвратОтПокупателя", ДокументОснование: null, ДокументОснование_Type: null };
      if (resource.startsWith("Catalog_СерииНоменклатуры")) return { Description: "SERIAL-1", DeletionMark: false };
      if (resource.startsWith("Catalog_Номенклатура")) return { Артикул: "400123", Description: "Camera", ГарантийныйСрок: 36, DeletionMark: false };
      throw new Error(resource);
    });
    const getLiteralDateRange = vi.fn().mockResolvedValue({ value: [{ ...header(returnRef), ВидОперации: "ВозвратОтПокупателя" }] });
    const result = await new OneCWarrantySerialProvider({ get, getLiteralDateRange } as unknown as OneCODataClient).fetchPage({ stage: "return_scan", skip: 0, top: 25, rangeStart: "2021-01-01", rangeEnd: "2026-08-06" });
    expect(result.events[0]).toMatchObject({ eventType: "conflict_observed", mappingState: "conflict", reviewReasonCodes: ["return_source_sale_missing"] });
  });
});

function header(ref: string) { return { Ref_Key: ref, DataVersion: "v1", Number: "NS-1", Date: "2026-08-01T10:00:00", Posted: true, DeletionMark: false, Контрагент_Key: buyerRef }; }
function detail(ref: string) { return { ...header(ref), Организация_Key: "66666666-6666-6666-6666-666666666666", СтруктурнаяЕдиница_Key: "77777777-7777-7777-7777-777777777777", Запасы: [{ LineNumber: 1, КлючСвязи: "A", Номенклатура_Key: productRef, Характеристика_Key: "00000000-0000-0000-0000-000000000000", Количество: 1 }, { LineNumber: 2, КлючСвязи: "B", Номенклатура_Key: productRef, Количество: 1 }], СерииНоменклатуры: [{ LineNumber: 1, КлючСвязи: "A", Серия_Key: serialRef, Количество: 1 }, { LineNumber: 2, КлючСвязи: "B", Серия_Key: serialRef, Количество: 1 }] }; }
