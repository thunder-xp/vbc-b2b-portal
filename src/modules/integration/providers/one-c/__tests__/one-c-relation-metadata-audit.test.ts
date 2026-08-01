import { afterEach, describe, expect, it, vi } from "vitest";

import { auditOneCRelationMetadata } from "../one-c-relation-metadata-audit";

const config = {
  baseUrl: "https://erp.example/odata/standard.odata",
  username: "user",
  password: "secret",
  requestTimeoutMs: 10_000,
};

describe("auditOneCRelationMetadata", () => {
  afterEach(() => vi.restoreAllMocks());

  it("finds namespaced relation entities and maps their entity sets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(`
      <edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
        <edmx:DataServices>
          <Schema xmlns="http://schemas.microsoft.com/ado/2009/11/edm" Namespace="StandardODATA">
            <EntityType Name="InformationRegister_АналогиНоменклатуры">
              <Key><PropertyRef Name="RecordKey" /></Key>
              <Property Name="RecordKey" Type="Edm.String" Nullable="false" />
              <Property Name="Номенклатура_Key" Type="Edm.Guid" Nullable="false" />
              <Property Name="Аналог_Key" Type="Edm.Guid" Nullable="false" />
            </EntityType>
            <EntityType Name="InformationRegister_Комплектация">
              <Property Name="ОсновнаяНоменклатура_Key" Type="Edm.Guid" Nullable="false" />
              <Property Name="СвязаннаяНоменклатура_Key" Type="Edm.Guid" Nullable="false" />
            </EntityType>
            <EntityContainer Name="StandardODATA">
              <EntitySet Name="InformationRegister_АналогиНоменклатуры" EntityType="StandardODATA.InformationRegister_АналогиНоменклатуры" />
              <EntitySet Name="InformationRegister_Комплектация" EntityType="StandardODATA.InformationRegister_Комплектация" />
            </EntityContainer>
          </Schema>
        </edmx:DataServices>
      </edmx:Edmx>
    `, { status: 200, headers: { "content-type": "application/xml" } }));

    const result = await auditOneCRelationMetadata(config);

    expect(result.candidateCount).toBe(2);
    expect(result.exactTermOccurrences).toEqual([
      { term: "Аналог", count: 4 },
      { term: "Сопутств", count: 0 },
    ]);
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: "InformationRegister_АналогиНоменклатуры",
        entitySet: "InformationRegister_АналогиНоменклатуры",
        keys: ["RecordKey"],
        matchedBy: "relation_term",
      }),
      expect.objectContaining({
        entityType: "InformationRegister_Комплектация",
        matchedBy: "relation_term",
      }),
    ]));
    expect(fetch).toHaveBeenCalledWith(
      "https://erp.example/odata/standard.odata/$metadata",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/xml" }),
      }),
    );
  });
});
