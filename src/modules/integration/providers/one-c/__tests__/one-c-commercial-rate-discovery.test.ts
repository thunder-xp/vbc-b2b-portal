import { afterEach, describe, expect, it, vi } from "vitest";

import type { OneCEnv } from "@/src/lib/env";

import { discoverOneCCommercialRateSources } from "../one-c-commercial-rate-discovery";

const env: OneCEnv = {
  baseUrl: "https://erp.example/odata/standard.odata",
  username: "diagnostic-user",
  password: "secret",
  catalogCategoriesPath: "",
  catalogBrandsPath: "",
  catalogProductsPath: "",
  productPricesPath: "",
  stockBalancesPath: "",
  partnerSearchPageSize: 10,
  partnerSearchMaxPages: 1,
  requestTimeoutMs: 5_000,
  authMode: "basic",
  useMockCatalog: false,
  useMockPricing: false,
  useMockInventory: false,
  useMockPartners: false,
};

const metadata = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx" Version="4.0">
  <edmx:DataServices>
    <Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="StandardODATA">
      <EntityType Name="Catalog_ВидыЦен">
        <Property Name="Ref_Key" Type="Edm.Guid" />
        <Property Name="Code" Type="Edm.String" />
        <Property Name="Description" Type="Edm.String" />
        <Property Name="Курс" Type="Edm.Decimal" />
        <Property Name="Password" Type="Edm.String" />
        <Property Name="ЦеновыеГруппы" Type="Collection(StandardODATA.PriceGroup)" />
      </EntityType>
      <EntityType Name="Catalog_Контрагенты">
        <Property Name="Ref_Key" Type="Edm.Guid" />
        <Property Name="Description" Type="Edm.String" />
      </EntityType>
      <EntityType Name="InformationRegister_ЦеныНоменклатуры">
        <Property Name="Period" Type="Edm.DateTime" />
        <Property Name="ВидЦен_Key" Type="Edm.Guid" />
        <Property Name="Цена" Type="Edm.Double" />
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="Catalog_ВидыЦен" EntityType="StandardODATA.Catalog_ВидыЦен" />
        <EntitySet Name="Catalog_Контрагенты" EntityType="StandardODATA.Catalog_Контрагенты" />
        <EntitySet Name="InformationRegister_ЦеныНоменклатуры" EntityType="StandardODATA.InformationRegister_ЦеныНоменклатуры" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

describe("discoverOneCCommercialRateSources", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("limits discovery to relevant metadata and bounded safe probes", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void init;
        const url = String(input);
        if (url.endsWith("/$metadata")) {
          return new Response(metadata, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
          });
        }
        return Response.json({
          value: [
            {
              Ref_Key: "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c",
              Code: "113",
              Description: "BCRU",
              Курс: 17.3504,
              Password: "must-not-leak",
            },
          ],
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await discoverOneCCommercialRateSources(env);

    expect(result.metadata.relevantEntities).toHaveLength(2);
    expect(result.metadata.relevantEntities[0]?.entity).toBe("Catalog_ВидыЦен");
    expect(
      result.metadata.relevantEntities[0]?.properties.map(({ name }) => name),
    ).not.toContain("Password");
    expect(
      result.metadata.relevantEntities[0]?.properties.map(({ name }) => name),
    ).not.toContain("ЦеновыеГруппы");
    expect(result.probes.map(({ kind }) => kind).sort()).toEqual([
      "code_113",
      "code_999",
      "known_ref",
      "recent_candidate",
    ]);
    expect(
      result.probes.every(({ rows }) =>
        rows.every((row) => !("Password" in row)),
      ),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.cache === "no-store"),
    ).toBe(true);
  });
});
