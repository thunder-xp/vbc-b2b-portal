import { afterEach, describe, expect, it, vi } from "vitest";

import type { OneCEnv } from "@/src/lib/env";

import {
  ONE_C_FINAL_CUSTOMER_PROPERTIES,
  OneCFinalCustomerProvider,
} from "../one-c-customer.provider";

const config = {
  baseUrl: "https://erp.example/odata",
  username: "user",
  password: "secret",
  requestTimeoutMs: 10_000,
} as OneCEnv;

const request = {
  customerIdentityId: "11111111-1111-4111-8111-111111111111",
  provisioningJobId: "22222222-2222-4222-8222-222222222222",
  sourceOrderId: "33333333-3333-4333-8333-333333333333",
  operationKey: "44444444-4444-4444-8444-444444444444",
  customerKind: "PERSON" as const,
  displayName: "Maria Test",
  verifiedPhone: "+37369000111",
  email: "maria@example.test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OneCFinalCustomerProvider", () => {
  it("audits the production-shaped search/contact contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: URL | RequestInfo) =>
      String(input).endsWith("/$metadata")
        ? Promise.resolve(xmlResponse(metadata()))
        : Promise.resolve(jsonResponse({ value: [counterparty()] })),
    ));

    const audit = await new OneCFinalCustomerProvider(config).auditContract();

    expect(audit).toMatchObject({
      passed: true,
      entitySet: "Catalog_Контрагенты",
      phoneLookupProperty: "НомерТелефонаДляПоиска",
      emailLookupProperty: "АдресЭПДляПоиска",
      contactCollectionProperty: "КонтактнаяИнформация",
      createContractProven: false,
      createBlocker: "ONE_C_CONTACT_KIND_AND_CREATE_CONTRACT_NOT_PROVEN",
      lookupProjectionProbe: "PASS",
    });
    expect(audit.missingProperties).toEqual([]);
  });

  it("discovers by bounded search fields and validates all authoritative contact rows", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL | RequestInfo) => {
      const url = decodeURIComponent(String(input));
      if (url.endsWith("/$metadata")) return Promise.resolve(xmlResponse(metadata()));
      return Promise.resolve(jsonResponse({ value: [counterparty()] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OneCFinalCustomerProvider(config).findCandidates(request);

    expect(result.value).toEqual([expect.objectContaining({
      phones: ["+37369000111", "+37368000222"],
      emails: ["maria@example.test"],
    })]);
    const urls = fetchMock.mock.calls.slice(1).map(([input]) => decodeURIComponent(String(input)));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("substringof('69000111',НомерТелефонаДляПоиска) eq true");
    expect(urls[1]).toContain("substringof('maria@example.test',АдресЭПДляПоиска) eq true");
    expect(urls.every((url) => url.includes("КонтактнаяИнформация"))).toBe(true);
  });

  it("keeps create fail-closed without issuing an OData POST", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OneCFinalCustomerProvider(config).create(request))
      .rejects.toMatchObject({ code: "ONE_C_CUSTOMER_CREATE_CONTRACT_NOT_PROVEN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function counterparty() {
  return {
    Ref_Key: "55555555-5555-4555-8555-555555555555",
    Description: "Maria Test",
    НаименованиеПолное: "Maria Test",
    ВидКонтрагента: "ФизическоеЛицо",
    Покупатель: true,
    Поставщик: false,
    Недействителен: false,
    DeletionMark: false,
    IsFolder: false,
    НомерТелефонаДляПоиска: "69000111",
    АдресЭПДляПоиска: "maria@example.test",
    Комментарий: "",
    КонтактнаяИнформация: [
      { Тип: "Телефон", НомерТелефонаБезКодов: "37369000111", НомерТелефона: "+373 69 000 111" },
      { Тип: "Телефон", НомерТелефона: "068000222" },
      { Тип: "АдресЭлектроннойПочты", АдресЭП: "MARIA@example.test" },
    ],
  };
}

function metadata() {
  const properties = ONE_C_FINAL_CUSTOMER_PROPERTIES
    .map((name) => `<Property Name="${name}" Type="Edm.String" Nullable="true" />`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
    <Schema Namespace="StandardODATA">
      <EntityType Name="Catalog_Контрагенты"><Key><PropertyRef Name="Ref_Key" /></Key>${properties}</EntityType>
      <EntityContainer Name="Container"><EntitySet Name="Catalog_Контрагенты" EntityType="StandardODATA.Catalog_Контрагенты" /></EntityContainer>
    </Schema>`;
}

function xmlResponse(body: string) {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/xml" } });
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
