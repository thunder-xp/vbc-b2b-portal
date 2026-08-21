import { afterEach, describe, expect, it, vi } from "vitest";

import type { OneCEnv } from "@/src/lib/env";

import { OneCCounterpartyDirectorySource } from "../one-c-counterparty-directory.source";

const MULTI_REF = "9a5c59b8-0293-11f1-d58d-7239d3b7bd5c";

describe("OneCCounterpartyDirectorySource completeness", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the complete bounded collection and includes MULTI-SECURITY beyond the legacy first page", async () => {
    const counterparties = Array.from({ length: 1_473 }, (_, index) => ({
      Ref_Key: index === 1_200 ? MULTI_REF : guidFor(index),
      Code: `C-${index}`,
      Description: index === 1_200 ? "MULTI-SECURITY" : `Company ${index}`,
      ИНН: index === 1_200 ? "1020602003976" : String(1_000_000_000_000 + index),
      Покупатель: true,
      Поставщик: false,
      Недействителен: false,
      DeletionMark: false,
      IsFolder: false,
    }));
    const requestUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      requestUrls.push(url);
      const value = url.includes("Catalog_%D0%9A%D0%BE%D0%BD%D1%82%D1%80%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%8B") || url.includes("Catalog_Контрагенты")
        ? counterparties
        : [];
      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }));

    const snapshot = await new OneCCounterpartyDirectorySource(env()).load();

    expect(snapshot).toMatchObject({
      complete: true,
      fetchedCounterpartyRows: 1_473,
      sourceCounterpartyRows: 1_473,
      duplicateCounterpartyRows: 0,
      pagesProcessed: 5,
    });
    expect(snapshot.counterparties).toContainEqual(expect.objectContaining({
      external1cId: MULTI_REF,
      name: "MULTI-SECURITY",
      normalizedFiscalCode: "1020602003976",
    }));
    expect(requestUrls).toHaveLength(5);
    expect(requestUrls.every((url) => url.includes("$top=5000") && url.includes("$skip=0")))
      .toBe(true);
  });

  it("marks repeated authoritative references as incomplete", async () => {
    const duplicate = {
      Ref_Key: MULTI_REF,
      Description: "MULTI-SECURITY",
      ИНН: "1020602003976",
    };
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => new Response(
      JSON.stringify({ value: String(input).includes("Catalog_Контрагенты") ? [duplicate, duplicate] : [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    await expect(new OneCCounterpartyDirectorySource(env()).load()).resolves.toMatchObject({
      complete: false,
      duplicateCounterpartyRows: 1,
    });
  });

  it("marks only customer contracts from the default-contract register", async () => {
    const customerContractRef = "e5baa428-8919-11ee-129a-7239d3b7bd5c";
    const supplierContractRef = "246116a4-e4e6-11ed-0899-7239d3b7bd5c";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      const value = url.includes("Catalog_Контрагенты")
        ? [{ Ref_Key: MULTI_REF, Description: "MULTI-SECURITY", Покупатель: true }]
        : url.includes("Catalog_ДоговорыКонтрагентов")
          ? [
              contractRow(customerContractRef, "СПокупателем"),
              contractRow(supplierContractRef, "СПоставщиком"),
            ]
          : url.includes("InformationRegister_ОсновныеДоговорыКонтрагента")
            ? [
                { Договор_Key: customerContractRef, ВидДоговора: "СПокупателем" },
                { Договор_Key: supplierContractRef, ВидДоговора: "СПоставщиком" },
              ]
            : [];
      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const snapshot = await new OneCCounterpartyDirectorySource(env()).load();

    expect(snapshot.contracts).toEqual(expect.arrayContaining([
      expect.objectContaining({ external1cId: customerContractRef, isDefault: true }),
      expect.objectContaining({ external1cId: supplierContractRef, isDefault: false }),
    ]));
  });
});

function contractRow(reference: string, contractType: string) {
  return {
    Ref_Key: reference,
    Code: reference.slice(0, 8),
    Description: reference,
    Owner: MULTI_REF,
    Owner_Type: "StandardODATA.Catalog_Контрагенты",
    ВидДоговора: contractType,
    Недействителен: false,
    DeletionMark: false,
  };
}

function env(): OneCEnv {
  return {
    baseUrl: "https://onec.example.test/odata/standard.odata",
    username: "user",
    password: "password",
    requestTimeoutMs: 10_000,
  } as OneCEnv;
}

function guidFor(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-1111-1111-1111-${index.toString(16).padStart(12, "0")}`;
}
