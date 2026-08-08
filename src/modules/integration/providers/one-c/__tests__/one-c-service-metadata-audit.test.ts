import { afterEach, describe, expect, it, vi } from "vitest";

import { auditOneCServiceMetadata, auditOneCServiceSource } from "../one-c-service-metadata-audit";

const config = {
  baseUrl: "https://erp.example/odata/standard.odata",
  username: "user",
  password: "secret",
  requestTimeoutMs: 1_000,
};

describe("auditOneCServiceMetadata", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns only repair-related entity contracts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(metadata(), {
      status: 200,
      headers: { "content-type": "application/xml" },
    })));

    const result = await auditOneCServiceMetadata(config);

    expect(result.candidateCount).toBe(2);
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entitySet: "Document_ПриемИПередачаВРемонт",
        keys: ["Ref_Key"],
        matchedTerms: expect.arrayContaining(["ПриемИПередачаВРемонт", "Ремонт"]),
        properties: expect.arrayContaining([
          expect.objectContaining({ name: "СостояниеРемонта_Key" }),
        ]),
      }),
      expect.objectContaining({ entitySet: "Catalog_СерииНоменклатуры" }),
    ]));
  });

  it("requires protected 1C configuration", async () => {
    await expect(auditOneCServiceMetadata({ ...config, password: null })).rejects.toThrow(
      "1C OData is not configured.",
    );
  });

  it("audits live source shape without returning protected values", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([{ Ref_Key: "doc", DataVersion: "v1", Number: "SRV-1", Date: "2026-08-08T10:00:00", Posted: true, DeletionMark: false, Контрагент_Key: "buyer", Номенклатура_Key: "product", Серия_Key: "serial", СостояниеРемонта_Key: "status", ОписаниеНеисправности: "private fault", ОписаниеРемонта: "private result" }]))
      .mockResolvedValueOnce(json([{ Ref_Key: "status", Code: "1", Description: "Принят в ремонт", DeletionMark: false }])));

    const result = await auditOneCServiceSource(config);

    expect(result.rowsReceived).toBe(1);
    expect(result.representativeRows[0]).toMatchObject({
      number: "SRV-1",
      statusDescription: "Принят в ремонт",
      reportedFaultLength: 13,
      repairResultLength: 14,
    });
    expect(JSON.stringify(result)).not.toContain("private fault");
    expect(JSON.stringify(result)).not.toContain("private result");
    expect(JSON.stringify(result)).not.toContain("buyer");
  });
});

function json(value: unknown[]): Response {
  return new Response(JSON.stringify({ value }), { status: 200, headers: { "content-type": "application/json" } });
}

function metadata(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
    <edmx:DataServices>
      <Schema xmlns="http://schemas.microsoft.com/ado/2008/09/edm" Namespace="StandardODATA">
        <EntityType Name="Document_ПриемИПередачаВРемонт">
          <Key><PropertyRef Name="Ref_Key" /></Key>
          <Property Name="Ref_Key" Type="Edm.Guid" Nullable="false" />
          <Property Name="СостояниеРемонта_Key" Type="Edm.Guid" Nullable="true" />
        </EntityType>
        <EntityType Name="Catalog_СерииНоменклатуры">
          <Key><PropertyRef Name="Ref_Key" /></Key>
          <Property Name="Ref_Key" Type="Edm.Guid" Nullable="false" />
        </EntityType>
        <EntityType Name="Catalog_Контрагенты">
          <Key><PropertyRef Name="Ref_Key" /></Key>
        </EntityType>
        <EntityContainer Name="StandardODATA">
          <EntitySet Name="Document_ПриемИПередачаВРемонт" EntityType="StandardODATA.Document_ПриемИПередачаВРемонт" />
          <EntitySet Name="Catalog_СерииНоменклатуры" EntityType="StandardODATA.Catalog_СерииНоменклатуры" />
          <EntitySet Name="Catalog_Контрагенты" EntityType="StandardODATA.Catalog_Контрагенты" />
        </EntityContainer>
      </Schema>
    </edmx:DataServices>
  </edmx:Edmx>`;
}
